import { access, readFile, readdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const site = join(root, ".pages");

async function filesBelow(path) {
  const entries = await readdir(path, { withFileTypes: true });
  const nested = await Promise.all(entries.map((entry) => entry.isDirectory() ? filesBelow(join(path, entry.name)) : [join(path, entry.name)]));
  return nested.flat();
}

const htmlFiles = (await filesBelow(site)).filter((path) => path.endsWith(".html"));
if (htmlFiles.length !== 10) throw new Error(`Expected 10 generated HTML pages, found ${htmlFiles.length}`);

for (const path of htmlFiles) {
  const html = await readFile(path, "utf8");
  if (/\{\{[^}]+\}\}/.test(html)) throw new Error(`Unresolved template placeholder in ${path}`);
  for (const match of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
    const reference = match[1];
    if (/^(?:https?:|mailto:|#)/.test(reference) || reference.startsWith("//")) continue;
    if (reference.startsWith("/")) throw new Error(`Root-absolute link ${reference} breaks project GitHub Pages in ${path}`);
    const clean = reference.split(/[?#]/, 1)[0];
    const resolved = resolve(dirname(path), clean);
    const target = clean.endsWith("/") ? join(resolved, "index.html") : resolved;
    await access(target).catch(() => { throw new Error(`Broken local reference ${reference} in ${path}`); });
  }
}

for (const required of [
  "examples/deepagents/README.md",
  "examples/deepagents/agent.py",
  "examples/deepagents/demo.cast",
  "examples/deepagents/model_provider.py",
  "articles/web-search-for-ai-agents.md",
  "examples/agent-configs/codex.toml",
  "examples/agent-configs/claude.json",
  "examples/agent-configs/opencode.jsonc",
  "examples/agent-configs/pi.json"
]) await access(join(root, required));

process.stdout.write(`Validated ${htmlFiles.length} generated documentation pages and example links\n`);
