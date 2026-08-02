import { readFile } from "node:fs/promises";

const packageFiles = [
  "packages/core/package.json",
  "packages/client/package.json",
  "packages/cli/package.json",
  "plugins/pi/package.json"
];
const packages = await Promise.all(packageFiles.map(async (path) => ({ path, data: JSON.parse(await readFile(path, "utf8")) })));
const versions = new Set(packages.map(({ data }) => data.version));
if (versions.size !== 1) throw new Error(`Publishable package versions differ: ${[...versions].join(", ")}`);
const version = packages[0].data.version;
const expectedRef = process.env.GITHUB_REF_TYPE === "tag" ? process.env.GITHUB_REF_NAME : "";
const expected = (process.env.RELEASE_VERSION ?? expectedRef ?? "").replace(/^v/, "");
if (expected && expected !== version) throw new Error(`Release ${expected} does not match package version ${version}`);

for (const { path, data } of packages) {
  for (const dependency of ["camofox-web-search-core", "camofox-web-search-client"]) {
    if (data.dependencies?.[dependency] && data.dependencies[dependency] !== version) {
      throw new Error(`${path} must depend on ${dependency}@${version}`);
    }
  }
}
process.stdout.write(`Release metadata is consistent at ${version}\n`);
