import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("openclaw/plugin-sdk/plugin-entry", () => ({ definePluginEntry: <T>(value: T) => value }), { virtual: true });
vi.mock("openclaw/plugin-sdk/provider-web-search", () => ({ wrapWebContent: (value: string, source: string) => `[${source}]${value}` }), { virtual: true });
vi.mock("openclaw/plugin-sdk/provider-web-fetch", () => ({}), { virtual: true });

const { createFetchProvider, createSearchProvider, validateEndpoint } = await import("../src/index.js");

afterEach(() => vi.unstubAllGlobals());

describe("OpenClaw native providers", () => {
  it("rejects non-local plain HTTP endpoints", () => {
    expect(() => validateEndpoint("http://search.example")).toThrow("HTTPS");
    expect(validateEndpoint("http://127.0.0.1:8080/" )).toBe("http://127.0.0.1:8080");
  });

  it("maps and wraps search results as untrusted content", async () => {
    const controller = new AbortController();
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      expect(init.signal).toBe(controller.signal);
      return new Response(JSON.stringify({
      request_id: "req-1",
      query: "camofox",
      provider: "duckduckgo",
      fetched_at: "2026-08-03T00:00:00.000Z",
      results: [{ rank: 1, title: "Title", url: "https://example.com", display_url: "example.com", snippet: "Snippet" }],
      warnings: []
      }), { status: 200, headers: { "content-type": "application/json" } });
    });
    vi.stubGlobal("fetch", fetchMock);
    const tool = createSearchProvider({ endpoint: "https://search.example", webSearch: { apiKey: "x".repeat(32) } }).createTool({});
    const output = await tool!.execute({ query: "camofox", count: 1 }, { signal: controller.signal });
    expect(output.provider).toBe("camofox");
    expect(output.upstreamProvider).toBe("duckduckgo");
    expect((output.results as Array<{ title: string }>)[0].title).toBe("[web_search]Title");
    expect(output.externalContent).toMatchObject({ untrusted: true, wrapped: true });
  });

  it("maps fetch metadata and clamps maxChars", async () => {
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      expect(JSON.parse(String(init.body)).max_chars).toBe(40_000);
      return new Response(JSON.stringify({
        request_id: "req-2",
        requested_url: "https://example.com",
        final_url: "https://example.com/final",
        content_format: "accessibility_text",
        content: "page",
        total_chars: 4,
        truncated: false,
        next_offset: null,
        fetched_at: "2026-08-03T00:00:00.000Z"
      }), { status: 200, headers: { "content-type": "application/json" } });
    });
    vi.stubGlobal("fetch", fetchMock);
    const tool = createFetchProvider({ endpoint: "https://search.example", webFetch: { apiKey: "x".repeat(32) } }).createTool({});
    const output = await tool!.execute({ url: "https://example.com", maxChars: 99_999 });
    expect(output.finalUrl).toBe("https://example.com/final");
    expect(output.text).toBe("[web_fetch]page");
  });
});
