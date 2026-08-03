import { readFile } from "node:fs/promises";

const packageFiles = [
  "package.json",
  "apps/server/package.json",
  "packages/core/package.json",
  "packages/client/package.json",
  "packages/cli/package.json",
  "plugins/pi/package.json",
  "plugins/openclaw/package.json"
];
const packages = await Promise.all(packageFiles.map(async (path) => ({ path, data: JSON.parse(await readFile(path, "utf8")) })));
const versions = new Set(packages.map(({ data }) => data.version));
if (versions.size !== 1) throw new Error(`Publishable package versions differ: ${[...versions].join(", ")}`);
const version = packages[0].data.version;
const hermes = await readFile("plugins/hermes/pyproject.toml", "utf8");
const hermesVersion = hermes.match(/^version = "([^"]+)"$/m)?.[1];
if (hermesVersion !== version) throw new Error(`plugins/hermes/pyproject.toml must use version ${version}`);
const hermesManifest = await readFile("plugins/hermes/src/camofox_web_search_hermes/plugin.yaml", "utf8");
const hermesManifestVersion = hermesManifest.match(/^version: (.+)$/m)?.[1];
if (hermesManifestVersion !== version) throw new Error(`Hermes plugin.yaml must use version ${version}`);
const hermesLock = await readFile("plugins/hermes/uv.lock", "utf8");
const hermesLockVersion = hermesLock.match(/name = "camofox-web-search-hermes"\nversion = "([^"]+)"/)?.[1];
if (hermesLockVersion !== version) throw new Error(`plugins/hermes/uv.lock must use version ${version}`);
for (const [path, pattern] of [
  ["apps/server/src/openapi.ts", /title: "Camofox Web Search API", version: "([^"]+)"/],
  ["apps/server/src/mcp.ts", /name: "camofox-web-search", version: "([^"]+)"/]
]) {
  const content = await readFile(path, "utf8");
  const sourceVersion = content.match(pattern)?.[1];
  if (sourceVersion !== version) throw new Error(`${path} must use version ${version}`);
}
const cliEditor = await readFile("packages/cli/src/config-editors.ts", "utf8");
const cliFallbackVersions = [...cliEditor.matchAll(/options\.version \?\? "([^"]+)"/g)].map((match) => match[1]);
if (cliFallbackVersions.length !== 2 || cliFallbackVersions.some((value) => value !== version)) {
  throw new Error(`packages/cli/src/config-editors.ts fallbacks must use version ${version}`);
}
const expectedRef = process.env.GITHUB_REF_TYPE === "tag" ? process.env.GITHUB_REF_NAME : "";
const expected = (process.env.RELEASE_VERSION ?? expectedRef ?? "").replace(/^v/, "");
if (expected && expected !== version) throw new Error(`Release ${expected} does not match package version ${version}`);

for (const { path, data } of packages) {
  for (const dependency of ["camofox-web-search-core", "camofox-web-search-client", "camofox-web-search", "camofox-web-search-pi", "camofox-web-search-openclaw", "camofox-web-search-server"]) {
    if (data.dependencies?.[dependency] && data.dependencies[dependency] !== version) {
      throw new Error(`${path} must depend on ${dependency}@${version}`);
    }
  }
}
process.stdout.write(`Release metadata is consistent at ${version}\n`);
