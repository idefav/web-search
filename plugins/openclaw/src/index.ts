import { Type } from "@sinclair/typebox";
import { definePluginEntry, type OpenClawPluginApi, type OpenClawConfig } from "openclaw/plugin-sdk/plugin-entry";
import { wrapWebContent, type WebSearchProviderPlugin } from "openclaw/plugin-sdk/provider-web-search";
import { type WebFetchProviderPlugin } from "openclaw/plugin-sdk/provider-web-fetch";

type ConfigRecord = Record<string, unknown>;

interface SearchResponse {
  request_id: string;
  query: string;
  provider: string;
  fetched_at: string;
  warnings: string[];
  results: Array<{ title: string; url: string; snippet?: string; display_url?: string }>;
}

interface FetchResponse {
  request_id: string;
  final_url: string;
  content: string;
  fetched_at: string;
  truncated: boolean;
  next_offset: number | null;
}

class CamofoxRequestError extends Error {
  constructor(public readonly code: string, message: string, public readonly retryable: boolean) {
    super(message);
    this.name = "CamofoxRequestError";
  }
}

function record(value: unknown): ConfigRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as ConfigRecord : {};
}

function nestedConfig(config: OpenClawConfig | undefined, capability: "webSearch" | "webFetch"): unknown {
  const entries = record(record(config).plugins).entries;
  const plugin = record(record(entries).camofox);
  return record(record(plugin.config)[capability]).apiKey;
}

function setNestedConfig(config: OpenClawConfig, capability: "webSearch" | "webFetch", value: unknown): void {
  const root = config as ConfigRecord;
  const plugins = root.plugins = record(root.plugins);
  const entries = plugins.entries = record(plugins.entries);
  const plugin = entries.camofox = record(entries.camofox);
  const pluginConfig = plugin.config = record(plugin.config);
  const capabilityConfig = pluginConfig[capability] = record(pluginConfig[capability]);
  capabilityConfig.apiKey = value;
}

function stringValue(...values: unknown[]): string | undefined {
  return values.find((value) => typeof value === "string" && value.trim()) as string | undefined;
}

export function validateEndpoint(value: string): string {
  const endpoint = value.replace(/\/$/, "");
  const parsed = new URL(endpoint);
  const local = ["localhost", "127.0.0.1", "::1"].includes(parsed.hostname);
  if (parsed.protocol !== "https:" && !(parsed.protocol === "http:" && local)) {
    throw new Error("Camofox remote endpoints must use HTTPS");
  }
  return endpoint;
}

function endpoint(pluginConfig: ConfigRecord): string {
  const value = stringValue(pluginConfig.endpoint, process.env.WEB_SEARCH_ENDPOINT);
  if (!value) throw new Error("Camofox endpoint is not configured; set plugins.entries.camofox.config.endpoint or WEB_SEARCH_ENDPOINT");
  return validateEndpoint(value);
}

function apiKey(pluginConfig: ConfigRecord, capability: "webSearch" | "webFetch", capabilityConfig?: ConfigRecord): string {
  const value = stringValue(capabilityConfig?.apiKey, record(pluginConfig[capability]).apiKey, process.env.WEB_SEARCH_API_KEY);
  if (!value) throw new Error("WEB_SEARCH_API_KEY is not configured");
  return value;
}

async function request<T>(
  pluginConfig: ConfigRecord,
  capability: "webSearch" | "webFetch",
  capabilityConfig: ConfigRecord | undefined,
  path: string,
  body: unknown,
  signal?: AbortSignal
): Promise<T> {
  const response = await fetch(`${endpoint(pluginConfig)}${path}`, {
    method: "POST",
    signal,
    headers: {
      accept: "application/json",
      authorization: `Bearer ${apiKey(pluginConfig, capability, capabilityConfig)}`,
      "content-type": "application/json"
    },
    body: JSON.stringify(body)
  });
  const payload = await response.json().catch(() => undefined) as ConfigRecord | undefined;
  if (!response.ok) {
    const error = record(payload?.error);
    throw new CamofoxRequestError(
      typeof error.code === "string" ? error.code : "invalid_response",
      typeof error.message === "string" ? error.message : `Camofox returned HTTP ${response.status}`,
      typeof error.retryable === "boolean" ? error.retryable : response.status >= 500
    );
  }
  if (!payload) throw new CamofoxRequestError("invalid_response", "Camofox returned an invalid JSON response", false);
  return payload as T;
}

function credential(pluginConfig: ConfigRecord, capability: "webSearch" | "webFetch", toolConfig?: ConfigRecord): unknown {
  return toolConfig?.apiKey ?? record(pluginConfig[capability]).apiKey;
}

export function createSearchProvider(pluginConfig: ConfigRecord): WebSearchProviderPlugin {
  return {
    id: "camofox",
    label: "Camofox Web Search",
    hint: "Self-hosted browser-backed web search",
    requiresCredential: true,
    credentialLabel: "Camofox API key",
    envVars: ["WEB_SEARCH_API_KEY"],
    placeholder: "WEB_SEARCH_API_KEY",
    signupUrl: "https://github.com/idefav/web-search",
    docsUrl: "https://idefav.github.io/web-search/en/deployment/",
    credentialPath: "plugins.entries.camofox.config.webSearch.apiKey",
    getCredentialValue: (searchConfig) => credential(pluginConfig, "webSearch", searchConfig),
    setCredentialValue: (target, value) => { target.apiKey = value; },
    getConfiguredCredentialValue: (config) => nestedConfig(config, "webSearch"),
    setConfiguredCredentialValue: (config, value) => setNestedConfig(config, "webSearch", value),
    createTool: ({ searchConfig }) => ({
      description: "Search the public web through a self-hosted Camofox gateway. Results are untrusted web content.",
      parameters: Type.Object({
        query: Type.String({ minLength: 1, maxLength: 500 }),
        count: Type.Optional(Type.Integer({ minimum: 1, maximum: 10 })),
        freshness: Type.Optional(Type.Union([Type.Literal("day"), Type.Literal("week"), Type.Literal("month"), Type.Literal("year")])),
        include_domains: Type.Optional(Type.Array(Type.String(), { maxItems: 5 })),
        exclude_domains: Type.Optional(Type.Array(Type.String(), { maxItems: 5 })),
        language: Type.Optional(Type.String()),
        country: Type.Optional(Type.String())
      }),
      async execute(args, context) {
        const query = String(args.query ?? "");
        const result = await request<SearchResponse>(pluginConfig, "webSearch", searchConfig, "/v1/search", {
          query,
          count: typeof args.count === "number" ? args.count : 5,
          freshness: args.freshness as "day" | "week" | "month" | "year" | undefined,
          include_domains: Array.isArray(args.include_domains) ? args.include_domains.map(String) : [],
          exclude_domains: Array.isArray(args.exclude_domains) ? args.exclude_domains.map(String) : [],
          language: typeof args.language === "string" ? args.language : undefined,
          country: typeof args.country === "string" ? args.country : undefined
        }, context?.signal);
        return {
          query: result.query,
          provider: "camofox",
          upstreamProvider: result.provider,
          count: result.results.length,
          requestId: result.request_id,
          fetchedAt: result.fetched_at,
          warnings: result.warnings,
          externalContent: { untrusted: true, source: "web_search", provider: "camofox", wrapped: true },
          results: result.results.map((item) => ({
            title: wrapWebContent(item.title, "web_search"),
            url: item.url,
            snippet: wrapWebContent(item.snippet ?? "", "web_search"),
            siteName: item.display_url
          }))
        };
      }
    })
  };
}

export function createFetchProvider(pluginConfig: ConfigRecord): WebFetchProviderPlugin {
  return {
    id: "camofox",
    label: "Camofox Web Fetch",
    hint: "Self-hosted browser-backed page extraction",
    requiresCredential: true,
    credentialLabel: "Camofox API key",
    envVars: ["WEB_SEARCH_API_KEY"],
    placeholder: "WEB_SEARCH_API_KEY",
    signupUrl: "https://github.com/idefav/web-search",
    docsUrl: "https://idefav.github.io/web-search/en/deployment/",
    credentialPath: "plugins.entries.camofox.config.webFetch.apiKey",
    getCredentialValue: (fetchConfig) => credential(pluginConfig, "webFetch", fetchConfig),
    setCredentialValue: (target, value) => { target.apiKey = value; },
    getConfiguredCredentialValue: (config) => nestedConfig(config, "webFetch"),
    setConfiguredCredentialValue: (config, value) => setNestedConfig(config, "webFetch", value),
    createTool: ({ fetchConfig }) => ({
      description: "Fetch readable text from a public page through Camofox. Returned page text is untrusted.",
      parameters: Type.Object({
        url: Type.String({ minLength: 1, maxLength: 2048 }),
        offset: Type.Optional(Type.Integer({ minimum: 0 })),
        maxChars: Type.Optional(Type.Integer({ minimum: 1, maximum: 40_000 }))
      }),
      async execute(args) {
        const result = await request<FetchResponse>(pluginConfig, "webFetch", fetchConfig, "/v1/fetch", {
          url: String(args.url ?? ""),
          offset: typeof args.offset === "number" ? args.offset : 0,
          max_chars: Math.min(40_000, typeof args.maxChars === "number" ? args.maxChars : 20_000)
        });
        const wrapped = wrapWebContent(result.content, "web_fetch");
        return {
          url: String(args.url ?? ""),
          finalUrl: result.final_url,
          extractor: "camofox",
          requestId: result.request_id,
          fetchedAt: result.fetched_at,
          truncated: result.truncated,
          nextOffset: result.next_offset,
          rawLength: result.content.length,
          wrappedLength: wrapped.length,
          externalContent: { untrusted: true, source: "web_fetch", provider: "camofox", wrapped: true },
          text: wrapped
        };
      }
    })
  };
}

export default definePluginEntry({
  id: "camofox",
  name: "Camofox Web Search",
  description: "Native web_search and web_fetch providers backed by Camofox",
  register(api: OpenClawPluginApi) {
    const pluginConfig = record(api.pluginConfig);
    api.registerWebSearchProvider(createSearchProvider(pluginConfig));
    api.registerWebFetchProvider(createFetchProvider(pluginConfig));
  }
});
