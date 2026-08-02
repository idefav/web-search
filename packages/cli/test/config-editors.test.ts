import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { parse } from "jsonc-parser";
import { updateTarget } from "../src/config-editors.js";

const temporary: string[] = [];
afterEach(async () => Promise.all(temporary.splice(0).map((path) => rm(path, { recursive: true, force: true }))));

async function workspace(): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), "camofox-installer-"));
  temporary.push(path);
  return path;
}

describe("agent config installers", () => {
  it("installs Codex idempotently and removes only its managed block", async () => {
    const cwd = await workspace();
    const options = { target: "codex" as const, scope: "project" as const, endpoint: "https://search.example", cwd, force: false, dryRun: false };
    await updateTarget(options);
    await updateTarget(options);
    const path = join(cwd, ".codex", "config.toml");
    const installed = await readFile(path, "utf8");
    expect(installed.match(/BEGIN camofox-web-search/g)).toHaveLength(1);
    expect(installed).toContain('bearer_token_env_var = "WEB_SEARCH_API_KEY"');
    await updateTarget(options, true);
    expect(await readFile(path, "utf8")).toBe("");
  });

  it("preserves unrelated Claude fields", async () => {
    const cwd = await workspace();
    await writeFile(join(cwd, ".mcp.json"), JSON.stringify({ custom: true, mcpServers: { other: { command: "x" } } }));
    await updateTarget({ target: "claude", scope: "project", endpoint: "https://search.example", cwd, force: false, dryRun: false });
    const data = JSON.parse(await readFile(join(cwd, ".mcp.json"), "utf8"));
    expect(data.custom).toBe(true);
    expect(data.mcpServers.other).toEqual({ command: "x" });
    expect(data.mcpServers.camofox_web.headers.Authorization).toBe("Bearer ${WEB_SEARCH_API_KEY}");
  });

  it("preserves JSONC comments and detects OpenCode v2", async () => {
    const cwd = await workspace();
    await writeFile(join(cwd, "opencode.jsonc"), '{\n  // keep this\n  "mcp": { "servers": {} },\n  "theme": "dark"\n}\n');
    await updateTarget({ target: "opencode", scope: "project", endpoint: "https://search.example", cwd, force: false, dryRun: false });
    const content = await readFile(join(cwd, "opencode.jsonc"), "utf8");
    expect(content).toContain("// keep this");
    expect(content).toContain('"servers"');
    expect(content).toContain('Bearer {env:WEB_SEARCH_API_KEY}');
  });

  it("keeps checked-in manual examples aligned with generated project configuration", async () => {
    const cwd = await workspace();
    const endpoint = "https://search.example.com";
    const base = { scope: "project" as const, endpoint, cwd, force: false, dryRun: false };
    await updateTarget({ ...base, target: "codex" });
    await updateTarget({ ...base, target: "claude" });
    await updateTarget({ ...base, target: "opencode" });

    const examples = resolve(process.cwd(), "examples", "agent-configs");
    expect(await readFile(join(cwd, ".codex", "config.toml"), "utf8"))
      .toBe(await readFile(join(examples, "codex.toml"), "utf8"));
    expect(JSON.parse(await readFile(join(cwd, ".mcp.json"), "utf8")))
      .toEqual(JSON.parse(await readFile(join(examples, "claude.json"), "utf8")));
    expect(parse(await readFile(join(cwd, "opencode.jsonc"), "utf8")))
      .toEqual(parse(await readFile(join(examples, "opencode.jsonc"), "utf8")));
    expect(JSON.parse(await readFile(join(examples, "pi.json"), "utf8")))
      .toEqual({ endpoint });
  });
});
