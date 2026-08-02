import { describe, expect, it } from "vitest";
import { buildBingSearchUrl, buildBraveSearchUrl, buildDuckDuckGoSearchUrl, buildGoogleSearchUrl, normalizeDomain } from "../src/query.js";

describe("Google query builder", () => {
  it("encodes filters, locale, and freshness deterministically", () => {
    const url = new URL(buildGoogleSearchUrl({
      query: "distributed systems",
      count: 7,
      freshness: "week",
      include_domains: ["Example.com", "docs.example.org"],
      exclude_domains: ["spam.example"],
      language: "en",
      country: "US"
    }));
    expect(url.searchParams.get("q")).toBe("distributed systems (site:example.com OR site:docs.example.org) -site:spam.example");
    expect(url.searchParams.get("num")).toBe("7");
    expect(url.searchParams.get("tbs")).toBe("qdr:w");
    expect(url.searchParams.get("hl")).toBe("en");
    expect(url.searchParams.get("gl")).toBe("us");
  });

  it("builds provider-specific URLs without losing common domain filters", () => {
    const input = { query: "agents", count: 3, freshness: "week" as const, include_domains: ["example.com"], exclude_domains: [], language: "en", country: "US" };
    const duck = new URL(buildDuckDuckGoSearchUrl(input));
    expect(duck.searchParams.get("q")).toBe("agents site:example.com");
    expect(duck.searchParams.get("df")).toBe("w");
    expect(duck.searchParams.get("kl")).toBe("us-en");
    const brave = new URL(buildBraveSearchUrl(input));
    expect(brave.searchParams.get("freshness")).toBe("pw");
    expect(brave.searchParams.get("search_lang")).toBe("en");
    const bing = new URL(buildBingSearchUrl({ ...input, freshness: undefined }));
    expect(bing.searchParams.get("cc")).toBe("US");
    expect(bing.searchParams.get("setlang")).toBe("en");
  });

  it("normalizes IDNs and rejects URL-shaped domain filters", () => {
    expect(normalizeDomain("例子.测试")).toBe("xn--fsqu00a.xn--0zwm56d");
    expect(() => normalizeDomain("https://example.com/path")).toThrow(/Invalid bare domain/);
  });

  it("rejects contradictory filters", () => {
    expect(() => buildGoogleSearchUrl({ query: "x", count: 5, include_domains: ["example.com"], exclude_domains: ["EXAMPLE.COM"] })).toThrow(/both included and excluded/);
  });
});
