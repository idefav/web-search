const errorResponse = {
  description: "Typed error",
  content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } }
};

export const openapi = {
  openapi: "3.1.0",
  info: { title: "Camofox Web Search API", version: "0.1.0" },
  components: {
    securitySchemes: { bearerAuth: { type: "http", scheme: "bearer" } },
    schemas: {
      SearchRequest: {
        type: "object", additionalProperties: false, required: ["query"], properties: {
          query: { type: "string", minLength: 1, maxLength: 500 },
          count: { type: "integer", minimum: 1, maximum: 10, default: 5 },
          freshness: { type: "string", enum: ["day", "week", "month", "year"] },
          include_domains: { type: "array", maxItems: 5, items: { type: "string" }, default: [] },
          exclude_domains: { type: "array", maxItems: 5, items: { type: "string" }, default: [] },
          language: { type: "string", pattern: "^[a-zA-Z]{2}$" },
          country: { type: "string", pattern: "^[a-zA-Z]{2}$" }
        }
      },
      SearchResult: {
        type: "object", required: ["rank", "title", "url"], properties: {
          rank: { type: "integer", minimum: 1 }, title: { type: "string" }, url: { type: "string", format: "uri" },
          display_url: { type: "string" }, snippet: { type: "string" }
        }
      },
      SearchResponse: {
        type: "object", required: ["request_id", "query", "provider", "fetched_at", "results", "warnings"], properties: {
          request_id: { type: "string" }, query: { type: "string" }, provider: { const: "google" }, fetched_at: { type: "string", format: "date-time" },
          results: { type: "array", items: { $ref: "#/components/schemas/SearchResult" } }, warnings: { type: "array", items: { type: "string" } }
        }
      },
      FetchRequest: {
        type: "object", additionalProperties: false, required: ["url"], properties: {
          url: { type: "string", maxLength: 2048 }, offset: { type: "integer", minimum: 0, default: 0 },
          max_chars: { type: "integer", minimum: 1, maximum: 40000, default: 20000 }
        }
      },
      FetchResponse: {
        type: "object", required: ["request_id", "requested_url", "final_url", "content_format", "content", "total_chars", "truncated", "next_offset", "fetched_at"], properties: {
          request_id: { type: "string" }, requested_url: { type: "string" }, final_url: { type: "string" }, content_format: { const: "accessibility_text" },
          content: { type: "string" }, total_chars: { type: "integer", minimum: 0 }, truncated: { type: "boolean" },
          next_offset: { type: ["integer", "null"], minimum: 0 }, fetched_at: { type: "string", format: "date-time" }
        }
      },
      ErrorResponse: {
        type: "object", required: ["request_id", "error"], properties: {
          request_id: { type: "string" },
          error: { type: "object", required: ["code", "message", "retryable"], properties: { code: { type: "string" }, message: { type: "string" }, retryable: { type: "boolean" } } }
        }
      }
    }
  },
  security: [{ bearerAuth: [] }],
  paths: {
    "/v1/search": {
      post: {
        summary: "Search Google through Camofox",
        requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/SearchRequest" } } } },
        responses: { "200": { description: "Normalized search results", content: { "application/json": { schema: { $ref: "#/components/schemas/SearchResponse" } } } }, "400": errorResponse, "401": errorResponse, "429": errorResponse, "503": errorResponse, "504": errorResponse }
      }
    },
    "/v1/fetch": {
      post: {
        summary: "Fetch an accessibility text snapshot",
        requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/FetchRequest" } } } },
        responses: { "200": { description: "Paginated page text", content: { "application/json": { schema: { $ref: "#/components/schemas/FetchResponse" } } } }, "400": errorResponse, "401": errorResponse, "415": errorResponse, "429": errorResponse, "503": errorResponse, "504": errorResponse }
      }
    },
    "/healthz": { get: { security: [], responses: { "200": { description: "Process is alive" } } } },
    "/readyz": { get: { security: [], responses: { "200": { description: "Camofox is reachable" }, "503": { description: "Camofox is unavailable" } } } }
  }
} as const;
