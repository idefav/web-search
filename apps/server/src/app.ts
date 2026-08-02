import { randomUUID } from "node:crypto";
import express, { type ErrorRequestHandler } from "express";
import { ZodError } from "zod";
import {
  asWebToolError,
  CamofoxClient,
  fetchRequestSchema,
  searchRequestSchema,
  WebSearchService,
  WebToolError
} from "camofox-web-search-core";
import type { ServerConfig } from "./config.js";
import { bearerAuth, rateLimit } from "./auth.js";
import { handleMcpRequest } from "./mcp.js";
import { openapi } from "./openapi.js";

export function createApp(config: ServerConfig, fetchImpl: typeof fetch = fetch) {
  const camofox = new CamofoxClient(config.camofoxUrl, config.camofoxAccessKey, fetchImpl);
  const service = new WebSearchService(camofox, {
    concurrency: config.concurrency,
    maxQueue: config.maxQueue,
    queueTimeoutMs: config.queueTimeoutMs,
    operationTimeoutMs: config.operationTimeoutMs
  });
  const app = express();
  const requestCounts = new Map<string, number>();
  const durationSums = new Map<string, number>();

  const requestSignal = (request: express.Request): AbortSignal => {
    const controller = new AbortController();
    request.once("aborted", () => controller.abort(new DOMException("Client disconnected", "AbortError")));
    return controller.signal;
  };
  app.disable("x-powered-by");
  app.use(express.json({ limit: "64kb" }));
  app.use((request, response, next) => {
    response.locals.requestId = request.header("x-request-id")?.slice(0, 128) || randomUUID();
    response.setHeader("x-request-id", response.locals.requestId);
    const started = Date.now();
    response.on("finish", () => {
      const durationMs = Date.now() - started;
      const metricPath = ["/v1/search", "/v1/fetch", "/mcp", "/healthz", "/readyz"].includes(request.path) ? request.path : "other";
      const key = `${request.method}|${metricPath}|${response.statusCode}`;
      requestCounts.set(key, (requestCounts.get(key) ?? 0) + 1);
      durationSums.set(key, (durationSums.get(key) ?? 0) + durationMs / 1_000);
      process.stdout.write(`${JSON.stringify({ level: "info", request_id: response.locals.requestId, method: request.method, path: request.path, status: response.statusCode, duration_ms: durationMs })}\n`);
    });
    next();
  });

  app.get("/healthz", (_request, response) => response.json({ ok: true }));
  app.get("/readyz", async (_request, response) => {
    try {
      const health = await camofox.health(AbortSignal.timeout(2_000));
      if (!health.ok || health.browserConnected !== true || health.browserRunning !== true) {
        response.status(503).json({ ok: false });
        return;
      }
      response.json({ ok: true });
    } catch {
      response.status(503).json({ ok: false });
    }
  });
  app.get("/openapi.json", (_request, response) => response.json(openapi));
  app.get("/metrics", bearerAuth(config.publicKey), (_request, response) => {
    const lines = [
      "# HELP camofox_web_search_http_requests_total HTTP requests handled by the gateway.",
      "# TYPE camofox_web_search_http_requests_total counter",
      ...[...requestCounts.entries()].map(([key, value]) => {
        const [method, path, status] = key.split("|");
        return `camofox_web_search_http_requests_total{method="${method}",path="${path}",status="${status}"} ${value}`;
      }),
      "# HELP camofox_web_search_http_request_duration_seconds_sum Total request duration.",
      "# TYPE camofox_web_search_http_request_duration_seconds_sum counter",
      ...[...durationSums.entries()].map(([key, value]) => {
        const [method, path, status] = key.split("|");
        return `camofox_web_search_http_request_duration_seconds_sum{method="${method}",path="${path}",status="${status}"} ${value}`;
      })
    ];
    response.type("text/plain; version=0.0.4").send(`${lines.join("\n")}\n`);
  });

  const protectedRoute = [bearerAuth(config.publicKey), rateLimit(config.rateLimitPerMinute)];
  app.post("/v1/search", ...protectedRoute, async (request, response, next) => {
    try {
      response.json(await service.search(searchRequestSchema.parse(request.body), requestSignal(request)));
    } catch (error) { next(error); }
  });
  app.post("/v1/fetch", ...protectedRoute, async (request, response, next) => {
    try {
      response.json(await service.fetchPage(fetchRequestSchema.parse(request.body), requestSignal(request)));
    } catch (error) { next(error); }
  });
  app.all("/mcp", ...protectedRoute, async (request, response, next) => {
    try { await handleMcpRequest(service, request, response); } catch (error) { next(error); }
  });

  const errors: ErrorRequestHandler = (error, _request, response, _next) => {
    const mapped = error instanceof ZodError
      ? new WebToolError("invalid_input", error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; "))
      : asWebToolError(error);
    response.status(mapped.status).json(mapped.toResponse(response.locals.requestId));
  };
  app.use(errors);
  return app;
}
