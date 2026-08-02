import { createHash, timingSafeEqual } from "node:crypto";
import type { RequestHandler } from "express";

function digest(value: string): Buffer {
  return createHash("sha256").update(value).digest();
}

export function bearerMatches(header: string | undefined, expected: string): boolean {
  if (!header?.startsWith("Bearer ")) return false;
  return timingSafeEqual(digest(header.slice(7)), digest(expected));
}

export function bearerAuth(expected: string): RequestHandler {
  return (request, response, next) => {
    if (!bearerMatches(request.header("authorization"), expected)) {
      response.status(401).json({
        request_id: response.locals.requestId,
        error: { code: "unauthorized", message: "A valid Bearer token is required", retryable: false }
      });
      return;
    }
    next();
  };
}

export function rateLimit(limit: number): RequestHandler {
  let windowStart = Date.now();
  let count = 0;
  return (_request, response, next) => {
    const now = Date.now();
    if (now - windowStart >= 60_000) {
      windowStart = now;
      count = 0;
    }
    count += 1;
    if (count > limit) {
      response.status(429).json({
        request_id: response.locals.requestId,
        error: { code: "busy", message: "Rate limit exceeded", retryable: true }
      });
      return;
    }
    next();
  };
}
