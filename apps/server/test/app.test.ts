import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { createApp } from "../src/app.js";
import type { ServerConfig } from "../src/config.js";

const servers: Array<ReturnType<ReturnType<typeof createApp>["listen"]>> = [];
afterEach(async () => Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve())))));

const config: ServerConfig = {
  port: 0,
  bindHost: "127.0.0.1",
  publicKey: "p".repeat(32),
  camofoxUrl: "http://camofox",
  camofoxAccessKey: "c".repeat(32),
  concurrency: 3,
  maxQueue: 20,
  queueTimeoutMs: 5_000,
  operationTimeoutMs: 45_000,
  rateLimitPerMinute: 60
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

async function start(fetchImpl: typeof fetch): Promise<string> {
  const server = createApp(config, fetchImpl).listen(0, "127.0.0.1");
  servers.push(server);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

describe("gateway", () => {
  it("reports ready only when the browser process is connected and running", async () => {
    const unavailable = await start(vi.fn(async () => json({ ok: true, browserConnected: false, browserRunning: false })) as typeof fetch);
    expect((await fetch(`${unavailable}/readyz`)).status).toBe(503);

    const ready = await start(vi.fn(async () => json({ ok: true, browserConnected: true, browserRunning: true })) as typeof fetch);
    expect((await fetch(`${ready}/readyz`)).status).toBe(200);
  });

  it("enforces authentication and serves the REST search contract", async () => {
    const upstream = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith("/tabs")) return json({ tabId: "t1", url: "about:blank" });
      if (url.includes("/navigate")) return json({ ok: true, tabId: "t1", url: "https://www.google.com/search?q=test" });
      if (url.includes("/snapshot")) return json({ url: "https://www.google.com/search?q=test", snapshot: '- link "Example" [e1]:\n  - /url: https://example.com/', totalChars: 55 });
      return json({ ok: true });
    });
    const endpoint = await start(upstream as typeof fetch);
    expect((await fetch(`${endpoint}/v1/search`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ query: "test" }) })).status).toBe(401);
    const response = await fetch(`${endpoint}/v1/search`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${config.publicKey}` },
      body: JSON.stringify({ query: "test" })
    });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ provider: "google", results: [{ title: "Example", url: "https://example.com/" }] });
  });

  it("publishes exactly the two read-only MCP tools", async () => {
    const upstream = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith("/tabs")) return json({ tabId: "mcp-tab", url: "about:blank" });
      if (url.includes("/navigate")) return json({ ok: true, tabId: "mcp-tab", url: "https://www.google.com/search?q=mcp" });
      if (url.includes("/snapshot")) return json({ url: "https://www.google.com/search?q=mcp", snapshot: '- link "MCP" [e1]:\n  - /url: https://modelcontextprotocol.io/', totalChars: 70 });
      return json({ ok: true });
    });
    const endpoint = await start(upstream as typeof fetch);
    const client = new Client({ name: "test", version: "1.0.0" });
    const transport = new StreamableHTTPClientTransport(new URL(`${endpoint}/mcp`), {
      requestInit: { headers: { authorization: `Bearer ${config.publicKey}` } }
    });
    await client.connect(transport);
    const tools = (await client.listTools()).tools.sort((a, b) => a.name.localeCompare(b.name));
    expect(tools.map((tool) => tool.name)).toEqual(["web_fetch", "web_search"]);
    for (const tool of tools) expect(tool.annotations).toMatchObject({ readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true });
    const result = await client.callTool({ name: "web_search", arguments: { query: "mcp", count: 1 } });
    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toMatchObject({ provider: "google", results: [{ title: "MCP" }] });
    await transport.close();
  });
});
