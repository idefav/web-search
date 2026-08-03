import { spawnSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";

const version = process.argv[2]?.replace(/^v/, "");
if (!version || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) {
  throw new Error("Usage: npm run release:version -- <major.minor.patch[-prerelease]>");
}

const packageFiles = [
  "package.json",
  "apps/server/package.json",
  "packages/core/package.json",
  "packages/client/package.json",
  "packages/cli/package.json",
  "plugins/pi/package.json",
  "plugins/openclaw/package.json"
];
const internalPackages = new Set([
  "camofox-web-search-core",
  "camofox-web-search-client",
  "camofox-web-search",
  "camofox-web-search-pi",
  "camofox-web-search-openclaw",
  "camofox-web-search-server"
]);

for (const path of packageFiles) {
  const data = JSON.parse(await readFile(path, "utf8"));
  data.version = version;
  for (const field of ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"]) {
    for (const dependency of Object.keys(data[field] ?? {})) {
      if (internalPackages.has(dependency)) data[field][dependency] = version;
    }
  }
  await writeFile(path, `${JSON.stringify(data, null, 2)}\n`);
}

const hermesPath = "plugins/hermes/pyproject.toml";
const hermes = await readFile(hermesPath, "utf8");
await writeFile(hermesPath, hermes.replace(/^version = "[^"]+"$/m, `version = "${version}"`));
const hermesManifestPath = "plugins/hermes/src/camofox_web_search_hermes/plugin.yaml";
const hermesManifest = await readFile(hermesManifestPath, "utf8");
await writeFile(hermesManifestPath, hermesManifest.replace(/^version: .+$/m, `version: ${version}`));
const hermesLockPath = "plugins/hermes/uv.lock";
const hermesLock = await readFile(hermesLockPath, "utf8");
await writeFile(hermesLockPath, hermesLock.replace(/(name = "camofox-web-search-hermes"\nversion = ")[^"]+/, `$1${version}`));

const sourceVersions = [
  ["apps/server/src/openapi.ts", /(title: "Camofox Web Search API", version: ")[^"]+/],
  ["apps/server/src/mcp.ts", /(name: "camofox-web-search", version: ")[^"]+/],
  ["packages/cli/src/config-editors.ts", /(options\.version \?\? ")[^"]+/g]
];
for (const [path, pattern] of sourceVersions) {
  const content = await readFile(path, "utf8");
  await writeFile(path, content.replace(pattern, `$1${version}`));
}

const npm = spawnSync("npm", ["install", "--package-lock-only", "--ignore-scripts"], { stdio: "inherit" });
if (npm.status !== 0) process.exit(npm.status ?? 1);
process.stdout.write(`Set workspace release version to ${version}\n`);
