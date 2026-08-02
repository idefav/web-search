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

  it("waits through a transient WeChat verification page and removes its temporary token", async () => {
    const calls: string[] = [];
    const readiness: unknown[] = [];
    let snapshots = 0;
    const requestedUrl = "https://mp.weixin.qq.com/s?__biz=test&mid=1&idx=1&sn=article";
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      calls.push(`${init?.method ?? "GET"} ${url}`);
      if (url.endsWith("/tabs")) return json({ tabId: "wechat-tab", url: "about:blank" });
      if (url.includes("/navigate")) return json({ ok: true, tabId: "wechat-tab", url: `https://mp.weixin.qq.com/mp/wappoc_appmsgcaptcha?target_url=${encodeURIComponent(requestedUrl)}` });
      if (url.includes("/wait")) return json({ ok: true, ready: true });
      if (url.includes("/snapshot")) {
        snapshots += 1;
        if (snapshots === 1) return json({ url: "https://mp.weixin.qq.com/mp/wappoc_appmsgcaptcha", snapshot: "- iframe", totalChars: 8 });
        return json({ url: `${requestedUrl}&poc_token=temporary`, snapshot: '- heading "Article" [level=1]\n- paragraph: readable body', totalChars: 58 });
      }
      return json({ ok: true });
    });
    const service = new WebSearchService(new CamofoxClient("http://camofox", "internal-secret", fetchMock as typeof fetch), {
      id: () => "wechat-request",
      providers: googleOnly(),
      resolver: async () => ["101.32.118.25"],
      onFetchReadiness: (event) => readiness.push(event)
    });
    const result = await service.fetchPage({ url: requestedUrl, offset: 0, max_chars: 200 });
    expect(result.content).toContain("readable body");
    expect(result.final_url).toBe(requestedUrl);
    expect(calls.some((call) => call.includes("/wait"))).toBe(true);
    expect(readiness).toEqual([expect.objectContaining({ requestId: "wechat-request", reason: "wechat_challenge", outcome: "recovered" })]);
    expect(calls.at(-1)).toContain("DELETE http://camofox/sessions/web-fetch-wechat-request");
  });

  it("returns a retryable typed error when WeChat verification persists", async () => {
    const calls: string[] = [];
    const readiness: unknown[] = [];
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      calls.push(`${init?.method ?? "GET"} ${url}`);
      if (url.endsWith("/tabs")) return json({ tabId: "blocked-wechat", url: "about:blank" });
      if (url.includes("/navigate")) return json({ ok: true, tabId: "blocked-wechat", url: "https://mp.weixin.qq.com/mp/wappoc_appmsgcaptcha" });
      if (url.includes("/snapshot")) return json({ url: "https://mp.weixin.qq.com/mp/wappoc_appmsgcaptcha", snapshot: "- iframe", totalChars: 8 });
      if (url.includes("/wait")) return json({ ok: true, ready: false });
      return json({ ok: true });
    });
    const service = new WebSearchService(new CamofoxClient("http://camofox", "internal-secret", fetchMock as typeof fetch), {
      providers: googleOnly(),
      resolver: async () => ["101.32.118.25"],
      onFetchReadiness: (event) => readiness.push(event)
    });
    await expect(service.fetchPage({ url: "https://mp.weixin.qq.com/s/article", offset: 0, max_chars: 200 })).rejects.toMatchObject({
      code: "fetch_blocked",
      retryable: true,
      retryAfterSeconds: 60
    });
    expect(readiness).toEqual([expect.objectContaining({ reason: "wechat_challenge", outcome: "blocked" })]);
    expect(calls.at(-1)).toContain("DELETE http://camofox/sessions/web-fetch-");
  });

  it("retries a generic placeholder before applying offset pagination", async () => {
    const calls: string[] = [];
    let snapshots = 0;
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      calls.push(`${init?.method ?? "GET"} ${url}`);
      if (url.endsWith("/tabs")) return json({ tabId: "dynamic-tab", url: "about:blank" });
      if (url.includes("/navigate")) return json({ ok: true, tabId: "dynamic-tab", url: "https://example.com/dynamic" });
      if (url.includes("/wait")) return json({ ok: true, ready: true });
      if (url.includes("offset=5")) return json({ url: "https://example.com/dynamic", snapshot: "fghij", totalChars: 10 });
      if (url.includes("/snapshot")) {
        snapshots += 1;
        return snapshots === 1
          ? json({ url: "https://example.com/dynamic", snapshot: "", totalChars: 0 })
          : json({ url: "https://example.com/dynamic", snapshot: "abcdefghij", totalChars: 10 });
      }
      return json({ ok: true });
    });
    const service = new WebSearchService(new CamofoxClient("http://camofox", "internal-secret", fetchMock as typeof fetch), {
      providers: googleOnly(),
      resolver: async () => ["93.184.216.34"]
    });
    const result = await service.fetchPage({ url: "https://example.com/dynamic", offset: 5, max_chars: 3 });
    expect(result).toMatchObject({ content: "fgh", next_offset: 8, total_chars: 10 });
    expect(calls.filter((call) => call.includes("/snapshot"))).toHaveLength(3);
    expect(calls.filter((call) => call.includes("/wait"))).toHaveLength(1);
  });

  it("rejects a generic placeholder that remains unreadable after waiting", async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith("/tabs")) return json({ tabId: "iframe-tab", url: "about:blank" });
      if (url.includes("/navigate")) return json({ ok: true, tabId: "iframe-tab", url: "https://example.com/iframe" });
      if (url.includes("/snapshot")) return json({ url: "https://example.com/iframe", snapshot: "- iframe:", totalChars: 9 });
      if (url.includes("/wait")) return json({ ok: true, ready: false });
      return json({ ok: true });
    });
    const service = new WebSearchService(new CamofoxClient("http://camofox", "internal-secret", fetchMock as typeof fetch), {
      providers: googleOnly(),
      resolver: async () => ["93.184.216.34"]
    });
    await expect(service.fetchPage({ url: "https://example.com/iframe", offset: 0, max_chars: 20 })).rejects.toMatchObject({
      code: "unsupported_content",
      retryable: false
    });
  });

  it("does not wait when the first snapshot is readable", async () => {
    const calls: string[] = [];
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      calls.push(`${init?.method ?? "GET"} ${url}`);
      if (url.endsWith("/tabs")) return json({ tabId: "ready-tab", url: "about:blank" });
      if (url.includes("/navigate")) return json({ ok: true, tabId: "ready-tab", url: "https://example.com/ready" });
      if (url.includes("/snapshot")) return json({ url: "https://example.com/ready", snapshot: "readable", totalChars: 8 });
      return json({ ok: true });
    });
    const service = new WebSearchService(new CamofoxClient("http://camofox", "internal-secret", fetchMock as typeof fetch), {
      providers: googleOnly(),
      resolver: async () => ["93.184.216.34"]
    });
    await expect(service.fetchPage({ url: "https://example.com/ready", offset: 0, max_chars: 20 })).resolves.toMatchObject({ content: "readable" });
    expect(calls.some((call) => call.includes("/wait"))).toBe(false);
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
