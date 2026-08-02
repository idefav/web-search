import { describe, expect, it } from "vitest";
import { assertSafePublicUrl, isBlockedIp } from "../src/safety.js";

describe("public URL safety", () => {
  it.each(["127.0.0.1", "10.1.2.3", "169.254.169.254", "192.168.1.1", "::1", "fd00::1", "fe80::1", "2001:db8::1"])("blocks %s", (address) => {
    expect(isBlockedIp(address)).toBe(true);
  });

  it("accepts a public destination", async () => {
    await expect(assertSafePublicUrl("https://example.com/a", async () => ["93.184.216.34"])).resolves.toMatchObject({ hostname: "example.com" });
  });

  it("fails closed if any DNS answer is private", async () => {
    await expect(assertSafePublicUrl("https://rebinding.example", async () => ["93.184.216.34", "127.0.0.1"])).rejects.toMatchObject({ code: "unsafe_url" });
  });

  it("rejects credentials and nonstandard ports", async () => {
    await expect(assertSafePublicUrl("https://user:pass@example.com", async () => ["93.184.216.34"])).rejects.toMatchObject({ code: "unsafe_url" });
    await expect(assertSafePublicUrl("https://example.com:8443", async () => ["93.184.216.34"])).rejects.toMatchObject({ code: "unsafe_url" });
  });
});
