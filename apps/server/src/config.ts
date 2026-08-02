import { WebToolError } from "camofox-web-search-core";

function integer(name: string, fallback: number): number {
  const value = process.env[name];
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) throw new Error(`${name} must be a positive integer`);
  return parsed;
}

export interface ServerConfig {
  port: number;
  bindHost: string;
  publicKey: string;
  camofoxUrl: string;
  camofoxAccessKey: string;
  concurrency: number;
  maxQueue: number;
  queueTimeoutMs: number;
  operationTimeoutMs: number;
  rateLimitPerMinute: number;
}

export function loadConfig(): ServerConfig {
  const publicKey = (process.env.WEB_SEARCH_API_KEY ?? "").trim();
  const camofoxAccessKey = (process.env.CAMOFOX_ACCESS_KEY ?? "").trim();
  if (publicKey.length < 32) throw new WebToolError("invalid_input", "WEB_SEARCH_API_KEY must be at least 32 characters");
  if (camofoxAccessKey.length < 32) throw new WebToolError("invalid_input", "CAMOFOX_ACCESS_KEY must be at least 32 characters");
  if (publicKey === camofoxAccessKey) throw new WebToolError("invalid_input", "Public and internal access keys must be different");
  return {
    port: integer("PORT", 8080),
    bindHost: process.env.BIND_HOST ?? "0.0.0.0",
    publicKey,
    camofoxUrl: process.env.CAMOFOX_URL ?? "http://127.0.0.1:9377",
    camofoxAccessKey,
    concurrency: integer("WEB_SEARCH_CONCURRENCY", 3),
    maxQueue: integer("WEB_SEARCH_MAX_QUEUE", 20),
    queueTimeoutMs: integer("WEB_SEARCH_QUEUE_TIMEOUT_MS", 5_000),
    operationTimeoutMs: integer("WEB_SEARCH_OPERATION_TIMEOUT_MS", 45_000),
    rateLimitPerMinute: integer("WEB_SEARCH_RATE_LIMIT_PER_MINUTE", 60)
  };
}
