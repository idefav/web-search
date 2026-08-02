#!/usr/bin/env node
import { access, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { configPath, type Scope, type Target, updateTarget } from "./config-editors.js";

const targets = new Set<Target>(["codex", "claude", "opencode", "pi"]);

function valueAfter(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

function usage(): never {
  throw new Error("Usage: camofox-web-search <install|uninstall|doctor> <codex|claude|opencode|pi> --endpoint <https://host> [--scope user|project] [--dry-run] [--force] [--live] [--pi-package <source>]");
}

async function doctor(target: Target, scope: Scope, endpoint: string, cwd: string, live: boolean): Promise<void> {
  const checks: Array<{ name: string; ok: boolean; detail: string }> = [];
  const path = configPath(target, scope, cwd);
  checks.push({ name: "config", ok: await access(path).then(() => true).catch(() => false), detail: path });
  checks.push({ name: "WEB_SEARCH_API_KEY", ok: (process.env.WEB_SEARCH_API_KEY?.length ?? 0) >= 32, detail: "environment variable is present and at least 32 characters" });
  const parsed = new URL(endpoint);
  checks.push({ name: "transport", ok: parsed.protocol === "https:" || ["localhost", "127.0.0.1", "::1"].includes(parsed.hostname), detail: parsed.href });
  try {
    const response = await fetch(`${endpoint.replace(/\/$/, "")}/healthz`, { signal: AbortSignal.timeout(5_000) });
    checks.push({ name: "health", ok: response.ok, detail: `HTTP ${response.status}` });
  } catch (error) {
    checks.push({ name: "health", ok: false, detail: error instanceof Error ? error.message : String(error) });
  }
  if (process.env.WEB_SEARCH_API_KEY) {
    const client = new Client({ name: "camofox-web-search-doctor", version: "0.0.2" });
    const transport = new StreamableHTTPClientTransport(new URL(`${endpoint.replace(/\/$/, "")}/mcp`), {
      requestInit: { headers: { authorization: `Bearer ${process.env.WEB_SEARCH_API_KEY}` } }
    });
    try {
      await client.connect(transport);
      const names = (await client.listTools()).tools.map((tool) => tool.name).sort();
      checks.push({ name: "mcp-tools", ok: JSON.stringify(names) === JSON.stringify(["web_fetch", "web_search"]), detail: names.join(", ") });
    } catch (error) {
      checks.push({ name: "mcp-tools", ok: false, detail: error instanceof Error ? error.message : String(error) });
    } finally {
      await transport.close().catch(() => undefined);
    }
  }
  if (live && process.env.WEB_SEARCH_API_KEY) {
    try {
      const response = await fetch(`${endpoint.replace(/\/$/, "")}/v1/search`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${process.env.WEB_SEARCH_API_KEY}` },
        body: JSON.stringify({ query: "Camofox browser", count: 1 }),
        signal: AbortSignal.timeout(55_000)
      });
      const body = await response.json().catch(() => undefined) as { provider?: string; error?: { code?: string; retry_after_seconds?: number } } | undefined;
      const detail = response.ok
        ? `HTTP ${response.status}; provider=${body?.provider ?? "unknown"}`
        : `HTTP ${response.status}; error=${body?.error?.code ?? "unknown"}${body?.error?.retry_after_seconds ? `; retry_after_seconds=${body.error.retry_after_seconds}` : ""}`;
      checks.push({ name: "live-search", ok: response.ok, detail });
    } catch (error) {
      checks.push({ name: "live-search", ok: false, detail: error instanceof Error ? error.message : String(error) });
    }
  }
  for (const check of checks) process.stdout.write(`${check.ok ? "PASS" : "FAIL"} ${check.name}: ${check.detail}\n`);
  if (checks.some((check) => !check.ok)) process.exitCode = 1;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0];
  const target = args[1] as Target;
  if (!["install", "uninstall", "doctor"].includes(command ?? "") || !targets.has(target)) usage();
  const scope = (valueAfter(args, "--scope") ?? "user") as Scope;
  if (!(["user", "project"] as string[]).includes(scope)) usage();
  const endpoint = (valueAfter(args, "--endpoint") ?? process.env.WEB_SEARCH_ENDPOINT ?? "").replace(/\/$/, "");
  if (!endpoint) usage();
  const parsed = new URL(endpoint);
  if (parsed.protocol !== "https:" && !["localhost", "127.0.0.1", "::1"].includes(parsed.hostname)) throw new Error("Remote endpoints must use HTTPS");
  const cwd = resolve(process.cwd());
  if (command === "doctor") return doctor(target, scope, endpoint, cwd, args.includes("--live"));
  await updateTarget({ target, scope, endpoint, cwd, force: args.includes("--force"), dryRun: args.includes("--dry-run"), piPackage: valueAfter(args, "--pi-package") }, command === "uninstall");
  if (command === "install") process.stdout.write(`Configured ${target}. Export WEB_SEARCH_API_KEY before starting the agent.\n`);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
