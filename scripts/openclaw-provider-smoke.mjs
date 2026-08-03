import { join } from "node:path";
import { pathToFileURL } from "node:url";

const stateDir = process.env.OPENCLAW_STATE_DIR;
const endpoint = process.env.WEB_SEARCH_ENDPOINT;
const apiKey = process.env.WEB_SEARCH_API_KEY;
if (!stateDir || !endpoint || !apiKey) throw new Error("OPENCLAW_STATE_DIR, WEB_SEARCH_ENDPOINT, and WEB_SEARCH_API_KEY are required");

let searchProvider;
let fetchProvider;
const entry = await import(pathToFileURL(join(stateDir, "extensions", "camofox", "dist", "index.js")).href);
entry.default.register({
  pluginConfig: { endpoint, webSearch: { apiKey }, webFetch: { apiKey } },
  registerWebSearchProvider(provider) { searchProvider = provider; },
  registerWebFetchProvider(provider) { fetchProvider = provider; }
});
if (!searchProvider || !fetchProvider) throw new Error("OpenClaw did not register both Camofox providers");

const fetched = await fetchProvider.createTool({}).execute({ url: "https://example.com/", maxChars: 2_000 });
if (fetched.extractor !== "camofox" || !fetched.text || fetched.externalContent?.untrusted !== true) {
  throw new Error("OpenClaw web_fetch provider returned an invalid result");
}

try {
  const searched = await searchProvider.createTool({}).execute({ query: "Model Context Protocol official", count: 1 });
  if (searched.provider !== "camofox" || !Array.isArray(searched.results)) throw new Error("OpenClaw web_search provider returned an invalid result");
} catch (error) {
  if (!new Set(["search_blocked", "upstream_unavailable", "upstream_timeout"]).has(error?.code)) throw error;
}

process.stdout.write("OpenClaw native provider Docker smoke passed\n");

