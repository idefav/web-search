import type { SearchRequest, SearchResult } from "./contracts.js";
import { WebToolError } from "./errors.js";
import { isExplicitGoogleNoResults, isGoogleBlocked, parseGoogleSnapshot } from "./google-parser.js";
import { buildBingSearchUrl, buildBraveSearchUrl, buildDuckDuckGoSearchUrl, buildGoogleSearchUrl } from "./query.js";
import { isSearchEngineHost, normalizeResultUrl, snapshotText } from "./result-url.js";

export const builtInSearchProviderIds = ["duckduckgo", "brave", "bing", "google"] as const;
export type BuiltInSearchProviderId = (typeof builtInSearchProviderIds)[number];

export interface SearchProvider {
  readonly id: string;
  readonly concurrency?: number;
  supports(input: SearchRequest): boolean;
  buildUrl(input: SearchRequest): string;
  isBlocked(snapshot: string, url: string): boolean;
  isNoResults(snapshot: string): boolean;
  parse(snapshot: string, count: number): SearchResult[];
}

const blockedPattern = /captcha|verify (?:that )?you are human|unusual traffic|automated quer(?:y|ies)|access denied|challenge-form|pow captcha|one last step|solve the challenge|机器人|驗證您是人類|验证您是人类/i;
const noResultsPattern = /\bno results\b|did not match any documents|找不到(?:任何)?结果|没有(?:任何)?结果|未找到(?:任何)?结果|找不到(?:任何)?結果|沒有(?:任何)?結果/i;

interface Candidate {
  title: string;
  url?: string;
  snippet?: string;
}

function result(candidate: Candidate, provider: string, seen: Set<string>, rank: number): SearchResult | null {
  if (!candidate.title || !candidate.url) return null;
  const normalized = normalizeResultUrl(candidate.url);
  if (!normalized || seen.has(normalized.key)) return null;
  const hostname = new URL(normalized.url).hostname;
  if (isSearchEngineHost(hostname, provider)) return null;
  seen.add(normalized.key);
  return {
    rank,
    title: snapshotText(candidate.title),
    url: normalized.url,
    display_url: hostname,
    ...(candidate.snippet ? { snippet: snapshotText(candidate.snippet) } : {})
  };
}

function parseHeadingResults(snapshot: string, count: number, provider: string): SearchResult[] {
  const lines = snapshot.split(/\r?\n/);
  const candidates: Candidate[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const heading = lines[index]?.match(/^\s*- '?heading "((?:\\.|[^"])*)" \[level=2\]'?:\s*$/);
    if (!heading?.[1]) continue;
    const candidate: Candidate = { title: heading[1] };
    for (let cursor = index + 1; cursor < Math.min(lines.length, index + 10); cursor += 1) {
      const line = lines[cursor] ?? "";
      if (cursor > index + 1 && /- '?heading ".+" \[level=2\]'?:/.test(line)) break;
      const url = line.match(/^\s*- \/url:\s*(.+)$/)?.[1];
      if (url && !candidate.url) candidate.url = url.trim();
      const snippet = line.match(/^\s*- (?:paragraph|text):\s*(.+)$/)?.[1];
      if (candidate.url && snippet && snapshotText(snippet) !== snapshotText(candidate.title)) {
        candidate.snippet = snippet;
        break;
      }
    }
    candidates.push(candidate);
  }
  return normalizeCandidates(candidates, provider, count, snapshot, /heading ".+" \[level=2\]'?:[\s\S]*?- \/url:/m);
}

function parseBraveResults(snapshot: string, count: number): SearchResult[] {
  const lines = snapshot.split(/\r?\n/);
  const candidates: Candidate[] = [];
  let inMain = false;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    if (/^- main:/.test(line)) inMain = true;
    if (!inMain) continue;
    const link = line.match(/^\s*- '?link "((?:\\.|[^"])*)"(?: \[e\d+\])?'?:\s*$/);
    if (!link?.[1]) continue;
    const url = lines[index + 1]?.match(/^\s*- \/url:\s*(.+)$/)?.[1];
    if (!url) continue;
    const candidate: Candidate = { title: link[1].replace(/^🌐\s*/, ""), url: url.trim() };
    for (let cursor = index + 2; cursor < Math.min(lines.length, index + 8); cursor += 1) {
      const next = lines[cursor] ?? "";
      if (/^\s*- '?link "/.test(next)) break;
      const text = next.match(/^\s*- text:\s*(.+)$/)?.[1];
      if (text && snapshotText(text) !== snapshotText(candidate.title)) {
        candidate.snippet = text;
        break;
      }
    }
    candidates.push(candidate);
  }
  return normalizeCandidates(candidates, "brave", count, snapshot, /- main:[\s\S]*?- '?link ".+"[\s\S]*?- \/url:/m);
}

function normalizeCandidates(candidates: Candidate[], provider: string, count: number, snapshot: string, resultShape: RegExp): SearchResult[] {
  const seen = new Set<string>();
  const results: SearchResult[] = [];
  for (const candidate of candidates) {
    const normalized = result(candidate, provider, seen, results.length + 1);
    if (normalized) results.push(normalized);
    if (results.length >= count) break;
  }
  if (results.length === 0 && resultShape.test(snapshot)) {
    throw new WebToolError("upstream_contract_changed", `${provider} result snapshot no longer matches the supported contract`);
  }
  return results;
}

function provider(
  id: BuiltInSearchProviderId,
  buildUrl: (input: SearchRequest) => string,
  parse: (snapshot: string, count: number) => SearchResult[],
  options: { concurrency?: number; supports?: (input: SearchRequest) => boolean; blocked?: RegExp; noResults?: RegExp } = {}
): SearchProvider {
  return {
    id,
    ...(options.concurrency ? { concurrency: options.concurrency } : {}),
    supports: options.supports ?? (() => true),
    buildUrl,
    isBlocked: (snapshot, url) => blockedPattern.test(snapshot) || options.blocked?.test(snapshot) === true || url.includes("/sorry/") || url.includes("/challenge"),
    isNoResults: (snapshot) => noResultsPattern.test(snapshot) || options.noResults?.test(snapshot) === true,
    parse
  };
}

const registry: Record<BuiltInSearchProviderId, () => SearchProvider> = {
  duckduckgo: () => provider("duckduckgo", buildDuckDuckGoSearchUrl, (snapshot, count) => parseHeadingResults(snapshot, count, "duckduckgo"), {
    supports: (input) => (!input.language && !input.country) || Boolean(input.language && input.country),
    blocked: /bots use duckduckgo too/i
  }),
  brave: () => provider("brave", buildBraveSearchUrl, parseBraveResults),
  bing: () => provider("bing", buildBingSearchUrl, (snapshot, count) => parseHeadingResults(snapshot, count, "bing"), {
    supports: (input) => !input.freshness
  }),
  google: () => ({
    id: "google",
    concurrency: 1,
    supports: () => true,
    buildUrl: buildGoogleSearchUrl,
    isBlocked: isGoogleBlocked,
    isNoResults: isExplicitGoogleNoResults,
    parse: parseGoogleSnapshot
  })
};

export function createBuiltinSearchProviders(ids: readonly string[] = builtInSearchProviderIds): SearchProvider[] {
  return ids.map((id) => {
    if (!builtInSearchProviderIds.includes(id as BuiltInSearchProviderId)) throw new Error(`Unknown search provider: ${id}`);
    return registry[id as BuiltInSearchProviderId]();
  });
}
