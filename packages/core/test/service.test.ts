import { describe, expect, it, vi } from "vitest";
import { CamofoxClient } from "../src/camofox-client.js";
import { createBuiltinSearchProviders } from "../src/search-providers.js";
import { WebSearchService } from "../src/service.js";

const googleOnly = () => createBuiltinSearchProviders(["google"]);

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
    const service = new WebSearchService(new CamofoxClient("http://camofox", "internal-secret", fetchMock as typeof fetch), { providers: googleOnly(), id: () => "request-1", now: () => new Date("2026-08-01T00:00:00Z") });
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
      providers: googleOnly(),
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
    const service = new WebSearchService(new CamofoxClient("http://camofox", "internal-secret", fetchMock as typeof fetch), { providers: googleOnly() });
    await expect(service.search({ query: "test", count: 5, include_domains: [], exclude_domains: [] })).rejects.toMatchObject({ code: "search_blocked" });
    expect(calls.at(-1)).toMatchObject({ method: "DELETE" });
  });

  it("falls back after a blocked provider and keeps it open during cooldown", async () => {
    let currentUrl = "";
    let duckNavigations = 0;
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/tabs")) return json({ tabId: `tab-${Math.random()}`, url: "about:blank" });
      if (url.includes("/navigate")) {
        currentUrl = String(JSON.parse(String(init?.body)).url);
        if (currentUrl.includes("duckduckgo.com")) duckNavigations += 1;
        return json({ ok: true, tabId: "tab", url: currentUrl });
      }
      if (url.includes("/snapshot")) {
        if (currentUrl.includes("duckduckgo.com")) return json({ url: currentUrl, snapshot: "Unfortunately, bots use DuckDuckGo too", totalChars: 42 });
        return json({
          url: currentUrl,
          snapshot: '- main:\n  - main:\n    - link "Example result" [e1]:\n      - /url: https://example.com/\n    - text: useful snippet',
          totalChars: 120
        });
      }
      return json({ ok: true });
    });
    let request = 0;
    const service = new WebSearchService(new CamofoxClient("http://camofox", "internal-secret", fetchMock as typeof fetch), {
      providers: createBuiltinSearchProviders(["duckduckgo", "brave"]),
      id: () => `request-${++request}`
    });
    const input = { query: "test", count: 1, include_domains: [], exclude_domains: [] };
    const first = await service.search(input);
    const second = await service.search(input);
    expect(first).toMatchObject({ provider: "brave", warnings: ["provider_fallback"] });
    expect(second).toMatchObject({ provider: "brave", warnings: ["provider_fallback"] });
    expect(duckNavigations).toBe(1);
  });

  it("allows one half-open probe after the cooldown", async () => {
    let currentUrl = "";
    let blocked = true;
    let navigations = 0;
    let nowMs = 1_000;
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/tabs")) return json({ tabId: `tab-${navigations}`, url: "about:blank" });
      if (url.includes("/navigate")) {
        navigations += 1;
        currentUrl = String(JSON.parse(String(init?.body)).url);
        return json({ ok: true, tabId: "tab", url: currentUrl });
      }
      if (url.includes("/snapshot")) {
        if (blocked) return json({ url: currentUrl, snapshot: "Our systems have detected unusual traffic", totalChars: 48 });
        return json({ url: currentUrl, snapshot: '- link "Recovered" [e1]:\n  - /url: https://example.com/', totalChars: 60 });
      }
      return json({ ok: true });
    });
    const service = new WebSearchService(new CamofoxClient("http://camofox", "internal-secret", fetchMock as typeof fetch), {
      providers: googleOnly(),
      providerCooldownMs: 5_000,
      now: () => new Date(nowMs)
    });
    const input = { query: "test", count: 1, include_domains: [], exclude_domains: [] };
    await expect(service.search(input)).rejects.toMatchObject({ code: "search_blocked", retryAfterSeconds: 5 });
    await expect(service.search(input)).rejects.toMatchObject({ code: "search_blocked" });
    expect(navigations).toBe(1);
    nowMs += 5_001;
    blocked = false;
    await expect(service.search(input)).resolves.toMatchObject({ provider: "google", results: [{ title: "Recovered" }] });
    expect(navigations).toBe(2);
  });

  it("limits Google to one request and skips queued attempts after it is blocked", async () => {
    let active = 0;
    let maximum = 0;
    let tab = 0;
    let googleNavigations = 0;
    const tabUrls = new Map<string, string>();
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/tabs")) return json({ tabId: `tab-${++tab}`, url: "about:blank" });
      if (url.includes("/navigate")) {
        const tabId = url.match(/\/tabs\/([^/]+)\/navigate/)?.[1] ?? "unknown";
        const target = String(JSON.parse(String(init?.body)).url);
        tabUrls.set(tabId, target);
        if (target.includes("google.com")) {
          googleNavigations += 1;
          active += 1;
          maximum = Math.max(maximum, active);
          await new Promise((resolve) => setTimeout(resolve, 10));
          active -= 1;
        }
        return json({ ok: true, tabId, url: target });
      }
      if (url.includes("/snapshot")) {
        const tabId = url.match(/\/tabs\/([^/]+)\/snapshot/)?.[1] ?? "unknown";
        const target = tabUrls.get(tabId) ?? "";
        if (target.includes("google.com")) return json({ url: "https://www.google.com/sorry/index", snapshot: "Our systems have detected unusual traffic", totalChars: 48 });
        return json({ url: target, snapshot: '- main:\n  - main:\n    - link "Fallback" [e1]:\n      - /url: https://example.com/', totalChars: 70 });
      }
      return json({ ok: true });
    });
    const service = new WebSearchService(new CamofoxClient("http://camofox", "internal-secret", fetchMock as typeof fetch), {
      concurrency: 3,
      providers: createBuiltinSearchProviders(["google", "brave"])
    });
    const input = { query: "test", count: 1, include_domains: [], exclude_domains: [] };
    const results = await Promise.all([service.search(input), service.search(input), service.search(input)]);
    expect(maximum).toBe(1);
    expect(googleNavigations).toBe(1);
    expect(results.every((item) => item.provider === "brave" && item.warnings.includes("provider_fallback"))).toBe(true);
  });
});
