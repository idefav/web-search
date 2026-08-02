import { describe, expect, it, vi } from "vitest";
import { CamofoxClient } from "../src/camofox-client.js";
import { WebSearchService } from "../src/service.js";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

describe("Camofox orchestration", () => {
  it("searches and always closes its tab", async () => {
    const calls: Array<{ url: string; method: string }> = [];
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      calls.push({ url, method: init?.method ?? "GET" });
      if (url.endsWith("/tabs")) return json({ tabId: "tab-1", url: "about:blank" });
      if (url.includes("/navigate")) return json({ ok: true, tabId: "tab-1", url: "https://www.google.com/search?q=test" });
      if (url.includes("/snapshot")) return json({ url: "https://www.google.com/search?q=test", snapshot: '- link "Example" [e1]:\n  - /url: https://example.com/\n  - text: result', totalChars: 80 });
      if (url.includes("/tabs/tab-1")) return json({ ok: true });
      return json({ error: "unexpected" }, 500);
    });
    const service = new WebSearchService(new CamofoxClient("http://camofox", "internal-secret", fetchMock as typeof fetch), { id: () => "request-1", now: () => new Date("2026-08-01T00:00:00Z") });
    const result = await service.search({ query: "test", count: 5, include_domains: [], exclude_domains: [] });
    expect(result.results[0]?.url).toBe("https://example.com/");
    expect(result.warnings).toEqual(["partial_results"]);
    expect(calls.at(-1)).toMatchObject({ method: "DELETE" });
  });

  it("warms offset pagination and deletes ephemeral fetch sessions", async () => {
    const calls: string[] = [];
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      calls.push(`${init?.method ?? "GET"} ${url}`);
      if (url.endsWith("/tabs")) return json({ tabId: "tab-2", url: "about:blank" });
      if (url.includes("/navigate")) return json({ ok: true, tabId: "tab-2", url: "https://example.com/" });
      if (url.includes("offset=10")) return json({ url: "https://example.com/", snapshot: "klmnopqrstuvwxyz", totalChars: 26 });
      if (url.includes("/snapshot")) return json({ url: "https://example.com/", snapshot: "abcdefghijklmnopqrstuvwxyz", totalChars: 26 });
      return json({ ok: true });
    });
    const service = new WebSearchService(new CamofoxClient("http://camofox", "internal-secret", fetchMock as typeof fetch), {
      id: () => "request-2",
      resolver: async () => ["93.184.216.34"]
    });
    const result = await service.fetchPage({ url: "https://example.com/", offset: 10, max_chars: 5 });
    expect(result.content).toBe("klmno");
    expect(result.next_offset).toBe(15);
    expect(calls.filter((call) => call.includes("/snapshot")).length).toBe(2);
    expect(calls.some((call) => call.startsWith("DELETE http://camofox/sessions/web-fetch-request-2"))).toBe(true);
  });

  it("classifies an empty Google shell as blocked and closes its tab", async () => {
    const calls: Array<{ url: string; method: string }> = [];
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      calls.push({ url, method: init?.method ?? "GET" });
      if (url.endsWith("/tabs")) return json({ tabId: "tab-3", url: "about:blank" });
      if (url.includes("/navigate")) return json({ ok: true, tabId: "tab-3", url: "https://www.google.com/search?q=test" });
      if (url.includes("/snapshot")) return json({ url: "https://www.google.com/search?q=test", snapshot: '- searchbox "Search" [e1]: opaque-token', totalChars: 39 });
      return json({ ok: true });
    });
    const service = new WebSearchService(new CamofoxClient("http://camofox", "internal-secret", fetchMock as typeof fetch));
    await expect(service.search({ query: "test", count: 5, include_domains: [], exclude_domains: [] })).rejects.toMatchObject({ code: "search_blocked" });
    expect(calls.at(-1)).toMatchObject({ method: "DELETE" });
  });
});
