import type { ErrorCode, ErrorResponse } from "./contracts.js";

const statusByCode: Record<ErrorCode, number> = {
  invalid_input: 400,
  unauthorized: 401,
  unsafe_url: 400,
  busy: 429,
  unsupported_content: 415,
  upstream_contract_changed: 502,
  upstream_unavailable: 503,
  search_blocked: 503,
  upstream_timeout: 504
};

export class WebToolError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly retryable = false,
    public readonly status = statusByCode[code],
    public readonly cause?: unknown
  ) {
    super(message);
    this.name = "WebToolError";
  }

  toResponse(requestId: string): ErrorResponse {
    return {
      request_id: requestId,
      error: { code: this.code, message: this.message, retryable: this.retryable }
    };
  }
}

export function asWebToolError(error: unknown): WebToolError {
  if (error instanceof WebToolError) return error;
  if (error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError")) {
    return new WebToolError("upstream_timeout", "The browser operation timed out", true, 504, error);
  }
  return new WebToolError("upstream_unavailable", "The browser service is unavailable", true, 503, error);
}
