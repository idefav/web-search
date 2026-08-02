import { randomUUID } from "node:crypto";
import type { FetchRequest, FetchResponse, SearchRequest, SearchResponse } from "./contracts.js";
import { CamofoxClient, CamofoxHttpError, mapCamofoxError } from "./camofox-client.js";
import { WebToolError } from "./errors.js";
import { isExplicitGoogleNoResults, isGoogleBlocked, parseGoogleSnapshot } from "./google-parser.js";
import { buildGoogleSearchUrl } from "./query.js";
import { assertSafePublicUrl, type Resolver } from "./safety.js";
import { SlotSemaphore } from "./semaphore.js";

export interface ServiceOptions {
  concurrency?: number;
  maxQueue?: number;
  queueTimeoutMs?: number;
  operationTimeoutMs?: number;
  resolver?: Resolver;
  now?: () => Date;
  id?: () => string;
}

function combineSignals(parent: AbortSignal | undefined, timeoutMs: number): { signal: AbortSignal; cleanup: () => void } {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new DOMException("Timed out", "TimeoutError")), timeoutMs);
  const abort = () => controller.abort(parent?.reason);
  parent?.addEventListener("abort", abort, { once: true });
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

  constructor(private readonly camofox: CamofoxClient, options: ServiceOptions = {}) {
    this.semaphore = new SlotSemaphore(options.concurrency ?? 3, options.maxQueue ?? 20, options.queueTimeoutMs ?? 5_000);
    this.timeoutMs = options.operationTimeoutMs ?? 45_000;
    this.resolver = options.resolver;
    this.now = options.now ?? (() => new Date());
    this.id = options.id ?? randomUUID;
  }

  async search(input: SearchRequest, parentSignal?: AbortSignal): Promise<SearchResponse> {
    const lease = await this.semaphore.acquire();
    const requestId = this.id();
    const userId = `web-search-slot-${lease.slot}`;
    const timed = combineSignals(parentSignal, this.timeoutMs);
    try {
      const url = buildGoogleSearchUrl(input);
      const snapshot = await this.withRetry(() => this.runTab(userId, requestId, url, timed.signal));
      if (isGoogleBlocked(snapshot.snapshot, snapshot.url)) {
        throw new WebToolError("search_blocked", "Google blocked this browser or proxy", true);
      }
      const results = parseGoogleSnapshot(snapshot.snapshot, input.count);
      if (results.length === 0 && !isExplicitGoogleNoResults(snapshot.snapshot)) {
        throw new WebToolError("search_blocked", "Google returned a challenge or incomplete result page", true);
      }
      const warnings = results.length === 0 ? ["no_results"] : results.length < input.count ? ["partial_results"] : [];
      return {
        request_id: requestId,
        query: input.query,
        provider: "google",
        fetched_at: this.now().toISOString(),
        results,
        warnings
      };
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

  private async withRetry<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (!shouldRetry(error)) throw error;
      return operation();
    }
  }

  private async runTab(userId: string, sessionKey: string, url: string, signal: AbortSignal) {
    const { tabId } = await this.camofox.createTab(userId, sessionKey, signal);
    try {
      const navigation = await this.camofox.navigate(tabId, userId, sessionKey, url, signal);
      if (navigation.googleBlocked || navigation.ok === false) throw new WebToolError("search_blocked", "Google blocked this browser or proxy", true);
      return await this.camofox.snapshot(tabId, userId, 0, signal);
    } finally {
      await this.camofox.closeTab(tabId, userId, AbortSignal.timeout(5_000)).catch(() => undefined);
    }
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
