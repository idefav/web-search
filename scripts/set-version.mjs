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
  "plugins/pi/package.json"
];
const internalPackages = new Set([
  "camofox-web-search-core",
  "camofox-web-search-client",
  "camofox-web-search",
  "camofox-web-search-pi",
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

const npm = spawnSync("npm", ["install", "--package-lock-only", "--ignore-scripts"], { stdio: "inherit" });
if (npm.status !== 0) process.exit(npm.status ?? 1);
process.stdout.write(`Set workspace release version to ${version}\n`);
