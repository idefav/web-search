import type { SearchResult } from "./contracts.js";
import { WebToolError } from "./errors.js";

interface Candidate {
  title: string;
  url?: string;
  displayUrl?: string;
  snippet?: string;
}

function unescapeSnapshot(value: string): string {
  return value.replace(/\\"/g, '"').replace(/\\\\/g, "\\").trim();
}

function isGoogleHost(hostname: string): boolean {
  return /(^|\.)google\.[a-z.]+$/i.test(hostname);
}

function normalizeResultUrl(raw: string): { url: string; key: string } | null {
  try {
    let parsed = new URL(raw.trim());
    if (!/^https?:$/.test(parsed.protocol) || parsed.username || parsed.password) return null;
    if (isGoogleHost(parsed.hostname) && parsed.pathname === "/url") {
      const target = parsed.searchParams.get("q") ?? parsed.searchParams.get("url");
      if (!target) return null;
      parsed = new URL(target);
    }
    if (!/^https?:$/.test(parsed.protocol) || parsed.username || parsed.password) return null;
    if (isGoogleHost(parsed.hostname) && ["/search", "/preferences", "/advanced_search"].includes(parsed.pathname)) return null;
    parsed.hash = "";
    if ((parsed.protocol === "https:" && parsed.port === "443") || (parsed.protocol === "http:" && parsed.port === "80")) parsed.port = "";
    return { url: parsed.href, key: parsed.href };
  } catch {
    return null;
  }
}

export function isGoogleBlocked(snapshot: string, url = ""): boolean {
  return url.includes("google.com/sorry/") || /unusual traffic|about this page|having trouble accessing google search|SG_REL/i.test(snapshot);
}

export function isExplicitGoogleNoResults(snapshot: string): boolean {
  return /\bno results\b|did not match any documents|try different keywords/i.test(snapshot);
}

export function parseGoogleSnapshot(snapshot: string, count: number): SearchResult[] {
  const candidates: Candidate[] = [];
  let current: Candidate | undefined;
  for (const line of snapshot.split(/\r?\n/)) {
    const heading = line.match(/^- link "((?:\\.|[^"])*)" \[e\d+\]:\s*$/);
    if (heading?.[1]) {
      if (current) candidates.push(current);
      current = { title: unescapeSnapshot(heading[1]) };
      continue;
    }
    if (!current) continue;
    const field = line.match(/^\s{2}- (\/url|cite|text):\s*(.*)$/);
    if (field?.[1] === "/url") current.url = field[2]?.trim();
    if (field?.[1] === "cite") current.displayUrl = field[2]?.trim();
    if (field?.[1] === "text") current.snippet = field[2]?.trim();
    if (line.startsWith("- ") && !heading) {
      candidates.push(current);
      current = undefined;
    }
  }
  if (current) candidates.push(current);

  const seen = new Set<string>();
  const results: SearchResult[] = [];
  for (const candidate of candidates) {
    if (!candidate.title || !candidate.url) continue;
    const normalized = normalizeResultUrl(candidate.url);
    if (!normalized || seen.has(normalized.key)) continue;
    seen.add(normalized.key);
    results.push({
      rank: results.length + 1,
      title: candidate.title,
      url: normalized.url,
      ...(candidate.displayUrl ? { display_url: candidate.displayUrl } : {}),
      ...(candidate.snippet ? { snippet: candidate.snippet } : {})
    });
    if (results.length >= count) break;
  }

  if (results.length === 0 && /- link ".+" \[e\d+\]:[\s\S]*?- \/url:/m.test(snapshot)) {
    throw new WebToolError("upstream_contract_changed", "Google result snapshot no longer matches the supported contract");
  }
  return results;
}
