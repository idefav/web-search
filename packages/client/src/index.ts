import {
  fetchRequestSchema,
  fetchResponseSchema,
  searchRequestSchema,
  searchResponseSchema,
  type ErrorCode,
  type FetchRequest,
  type FetchResponse,
  type SearchRequest,
  type SearchResponse
} from "camofox-web-search-core";

export interface ClientOptions {
  endpoint: string;
  apiKey: string | (() => string | Promise<string>);
  fetch?: typeof globalThis.fetch;
}

export class WebSearchClientError extends Error {
  constructor(
    public readonly code: ErrorCode | "invalid_response",
    message: string,
    public readonly retryable: boolean,
    public readonly requestId?: string,
    public readonly status?: number
  ) {
    super(message);
    this.name = "WebSearchClientError";
  }
}

export class WebSearchClient {
  private readonly endpoint: string;
  private readonly fetchImpl: typeof globalThis.fetch;
  constructor(private readonly options: ClientOptions) {
    this.endpoint = options.endpoint.replace(/\/$/, "");
    this.fetchImpl = options.fetch ?? globalThis.fetch;
  }

  webSearch(input: SearchRequest, signal?: AbortSignal): Promise<SearchResponse> {
    return this.request("/v1/search", searchRequestSchema.parse(input), searchResponseSchema, signal);
  }

  webFetch(input: FetchRequest, signal?: AbortSignal): Promise<FetchResponse> {
    return this.request("/v1/fetch", fetchRequestSchema.parse(input), fetchResponseSchema, signal);
  }

  private async request<T>(path: string, input: unknown, schema: { parse(value: unknown): T }, signal?: AbortSignal): Promise<T> {
    const apiKey = typeof this.options.apiKey === "function" ? await this.options.apiKey() : this.options.apiKey;
    const response = await this.fetchImpl(`${this.endpoint}${path}`, {
      method: "POST",
      signal,
      headers: { accept: "application/json", "content-type": "application/json", authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(input)
    });
    const body: unknown = await response.json().catch(() => undefined);
    if (!response.ok) {
      const envelope = body as { request_id?: string; error?: { code?: ErrorCode; message?: string; retryable?: boolean } } | undefined;
      throw new WebSearchClientError(
        envelope?.error?.code ?? "invalid_response",
        envelope?.error?.message ?? `Server returned HTTP ${response.status}`,
        envelope?.error?.retryable ?? response.status >= 500,
        envelope?.request_id,
        response.status
      );
    }
    try {
      return schema.parse(body);
    } catch {
      throw new WebSearchClientError("invalid_response", "Server response did not match the public contract", false, response.headers.get("x-request-id") ?? undefined, response.status);
    }
  }
}

export type { FetchRequest, FetchResponse, SearchRequest, SearchResponse } from "camofox-web-search-core";
