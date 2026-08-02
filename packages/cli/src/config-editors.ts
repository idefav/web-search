import { copyFile, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import { applyEdits, modify, parse } from "jsonc-parser";
import { spawnSync } from "node:child_process";

export type Target = "codex" | "claude" | "opencode" | "pi";
export type Scope = "user" | "project";

export interface InstallOptions {
  target: Target;
  scope: Scope;
  endpoint: string;
  cwd: string;
  force: boolean;
  dryRun: boolean;
  piPackage?: string;
}

const begin = "# BEGIN camofox-web-search";
const end = "# END camofox-web-search";

function mcpUrl(endpoint: string): string { return `${endpoint.replace(/\/$/, "")}/mcp`; }

async function readOptional(path: string): Promise<string> {
  return readFile(path, "utf8").catch((error: NodeJS.ErrnoException) => error.code === "ENOENT" ? "" : Promise.reject(error));
}

async function atomicWrite(path: string, content: string, dryRun: boolean): Promise<void> {
  if (dryRun) {
    process.stdout.write(`[dry-run] write ${path}\n${content}\n`);
    return;
  }
  await mkdir(dirname(path), { recursive: true });
  const previous = await readOptional(path);
  if (previous) await copyFile(path, `${path}.backup-${Date.now()}`);
  const temporary = `${path}.tmp-${process.pid}`;
  await writeFile(temporary, content, { mode: 0o600 });
  await rename(temporary, path);
}

function configPath(target: Target, scope: Scope, cwd: string): string {
  if (target === "codex") return scope === "user" ? join(homedir(), ".codex", "config.toml") : join(cwd, ".codex", "config.toml");
  if (target === "claude") return scope === "user" ? join(homedir(), ".claude.json") : join(cwd, ".mcp.json");
  if (target === "opencode") return scope === "user" ? join(homedir(), ".config", "opencode", "opencode.jsonc") : join(cwd, "opencode.jsonc");
  return scope === "user" ? join(homedir(), ".config", "camofox-web-search", "pi.json") : join(cwd, ".camofox-web-search", "pi.json");
}

async function installCodex(options: InstallOptions, remove: boolean): Promise<void> {
  const path = configPath("codex", options.scope, options.cwd);
  const original = await readOptional(path);
  const managedPattern = new RegExp(`\\n?${begin}[\\s\\S]*?${end}\\n?`, "m");
  const unmanaged = original.replace(managedPattern, "\n").trimEnd();
  if (remove) return atomicWrite(path, unmanaged ? `${unmanaged}\n` : "", options.dryRun);
  if (/^\[mcp_servers\.camofox_web\]\s*$/m.test(unmanaged) && !options.force) throw new Error("Codex entry mcp_servers.camofox_web already exists outside the managed block; use --force");
  const cleaned = options.force ? unmanaged.replace(/^\[mcp_servers\.camofox_web\][\s\S]*?(?=^\[|\s*$)/m, "").trimEnd() : unmanaged;
  const block = `${begin}\n[mcp_servers.camofox_web]\nurl = ${JSON.stringify(mcpUrl(options.endpoint))}\nbearer_token_env_var = "WEB_SEARCH_API_KEY"\n${end}`;
  await atomicWrite(path, `${cleaned}${cleaned ? "\n\n" : ""}${block}\n`, options.dryRun);
}

async function installClaude(options: InstallOptions, remove: boolean): Promise<void> {
  const path = configPath("claude", options.scope, options.cwd);
  const original = await readOptional(path);
  const data = original ? JSON.parse(original) as Record<string, unknown> : {};
  const servers = (data.mcpServers && typeof data.mcpServers === "object" ? data.mcpServers : {}) as Record<string, unknown>;
  if (remove) delete servers.camofox_web;
  else {
    const desired = { type: "http", url: mcpUrl(options.endpoint), headers: { Authorization: "Bearer ${WEB_SEARCH_API_KEY}" } };
    if (servers.camofox_web && JSON.stringify(servers.camofox_web) !== JSON.stringify(desired) && !options.force) throw new Error("Claude MCP entry already exists with different values; use --force");
    servers.camofox_web = desired;
  }
  data.mcpServers = servers;
  await atomicWrite(path, `${JSON.stringify(data, null, 2)}\n`, options.dryRun);
}

async function installOpenCode(options: InstallOptions, remove: boolean): Promise<void> {
  const path = configPath("opencode", options.scope, options.cwd);
  const original = await readOptional(path);
  const content = original || "{}\n";
  const parsed = parse(content) as { mcp?: Record<string, unknown> } | undefined;
  const isV2 = !!(parsed?.mcp && typeof parsed.mcp.servers === "object");
  const propertyPath = isV2 ? ["mcp", "servers", "camofox_web"] : ["mcp", "camofox_web"];
  const current = propertyPath.reduce<unknown>((value, key) => value && typeof value === "object" ? (value as Record<string, unknown>)[key] : undefined, parsed);
  const desired = { type: "remote", url: mcpUrl(options.endpoint), headers: { Authorization: "Bearer {env:WEB_SEARCH_API_KEY}" }, oauth: false };
  if (!remove && current && JSON.stringify(current) !== JSON.stringify(desired) && !options.force) throw new Error("OpenCode MCP entry already exists with different values; use --force");
  const edits = modify(content, propertyPath, remove ? undefined : desired, { formattingOptions: { insertSpaces: true, tabSize: 2 } });
  await atomicWrite(path, applyEdits(content, edits), options.dryRun);
}

async function installPi(options: InstallOptions, remove: boolean): Promise<void> {
  const path = configPath("pi", options.scope, options.cwd);
  const data = remove ? {} : { endpoint: options.endpoint.replace(/\/$/, "") };
  const source = options.piPackage ?? process.env.CAMOFOX_WEB_SEARCH_PI_PACKAGE ?? "npm:camofox-web-search-pi";
  const args = [remove ? "remove" : "install", ...(options.scope === "project" ? ["-l"] : []), source];
  if (remove && !options.dryRun) runPi(args, options.cwd);
  await atomicWrite(path, `${JSON.stringify(data, null, 2)}\n`, options.dryRun);
  if (!remove && !options.dryRun) runPi(args, options.cwd);
  if (options.dryRun) process.stdout.write(`[dry-run] pi ${args.join(" ")}\n`);
}

function runPi(args: string[], cwd: string): void {
  const result = spawnSync(process.env.PI_BIN ?? "pi", args, { cwd, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`pi ${args[0]} failed with exit code ${result.status}`);
}

export async function updateTarget(options: InstallOptions, remove = false): Promise<void> {
  if (options.target === "codex") return installCodex(options, remove);
  if (options.target === "claude") return installClaude(options, remove);
  if (options.target === "opencode") return installOpenCode(options, remove);
  return installPi(options, remove);
}

export { configPath };
