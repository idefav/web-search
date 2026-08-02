import { domainToASCII } from "node:url";
import type { SearchRequest } from "./contracts.js";
import { WebToolError } from "./errors.js";

const freshnessMap = { day: "d", week: "w", month: "m", year: "y" } as const;

export function normalizeDomain(value: string): string {
  const raw = value.trim().toLowerCase().replace(/\.$/, "");
  if (!raw || raw.includes("://") || /[\s/@?#:]/.test(raw)) {
    throw new WebToolError("invalid_input", `Invalid bare domain: ${value}`);
  }
  const ascii = domainToASCII(raw);
  if (!ascii || ascii.length > 253 || !/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(ascii)) {
    throw new WebToolError("invalid_input", `Invalid bare domain: ${value}`);
  }
  return ascii;
}

export function buildGoogleSearchUrl(input: SearchRequest): string {
  const include = [...new Set(input.include_domains.map(normalizeDomain))];
  const exclude = [...new Set(input.exclude_domains.map(normalizeDomain))];
  const conflict = include.find((domain) => exclude.includes(domain));
  if (conflict) throw new WebToolError("invalid_input", `Domain cannot be both included and excluded: ${conflict}`);

  const additions: string[] = [];
  if (include.length === 1) additions.push(`site:${include[0]}`);
  if (include.length > 1) additions.push(`(${include.map((domain) => `site:${domain}`).join(" OR ")})`);
  additions.push(...exclude.map((domain) => `-site:${domain}`));

  const url = new URL("https://www.google.com/search");
  url.searchParams.set("q", [input.query, ...additions].join(" "));
  url.searchParams.set("num", String(Math.min(10, Math.max(input.count, 5))));
  if (input.language) {
    url.searchParams.set("hl", input.language);
    url.searchParams.set("lr", `lang_${input.language}`);
  }
  if (input.country) url.searchParams.set("gl", input.country.toLowerCase());
  if (input.freshness) url.searchParams.set("tbs", `qdr:${freshnessMap[input.freshness]}`);
  if (url.href.length > 2048) throw new WebToolError("invalid_input", "Compiled search URL exceeds 2048 characters");
  return url.href;
}
