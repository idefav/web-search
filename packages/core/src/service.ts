import { randomUUID } from "node:crypto";
import type { FetchRequest, FetchResponse, SearchRequest, SearchResponse } from "./contracts.js";
import { CamofoxClient, CamofoxHttpError, mapCamofoxError } from "./camofox-client.js";
import { WebToolError } from "./errors.js";
import { assertSafePublicUrl, type Resolver } from "./safety.js";
import { SlotSemaphore } from "./semaphore.js";
import { createBuiltinSearchProviders, type SearchProvider } from "./search-providers.js";

export type ProviderAttemptOutcome = "success" | "blocked" | "timeout" | "unavailable" | "contract_changed" | "circuit_open" | "unsupported";

export interface ProviderAttemptEvent {
  requestId: string;
  provider: string;
  outcome: ProviderAttemptOutcome;
  durationMs: number;
}

export interface ServiceOptions {
  concurrency?: number;
  maxQueue?: number;
  queueTimeoutMs?: number;
  operationTimeoutMs?: number;
  providerTimeoutMs?: number;
  providerCooldownMs?: number;
  providers?: readonly SearchProvider[];
  onProviderAttempt?: (event: ProviderAttemptEvent) => void;
  onProviderFallback?: (event: { requestId: string; from: string; to: string }) => void;
  resolver?: Resolver;
  now?: () => Date;
  id?: () => string;
}

function combineSignals(parent: AbortSignal | undefined, timeoutMs: number): { signal: AbortSignal; cleanup: () => void } {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new DOMException("Timed out", "TimeoutError")), timeoutMs);
  const abort = () => controller.abort(parent?.reason);
  if (parent?.aborted) abort();
  else parent?.addEventListener("abort", abort, { once: true });
  return { signal: controller.signal, cleanup: () => { clearTimeout(timer); parent?.removeEventListener("abort", abort); } };
}

function shouldRetry(error: unknown): boolean {
  return error instanceof CamofoxHttpError && [410, 503, 504].includes(error.status);
}

export class WebSearchService {
  private readonly semaphore: SlotSemaphore;
  private readonly timeoutMs: number;
  private readonly resolver?: Resolver;
  private readonly now: () => Date;
  private readonly id: () => string;
  private readonly providers: readonly SearchProvider[];
  private readonly providerSemaphores = new Map<string, SlotSemaphore>();
  private readonly providerTimeoutMs: number;
  private readonly providerCooldownMs: number;
  private readonly circuits = new Map<string, { blockedUntil: number; probeInFlight: boolean }>();
  private readonly onProviderAttempt?: (event: ProviderAttemptEvent) => void;
  private readonly onProviderFallback?: (event: { requestId: string; from: string; to: string }) => void;

  constructor(private readonly camofox: CamofoxClient, options: ServiceOptions = {}) {
    this.semaphore = new SlotSemaphore(options.concurrency ?? 3, options.maxQueue ?? 20, options.queueTimeoutMs ?? 5_000);
    this.timeoutMs = options.operationTimeoutMs ?? 45_000;
    this.providerTimeoutMs = options.providerTimeoutMs ?? 15_000;
    this.providerCooldownMs = options.providerCooldownMs ?? 300_000;
    this.resolver = options.resolver;
    this.now = options.now ?? (() => new Date());
    this.id = options.id ?? randomUUID;
    this.providers = options.providers ?? createBuiltinSearchProviders();
    if (this.providers.length === 0) throw new Error("At least one search provider is required");
    this.onProviderAttempt = options.onProviderAttempt;
    this.onProviderFallback = options.onProviderFallback;
    for (const provider of this.providers) {
      if (provider.concurrency) {
        this.providerSemaphores.set(provider.id, new SlotSemaphore(provider.concurrency, options.maxQueue ?? 20, options.queueTimeoutMs ?? 5_000));
      }
      this.circuits.set(provider.id, { blockedUntil: 0, probeInFlight: false });
    }
  }

  async search(input: SearchRequest, parentSignal?: AbortSignal): Promise<SearchResponse> {
    const lease = await this.semaphore.acquire();
    const requestId = this.id();
    const timed = combineSignals(parentSignal, this.timeoutMs);
    try {
      const failures: WebToolError[] = [];
      let considered = 0;
      for (const provider of this.providers) {
        if (timed.signal.aborted) throw new WebToolError("upstream_timeout", "The search operation timed out", true);
        const attempt = await this.searchProvider(provider, input, requestId, lease.slot, timed.signal);
        if (attempt.kind === "skipped") {
          considered += 1;
          if (attempt.error) failures.push(attempt.error);
          continue;
        }
        considered += 1;
        if (attempt.kind === "failed") {
          failures.push(attempt.error);
          continue;
        }
        const warnings = attempt.results.length === 0 ? ["no_results"] : attempt.results.length < input.count ? ["partial_results"] : [];
        if (considered > 1) {
          warnings.unshift("provider_fallback");
          this.onProviderFallback?.({ requestId, from: this.providers[0]?.id ?? provider.id, to: provider.id });
        }
        return {
          request_id: requestId,
          query: input.query,
          provider: provider.id,
          fetched_at: this.now().toISOString(),
          results: attempt.results,
          warnings
        };
      }
      throw this.aggregateSearchFailure(failures);
    } catch (error) {
      throw mapCamofoxError(error);
    } finally {
      timed.cleanup();
      lease.release();
    }
  }

  async fetchPage(input: FetchRequest, parentSignal?: AbortSignal): Promise<FetchResponse> {
    const lease = await this.semaphore.acquire();
    const requestId = this.id();
    const userId = `web-fetch-${requestId}`;
    const timed = combineSignals(parentSignal, this.timeoutMs);
    try {
      await assertSafePublicUrl(input.url, this.resolver);
      const result = await this.withRetry(() => this.runFetchTab(userId, requestId, input, timed.signal));
      await assertSafePublicUrl(result.url, this.resolver);
      if (!result.content.trim() && input.offset === 0) {
        throw new WebToolError("unsupported_content", "The page did not expose readable accessibility text");
      }
      return {
        request_id: requestId,
        requested_url: input.url,
        final_url: result.url,
        content_format: "accessibility_text",
        content: result.content,
        total_chars: result.totalChars,
        truncated: result.nextOffset !== null,
        next_offset: result.nextOffset,
        fetched_at: this.now().toISOString()
      };
    } catch (error) {
      throw mapCamofoxError(error);
    } finally {
      await this.camofox.deleteSession(userId, AbortSignal.timeout(5_000)).catch(() => undefined);
      timed.cleanup();
      lease.release();
    }
  }

  providerCircuitStates(): Array<{ provider: string; open: boolean; retryAfterSeconds: number }> {
    const now = this.now().getTime();
    return this.providers.map((provider) => {
      const circuit = this.circuits.get(provider.id);
      const remaining = Math.max(0, (circuit?.blockedUntil ?? 0) - now);
      return { provider: provider.id, open: remaining > 0 || circuit?.probeInFlight === true, retryAfterSeconds: Math.ceil(remaining / 1_000) };
    });
  }

  private async withRetry<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (!shouldRetry(error)) throw error;
      return operation();
    }
  }

  private async searchProvider(
    provider: SearchProvider,
    input: SearchRequest,
    requestId: string,
    slot: number,
    signal: AbortSignal
  ): Promise<{ kind: "success"; results: SearchResponse["results"] } | { kind: "failed"; error: WebToolError } | { kind: "skipped"; error?: WebToolError }> {
    const started = Date.now();
    if (!provider.supports(input)) {
      this.emitProviderAttempt(requestId, provider.id, "unsupported", started);
      return { kind: "skipped" };
    }
    const openError = this.openCircuitError(provider.id);
    if (openError) {
      this.emitProviderAttempt(requestId, provider.id, "circuit_open", started);
      return { kind: "skipped", error: openError };
    }
    let providerLease: Awaited<ReturnType<SlotSemaphore["acquire"]>> | undefined;
    let attemptRecorded = false;
    try {
      providerLease = await this.providerSemaphores.get(provider.id)?.acquire();
      const admitted = this.enterCircuit(provider.id);
      if (!admitted) {
        const error = this.openCircuitError(provider.id) ?? new WebToolError("search_blocked", `${provider.id} is cooling down`, true);
        this.emitProviderAttempt(requestId, provider.id, "circuit_open", started);
        return { kind: "skipped", error };
      }
      const attempt = combineSignals(signal, this.providerTimeoutMs);
      try {
        const url = provider.buildUrl(input);
        const userId = `web-search-${provider.id}-slot-${slot}`;
        const snapshot = await this.withRetry(() => this.runSearchTab(userId, `${requestId}-${provider.id}`, url, attempt.signal));
        if (provider.isBlocked(snapshot.snapshot, snapshot.url)) {
          throw new WebToolError("search_blocked", `${provider.id} blocked this browser or proxy`, true);
        }
        const results = provider.parse(snapshot.snapshot, input.count);
        if (results.length === 0 && !provider.isNoResults(snapshot.snapshot)) {
          throw new WebToolError("search_blocked", `${provider.id} returned a challenge or incomplete result page`, true);
        }
        this.closeCircuit(provider.id);
        this.emitProviderAttempt(requestId, provider.id, "success", started);
        return { kind: "success", results };
      } catch (error) {
        const mapped = mapCamofoxError(error);
        if (mapped.code === "search_blocked") this.blockCircuit(provider.id);
        else this.finishProbe(provider.id);
        this.emitProviderAttempt(requestId, provider.id, this.outcomeFor(mapped), started);
        attemptRecorded = true;
        if (signal.aborted) throw mapped;
        return { kind: "failed", error: mapped };
      } finally {
        attempt.cleanup();
      }
    } catch (error) {
      const mapped = mapCamofoxError(error);
      this.finishProbe(provider.id);
      if (!attemptRecorded) this.emitProviderAttempt(requestId, provider.id, this.outcomeFor(mapped), started);
      if (signal.aborted) throw mapped;
      return { kind: "failed", error: mapped };
    } finally {
      providerLease?.release();
    }
  }

  private async runSearchTab(userId: string, sessionKey: string, url: string, signal: AbortSignal) {
    const { tabId } = await this.camofox.createTab(userId, sessionKey, signal);
    try {
      const navigation = await this.camofox.navigate(tabId, userId, sessionKey, url, signal);
      if (navigation.googleBlocked) throw new WebToolError("search_blocked", "The search engine blocked this browser or proxy", true);
      if (navigation.ok === false) throw new WebToolError("upstream_unavailable", "The browser could not navigate to the search engine", true);
      return await this.camofox.snapshot(tabId, userId, 0, signal);
    } finally {
      await this.camofox.closeTab(tabId, userId, AbortSignal.timeout(5_000)).catch(() => undefined);
    }
  }

  private emitProviderAttempt(requestId: string, provider: string, outcome: ProviderAttemptOutcome, started: number): void {
    this.onProviderAttempt?.({ requestId, provider, outcome, durationMs: Math.max(0, Date.now() - started) });
  }

  private outcomeFor(error: WebToolError): ProviderAttemptOutcome {
    if (error.code === "search_blocked") return "blocked";
    if (error.code === "upstream_timeout") return "timeout";
    if (error.code === "upstream_contract_changed") return "contract_changed";
    return "unavailable";
  }

  private enterCircuit(provider: string): boolean {
    const circuit = this.circuits.get(provider);
    if (!circuit) return true;
    const now = this.now().getTime();
    if (circuit.blockedUntil > now) return false;
    if (circuit.blockedUntil > 0) {
      if (circuit.probeInFlight) return false;
      circuit.probeInFlight = true;
    }
    return true;
  }

  private openCircuitError(provider: string): WebToolError | undefined {
    const circuit = this.circuits.get(provider);
    if (!circuit) return undefined;
    const remainingMs = circuit.blockedUntil - this.now().getTime();
    if (remainingMs <= 0 && !circuit.probeInFlight) return undefined;
    const retryAfter = remainingMs > 0 ? Math.max(1, Math.ceil(remainingMs / 1_000)) : 1;
    return new WebToolError("search_blocked", `${provider} is cooling down after a blocked search`, true, 503, undefined, retryAfter);
  }

  private blockCircuit(provider: string): void {
    const circuit = this.circuits.get(provider);
    if (!circuit) return;
    circuit.blockedUntil = this.now().getTime() + this.providerCooldownMs;
    circuit.probeInFlight = false;
  }

  private closeCircuit(provider: string): void {
    const circuit = this.circuits.get(provider);
    if (!circuit) return;
    circuit.blockedUntil = 0;
    circuit.probeInFlight = false;
  }

  private finishProbe(provider: string): void {
    const circuit = this.circuits.get(provider);
    if (circuit) circuit.probeInFlight = false;
  }

  private aggregateSearchFailure(failures: WebToolError[]): WebToolError {
    if (failures.length === 0) return new WebToolError("invalid_input", "No configured search provider supports the requested filters");
    if (failures.every((error) => error.code === "search_blocked")) {
      const retryAfter = Math.min(...failures.map((error) => error.retryAfterSeconds ?? Math.ceil(this.providerCooldownMs / 1_000)));
      return new WebToolError("search_blocked", "All configured search providers are blocked or cooling down", true, 503, undefined, retryAfter);
    }
    if (failures.every((error) => error.code === "upstream_timeout")) {
      return new WebToolError("upstream_timeout", "All configured search providers timed out", true);
    }
    const code = failures[0]?.code;
    if (code && failures.every((error) => error.code === code)) return failures.at(-1) as WebToolError;
    return new WebToolError("upstream_unavailable", "All configured search providers failed", true);
  }

  private async runFetchTab(userId: string, sessionKey: string, input: FetchRequest, signal: AbortSignal) {
    const { tabId } = await this.camofox.createTab(userId, sessionKey, signal);
    try {
      const navigation = await this.camofox.navigate(tabId, userId, sessionKey, input.url, signal);
      const initial = await this.camofox.snapshot(tabId, userId, 0, signal);
      if (input.offset >= initial.totalChars) return { url: navigation.url || initial.url, content: "", totalChars: initial.totalChars, nextOffset: null };
      const window = input.offset > 0 ? await this.camofox.snapshot(tabId, userId, input.offset, signal) : initial;
      const content = window.snapshot.slice(0, input.max_chars);
      const next = input.offset + content.length < window.totalChars ? input.offset + content.length : null;
      return { url: navigation.url || window.url, content, totalChars: window.totalChars, nextOffset: next };
    } finally {
      await this.camofox.closeTab(tabId, userId, AbortSignal.timeout(5_000)).catch(() => undefined);
    }
  }
}
