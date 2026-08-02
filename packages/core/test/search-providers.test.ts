import { describe, expect, it } from "vitest";
import { createBuiltinSearchProviders } from "../src/search-providers.js";

function named(id: string) {
  const provider = createBuiltinSearchProviders([id])[0];
  if (!provider) throw new Error("provider missing");
  return provider;
}

describe("built-in search providers", () => {
  it("parses DuckDuckGo article headings", () => {
    const snapshot = `- list:
  - listitem:
    - article:
      - 'heading "Duck result: official" [level=2]':
        - 'link "Duck result: official"':
          - /url: https://example.com/duck#part
      - text: Duck snippet`;
    expect(named("duckduckgo").parse(snapshot, 5)).toEqual([
      { rank: 1, title: "Duck result: official", url: "https://example.com/duck", display_url: "example.com", snippet: "Duck snippet" }
    ]);
  });

  it("decodes Bing redirect targets", () => {
    const encoded = Buffer.from("https://example.com/bing").toString("base64url");
    const snapshot = `- main "Search results":
  - list:
    - listitem:
      - heading "Bing result" [level=2]:
        - link "Bing result":
          - /url: https://www.bing.com/ck/a?u=a1${encoded}
      - paragraph: Bing snippet`;
    expect(named("bing").parse(snapshot, 5)).toEqual([
      { rank: 1, title: "Bing result", url: "https://example.com/bing", display_url: "example.com", snippet: "Bing snippet" }
    ]);
  });

  it("parses Brave external links only from the main result area", () => {
    const snapshot = `- navigation:
  - link "Settings" [e1]:
    - /url: /settings
- main:
  - main:
    - link "Example Brave result" [e2]:
      - /url: https://example.com/brave
    - text: Brave snippet`;
    expect(named("brave").parse(snapshot, 5)).toEqual([
      { rank: 1, title: "Example Brave result", url: "https://example.com/brave", display_url: "example.com", snippet: "Brave snippet" }
    ]);
  });

  it("declares filter capabilities without silently dropping filters", () => {
    const base = { query: "test", count: 5, include_domains: [], exclude_domains: [] };
    expect(named("duckduckgo").supports({ ...base, language: "en" })).toBe(false);
    expect(named("duckduckgo").supports({ ...base, language: "en", country: "US" })).toBe(true);
    expect(named("bing").supports({ ...base, freshness: "week" })).toBe(false);
    expect(named("brave").supports({ ...base, freshness: "week" })).toBe(true);
  });
});
