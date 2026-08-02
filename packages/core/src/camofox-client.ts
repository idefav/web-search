import { WebToolError } from "./errors.js";

export interface NavigateResponse { ok?: boolean; tabId: string; url: string; googleBlocked?: boolean }
export interface HealthResponse {
  ok: boolean;
  browserConnected?: boolean;
  browserRunning?: boolean;
}
export interface SnapshotResponse {
  url: string;
  snapshot: string;
  totalChars: number;
  truncated?: boolean;
  hasMore?: boolean;
  nextOffset?: number | null;
}
export interface WaitResponse { ok: boolean; ready?: boolean }

export class CamofoxHttpError extends Error {
  constructor(public readonly status: number, message: string, public readonly body?: unknown) {
    super(message);
    this.name = "CamofoxHttpError";
  }
}

export class CamofoxClient {
  private readonly baseUrl: string;
  constructor(baseUrl: string, private readonly accessKey: string, private readonly fetchImpl: typeof fetch = fetch) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
  }

  private async request<T>(path: string, init: RequestInit, signal?: AbortSignal): Promise<T> {
    const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
      ...init,
      signal,
      headers: {
        accept: "application/json",
        authorization: `Bearer ${this.accessKey}`,
        ...(init.body ? { "content-type": "application/json" } : {}),
        ...init.headers
      }
    });
    const body = await response.json().catch(() => undefined);
    if (!response.ok) {
      const message = body && typeof body === "object" && "error" in body ? String(body.error) : `Camofox returned HTTP ${response.status}`;
      throw new CamofoxHttpError(response.status, message, body);
    }
    return body as T;
  }

  health(signal?: AbortSignal): Promise<HealthResponse> {
    return this.request("/health", { method: "GET", headers: { authorization: "" } }, signal);
  }

  createTab(userId: string, sessionKey: string, signal?: AbortSignal): Promise<{ tabId: string; url: string }> {
    return this.request("/tabs", { method: "POST", body: JSON.stringify({ userId, sessionKey }) }, signal);
  }

  navigate(tabId: string, userId: string, sessionKey: string, url: string, signal?: AbortSignal): Promise<NavigateResponse> {
    return this.request(`/tabs/${encodeURIComponent(tabId)}/navigate`, {
      method: "POST",
      body: JSON.stringify({ userId, sessionKey, url })
    }, signal);
  }

  snapshot(tabId: string, userId: string, offset = 0, signal?: AbortSignal): Promise<SnapshotResponse> {
    const query = new URLSearchParams({ userId, format: "text", offset: String(offset) });
    return this.request(`/tabs/${encodeURIComponent(tabId)}/snapshot?${query}`, { method: "GET" }, signal);
  }

  waitForPageReady(tabId: string, userId: string, timeout: number, signal?: AbortSignal): Promise<WaitResponse> {
    return this.request(`/tabs/${encodeURIComponent(tabId)}/wait`, {
      method: "POST",
      body: JSON.stringify({ userId, timeout })
    }, signal);
  }

  closeTab(tabId: string, userId: string, signal?: AbortSignal): Promise<void> {
    const query = new URLSearchParams({ userId });
    return this.request(`/tabs/${encodeURIComponent(tabId)}?${query}`, { method: "DELETE" }, signal).then(() => undefined);
  }

  deleteSession(userId: string, signal?: AbortSignal): Promise<void> {
    return this.request(`/sessions/${encodeURIComponent(userId)}`, { method: "DELETE" }, signal).then(() => undefined);
  }
}

export function mapCamofoxError(error: unknown): WebToolError {
  if (error instanceof WebToolError) return error;
  if (error instanceof CamofoxHttpError) {
    if ([408, 504].includes(error.status)) return new WebToolError("upstream_timeout", error.message, true, 504, error);
    if ([410, 429, 502, 503].includes(error.status)) return new WebToolError("upstream_unavailable", error.message, true, 503, error);
    return new WebToolError("upstream_unavailable", error.message, false, 502, error);
  }
  if (error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError")) {
    return new WebToolError("upstream_timeout", "The browser operation timed out", true, 504, error);
  }
  return new WebToolError("upstream_unavailable", "The browser service is unavailable", true, 503, error);
}
