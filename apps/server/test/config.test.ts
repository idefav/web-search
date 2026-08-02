import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadConfig } from "../src/config.js";

beforeEach(() => {
  vi.stubEnv("WEB_SEARCH_API_KEY", "p".repeat(32));
  vi.stubEnv("CAMOFOX_ACCESS_KEY", "c".repeat(32));
});

afterEach(() => vi.unstubAllEnvs());

describe("server provider configuration", () => {
  it("uses the stable-first provider chain by default", () => {
    expect(loadConfig()).toMatchObject({
      providers: ["duckduckgo", "brave", "bing", "google"],
      providerTimeoutMs: 15_000,
      providerCooldownMs: 300_000
    });
  });

  it("accepts an explicit provider order", () => {
    vi.stubEnv("WEB_SEARCH_PROVIDERS", "google, brave");
    expect(loadConfig().providers).toEqual(["google", "brave"]);
  });

  it("fails closed for duplicate, empty, or unknown providers", () => {
    vi.stubEnv("WEB_SEARCH_PROVIDERS", "google,google");
    expect(() => loadConfig()).toThrow(/duplicates/);
    vi.stubEnv("WEB_SEARCH_PROVIDERS", ", ,");
    expect(() => loadConfig()).toThrow(/at least one/);
    vi.stubEnv("WEB_SEARCH_PROVIDERS", "google,custom");
    expect(() => loadConfig()).toThrow(/unknown provider: custom/);
  });
});
