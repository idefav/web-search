import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const endpoint = (process.env.WEB_SEARCH_ENDPOINT ?? "http://127.0.0.1:8080").replace(/\/$/, "");
const apiKey = process.env.WEB_SEARCH_API_KEY;
if (!apiKey) throw new Error("WEB_SEARCH_API_KEY is required");

const client = new Client({ name: "docker-e2e", version: "0.1.0" });
const transport = new StreamableHTTPClientTransport(new URL(`${endpoint}/mcp`), {
  requestInit: { headers: { authorization: `Bearer ${apiKey}` } }
});
try {
  await client.connect(transport);
  const tools = (await client.listTools()).tools.map((tool) => tool.name).sort();
  if (JSON.stringify(tools) !== JSON.stringify(["web_fetch", "web_search"])) throw new Error(`Unexpected MCP tools: ${tools.join(", ")}`);
  const fetched = await client.callTool({ name: "web_fetch", arguments: { url: "https://example.com/", max_chars: 2000 } });
  if (fetched.isError) throw new Error(`MCP web_fetch failed: ${JSON.stringify(fetched.content)}`);
  process.stdout.write(`MCP tools and web_fetch passed: ${tools.join(", ")}\n`);
} finally {
  await transport.close().catch(() => undefined);
}
