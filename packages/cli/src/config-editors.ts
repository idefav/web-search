import { copyFile, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import { applyEdits, modify, parse } from "jsonc-parser";
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";

export type Target = "codex" | "claude" | "opencode" | "pi" | "openclaw" | "hermes";
export type Scope = "user" | "project";

export interface InstallOptions {
  target: Target;
  scope: Scope;
  endpoint: string;
  cwd: string;
  force: boolean;
  dryRun: boolean;
  piPackage?: string;
  openclawPackage?: string;
  hermesPackage?: string;
  hermesPython?: string;
  version?: string;
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
  if (target === "pi") return scope === "user" ? join(homedir(), ".config", "camofox-web-search", "pi.json") : join(cwd, ".camofox-web-search", "pi.json");
  if (target === "openclaw") return join(process.env.OPENCLAW_STATE_DIR ?? join(homedir(), ".openclaw"), "openclaw.json");
  return join(process.env.HERMES_HOME ?? join(homedir(), ".hermes"), "config.yaml");
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

function quote(value: string): string {
  return /[^A-Za-z0-9_./:@=-]/.test(value) ? JSON.stringify(value) : value;
}

function runExternal(command: string, args: string[], cwd: string, dryRun: boolean): void {
  if (dryRun) {
    process.stdout.write(`[dry-run] ${command} ${args.map(quote).join(" ")}\n`);
    return;
  }
  const result = spawnSync(command, args, { cwd, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} ${args[0] ?? ""} failed with exit code ${result.status}`);
}

function readExternal(command: string, args: string[], cwd: string): string | undefined {
  const result = spawnSync(command, args, { cwd, encoding: "utf8" });
  if (result.error) throw result.error;
  if (result.status !== 0) return undefined;
  const output = result.stdout.trim();
  if (!output) return undefined;
  try {
    const parsed = JSON.parse(output) as unknown;
    return typeof parsed === "string" ? parsed : JSON.stringify(parsed);
  } catch {
    return output;
  }
}

function requireReplace(current: string | undefined, desired: string, force: boolean, label: string): void {
  if (current && current !== desired && !force) throw new Error(`${label} is already set to ${current}; use --force to replace it`);
}

interface ManagedNativeState {
  endpoint: string;
  previous: Record<string, string | undefined>;
}

function managedStatePath(target: "openclaw" | "hermes", options: InstallOptions): string {
  return join(dirname(configPath(target, "user", options.cwd)), `.camofox-web-search-${target}.json`);
}

function readManagedState(target: "openclaw" | "hermes", options: InstallOptions): ManagedNativeState | undefined {
  try {
    return JSON.parse(readFileSync(managedStatePath(target, options), "utf8")) as ManagedNativeState;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

function writeManagedState(target: "openclaw" | "hermes", options: InstallOptions, state: ManagedNativeState): void {
  if (options.dryRun) return;
  const path = managedStatePath(target, options);
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.tmp-${process.pid}`;
  writeFileSync(temporary, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
  renameSync(temporary, path);
}

function removeManagedState(target: "openclaw" | "hermes", options: InstallOptions): void {
  if (options.dryRun) return;
  try {
    unlinkSync(managedStatePath(target, options));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}

function restoreExternal(command: string, path: string, previous: string | undefined, cwd: string, dryRun: boolean): void {
  runExternal(command, ["config", previous === undefined ? "unset" : "set", path, ...(previous === undefined ? [] : [previous])], cwd, dryRun);
}

function commandExists(command: string): boolean {
  const result = spawnSync(command, ["--version"], { encoding: "utf8", stdio: "ignore" });
  return !result.error && result.status === 0;
}

function hermesHome(): string {
  return process.env.HERMES_HOME ?? join(homedir(), ".hermes");
}

function pythonFromLauncher(path: string): string | undefined {
  try {
    const content = readFileSync(path, "utf8");
    const shebang = content.split(/\r?\n/, 1)[0]?.match(/^#!\s*(\S*python\S*)/);
    if (shebang?.[1]) return shebang[1];
    const wrapper = content.match(/^\s*exec\s+["']([^"']*python[^"']*)["']/m);
    return wrapper?.[1];
  } catch {
    return undefined;
  }
}

function detectHermesPython(options: InstallOptions): string {
  if (options.hermesPython) return options.hermesPython;
  if (process.env.HERMES_PYTHON) return process.env.HERMES_PYTHON;
  const hermes = spawnSync(process.env.HERMES_BIN ?? "hermes", ["--version"], { encoding: "utf8" });
  const path = hermes.error ? undefined : spawnSync("which", [process.env.HERMES_BIN ?? "hermes"], { encoding: "utf8" }).stdout.trim();
  if (path) {
    const launcherPython = pythonFromLauncher(path);
    if (launcherPython && commandExists(launcherPython)) return launcherPython;
  }
  const binary = process.platform === "win32" ? "Scripts/python.exe" : "bin/python";
  for (const directory of ["venv", ".venv"]) {
    const candidate = join(hermesHome(), "hermes-agent", directory, binary);
    if (commandExists(candidate)) return candidate;
  }
  throw new Error("Could not locate the HermesAgent Python interpreter; pass --hermes-python or set HERMES_PYTHON");
}

function detectHermesUv(): string | undefined {
  for (const candidate of [process.env.UV_BIN, "uv", join(hermesHome(), "bin", process.platform === "win32" ? "uv.exe" : "uv")]) {
    if (candidate && commandExists(candidate)) return candidate;
  }
  return undefined;
}

function installOpenClaw(options: InstallOptions, remove: boolean): void {
  if (options.scope !== "user") throw new Error("OpenClaw native plugins support only --scope user");
  const binary = process.env.OPENCLAW_BIN ?? "openclaw";
  const source = options.openclawPackage ?? process.env.CAMOFOX_WEB_SEARCH_OPENCLAW_PACKAGE ?? `npm:camofox-web-search-openclaw@${options.version ?? "0.0.5"}`;
  if (remove) {
    const state = readManagedState("openclaw", options);
    if (options.dryRun || readExternal(binary, ["config", "get", "tools.web.search.provider", "--json"], options.cwd) === "camofox") {
      restoreExternal(binary, "tools.web.search.provider", state?.previous.searchProvider, options.cwd, options.dryRun);
    }
    if (options.dryRun || readExternal(binary, ["config", "get", "tools.web.fetch.provider", "--json"], options.cwd) === "camofox") {
      restoreExternal(binary, "tools.web.fetch.provider", state?.previous.fetchProvider, options.cwd, options.dryRun);
    }
    for (const path of [
      "plugins.entries.camofox.config.webSearch.apiKey",
      "plugins.entries.camofox.config.webFetch.apiKey",
      "plugins.entries.camofox.config.endpoint"
    ]) {
      if (options.dryRun || readExternal(binary, ["config", "get", path, "--json"], options.cwd) !== undefined) {
        runExternal(binary, ["config", "unset", path], options.cwd, options.dryRun);
      }
    }
    if (options.dryRun || readExternal(binary, ["plugins", "inspect", "camofox", "--runtime", "--json"], options.cwd) !== undefined) {
      runExternal(binary, ["plugins", "uninstall", "camofox", "--force"], options.cwd, options.dryRun);
    }
    removeManagedState("openclaw", options);
    return;
  }
  const existingState = readManagedState("openclaw", options);
  const searchProvider = options.dryRun ? undefined : readExternal(binary, ["config", "get", "tools.web.search.provider", "--json"], options.cwd);
  const fetchProvider = options.dryRun ? undefined : readExternal(binary, ["config", "get", "tools.web.fetch.provider", "--json"], options.cwd);
  if (!options.dryRun) {
    requireReplace(searchProvider, "camofox", options.force, "OpenClaw web search provider");
    requireReplace(fetchProvider, "camofox", options.force, "OpenClaw web fetch provider");
    writeManagedState("openclaw", options, existingState ? { ...existingState, endpoint: options.endpoint } : { endpoint: options.endpoint, previous: { searchProvider, fetchProvider } });
  }
  runExternal(binary, ["plugins", "install", source, "--force"], options.cwd, options.dryRun);
  runExternal(binary, ["config", "set", "plugins.entries.camofox.config.endpoint", options.endpoint], options.cwd, options.dryRun);
  runExternal(binary, ["config", "set", "plugins.entries.camofox.config.webSearch.apiKey", "--ref-source", "env", "--ref-provider", "default", "--ref-id", "WEB_SEARCH_API_KEY"], options.cwd, options.dryRun);
  runExternal(binary, ["config", "set", "plugins.entries.camofox.config.webFetch.apiKey", "--ref-source", "env", "--ref-provider", "default", "--ref-id", "WEB_SEARCH_API_KEY"], options.cwd, options.dryRun);
  runExternal(binary, ["config", "set", "tools.web.search.provider", "camofox"], options.cwd, options.dryRun);
  runExternal(binary, ["config", "set", "tools.web.fetch.provider", "camofox"], options.cwd, options.dryRun);
  runExternal(binary, ["config", "validate"], options.cwd, options.dryRun);
  process.stdout.write("Restart the OpenClaw gateway, then run: openclaw plugins inspect camofox --runtime --json\n");
}

function installHermes(options: InstallOptions, remove: boolean): void {
  if (options.scope !== "user") throw new Error("HermesAgent native plugins support only --scope user");
  const binary = process.env.HERMES_BIN ?? "hermes";
  const python = options.dryRun && !options.hermesPython && !process.env.HERMES_PYTHON ? "<hermes-python>" : detectHermesPython(options);
  const source = options.hermesPackage ?? process.env.CAMOFOX_WEB_SEARCH_HERMES_PACKAGE ?? `camofox-web-search-hermes==${options.version ?? "0.0.5"}`;
  const uv = detectHermesUv();
  if (remove) {
    const state = readManagedState("hermes", options);
    if (options.dryRun || readExternal(binary, ["config", "get", "web.search_backend"], options.cwd) === "camofox") {
      restoreExternal(binary, "web.search_backend", state?.previous.searchBackend, options.cwd, options.dryRun);
    }
    if (options.dryRun || readExternal(binary, ["config", "get", "web.extract_backend"], options.cwd) === "camofox") {
      restoreExternal(binary, "web.extract_backend", state?.previous.extractBackend, options.cwd, options.dryRun);
    }
    if (options.dryRun || readExternal(binary, ["config", "get", "WEB_SEARCH_ENDPOINT"], options.cwd) === state?.endpoint) {
      restoreExternal(binary, "WEB_SEARCH_ENDPOINT", state?.previous.endpoint, options.cwd, options.dryRun);
    }
    runExternal(binary, ["plugins", "disable", "camofox-web-search"], options.cwd, options.dryRun);
    if (uv) runExternal(uv, ["pip", "uninstall", "--python", python, "camofox-web-search-hermes"], options.cwd, options.dryRun);
    else runExternal(python, ["-m", "pip", "uninstall", "-y", "camofox-web-search-hermes"], options.cwd, options.dryRun);
    removeManagedState("hermes", options);
    return;
  }
  const existingState = readManagedState("hermes", options);
  const searchBackend = options.dryRun ? undefined : readExternal(binary, ["config", "get", "web.search_backend"], options.cwd);
  const extractBackend = options.dryRun ? undefined : readExternal(binary, ["config", "get", "web.extract_backend"], options.cwd);
  const previousEndpoint = options.dryRun ? undefined : readExternal(binary, ["config", "get", "WEB_SEARCH_ENDPOINT"], options.cwd);
  if (!options.dryRun) {
    requireReplace(searchBackend, "camofox", options.force, "HermesAgent web search backend");
    requireReplace(extractBackend, "camofox", options.force, "HermesAgent web extract backend");
    writeManagedState("hermes", options, existingState ? { ...existingState, endpoint: options.endpoint } : { endpoint: options.endpoint, previous: { searchBackend, extractBackend, endpoint: previousEndpoint } });
  }
  if (uv) runExternal(uv, ["pip", "install", "--python", python, source], options.cwd, options.dryRun);
  else runExternal(python, ["-m", "pip", "install", source], options.cwd, options.dryRun);
  runExternal(binary, ["plugins", "enable", "camofox-web-search", "--no-allow-tool-override"], options.cwd, options.dryRun);
  runExternal(binary, ["config", "set", "WEB_SEARCH_ENDPOINT", options.endpoint, "--force"], options.cwd, options.dryRun);
  runExternal(binary, ["config", "set", "web.search_backend", "camofox"], options.cwd, options.dryRun);
  runExternal(binary, ["config", "set", "web.extract_backend", "camofox"], options.cwd, options.dryRun);
}

export async function updateTarget(options: InstallOptions, remove = false): Promise<void> {
  if (options.target === "codex") return installCodex(options, remove);
  if (options.target === "claude") return installClaude(options, remove);
  if (options.target === "opencode") return installOpenCode(options, remove);
  if (options.target === "pi") return installPi(options, remove);
  if (options.target === "openclaw") return installOpenClaw(options, remove);
  return installHermes(options, remove);
}

export { configPath, detectHermesPython };
