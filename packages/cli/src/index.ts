#!/usr/bin/env node
import { access, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { configPath, detectHermesPython, type Scope, type Target, updateTarget } from "./config-editors.js";

const targets = new Set<Target>(["codex", "claude", "opencode", "pi", "openclaw", "hermes"]);
const cliVersion = (JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8")) as { version: string }).version;

function valueAfter(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

function usage(): never {
  throw new Error("Usage: camofox-web-search <install|uninstall|doctor> <codex|claude|opencode|pi|openclaw|hermes> --endpoint <https://host> [--scope user|project] [--dry-run] [--force] [--live] [--pi-package <source>] [--openclaw-package <source>] [--hermes-package <source>] [--hermes-python <path>]");
}

async function doctor(target: Target, scope: Scope, endpoint: string, cwd: string, live: boolean, hermesPython?: string): Promise<void> {
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
    const client = new Client({ name: "camofox-web-search-doctor", version: cliVersion });
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
  if (target === "openclaw") {
    const result = await import("node:child_process").then(({ spawnSync }) => spawnSync(process.env.OPENCLAW_BIN ?? "openclaw", ["plugins", "inspect", "camofox", "--runtime", "--json"], { encoding: "utf8" }));
    let registered = false;
    if (result.status === 0) {
      try {
        const plugin = (JSON.parse(result.stdout) as { plugin?: { webSearchProviderIds?: string[]; webFetchProviderIds?: string[] } }).plugin;
        registered = plugin?.webSearchProviderIds?.includes("camofox") === true && plugin.webFetchProviderIds?.includes("camofox") === true;
      } catch {
        registered = false;
      }
    }
    checks.push({ name: "openclaw-provider", ok: registered, detail: registered ? "camofox search/fetch providers registered" : (result.stderr.trim() || "runtime inspection failed") });
  }
  if (target === "hermes") {
    let command = hermesPython ?? process.env.HERMES_PYTHON ?? "";
    try {
      command ||= detectHermesPython({ target, scope, endpoint, cwd, force: false, dryRun: false });
    } catch {
      command = "python3";
    }
    const result = await import("node:child_process").then(({ spawnSync }) => spawnSync(command, ["-c", "from camofox_web_search_hermes import CamofoxWebSearchProvider as P; p=P(); assert p.supports_search() and p.supports_extract(); print(p.name)"], { encoding: "utf8" }));
    checks.push({ name: "hermes-provider", ok: result.status === 0 && result.stdout.trim() === "camofox", detail: result.status === 0 ? "camofox search/extract provider importable" : (result.stderr.trim() || "provider import failed; pass --hermes-python") });
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
  if (command === "doctor") return doctor(target, scope, endpoint, cwd, args.includes("--live"), valueAfter(args, "--hermes-python"));
  await updateTarget({
    target,
    scope,
    endpoint,
    cwd,
    force: args.includes("--force"),
    dryRun: args.includes("--dry-run"),
    piPackage: valueAfter(args, "--pi-package"),
    openclawPackage: valueAfter(args, "--openclaw-package"),
    hermesPackage: valueAfter(args, "--hermes-package"),
    hermesPython: valueAfter(args, "--hermes-python"),
    version: cliVersion
  }, command === "uninstall");
  if (command === "install") process.stdout.write(`Configured ${target}. Export WEB_SEARCH_API_KEY before starting the agent.\n`);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
