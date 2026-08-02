import { describe, expect, it } from "vitest";
import { isExplicitGoogleNoResults, isGoogleBlocked, parseGoogleSnapshot } from "../src/google-parser.js";

const fixture = `- heading "test - Google Search"
- searchbox "Search" [e1]: test
- link "First \\"quoted\\" result" [e2]:
  - /url: https://www.google.com/url?q=https%3A%2F%2Fexample.com%2Farticle%23part
  - cite: example.com
  - text: A useful snippet.
- link "Duplicate" [e3]:
  - /url: https://example.com/article
  - text: duplicate
- link "Second" [e4]:
  - /url: https://docs.example.org/guide
  - cite: docs.example.org`;

describe("Google snapshot parser", () => {
  it("unwraps redirects, unescapes titles, deduplicates, and ranks", () => {
    expect(parseGoogleSnapshot(fixture, 10)).toEqual([
      { rank: 1, title: 'First "quoted" result', url: "https://example.com/article", display_url: "example.com", snippet: "A useful snippet." },
      { rank: 2, title: "Second", url: "https://docs.example.org/guide", display_url: "docs.example.org" }
    ]);
  });

  it("recognizes Google blocking pages", () => {
    expect(isGoogleBlocked("Our systems have detected unusual traffic", "https://www.google.com/sorry/index")).toBe(true);
  });

  it("returns an empty result for a legitimate no-results snapshot", () => {
    const snapshot = '- heading "No results"\n- text: did not match any documents';
    expect(isExplicitGoogleNoResults(snapshot)).toBe(true);
    expect(parseGoogleSnapshot(snapshot, 5)).toEqual([]);
  });

  it("does not mistake a challenge-like empty search shell for no results", () => {
    expect(isExplicitGoogleNoResults('- searchbox "Search" [e1]: opaque-token')).toBe(false);
  });
});
