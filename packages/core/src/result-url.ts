function isGoogleHost(hostname: string): boolean {
  return /(^|\.)google\.[a-z.]+$/i.test(hostname);
}

function isBingHost(hostname: string): boolean {
  return /(^|\.)bing\.com$/i.test(hostname);
}

function decodeBingTarget(value: string): string | null {
  if (!value.startsWith("a1") || value.length <= 2) return null;
  try {
    return Buffer.from(value.slice(2), "base64url").toString("utf8");
  } catch {
    return null;
  }
}

export function normalizeResultUrl(raw: string): { url: string; key: string } | null {
  try {
    let parsed = new URL(raw.trim());
    if (!/^https?:$/.test(parsed.protocol) || parsed.username || parsed.password) return null;
    if (isGoogleHost(parsed.hostname) && parsed.pathname === "/url") {
      const target = parsed.searchParams.get("q") ?? parsed.searchParams.get("url");
      if (!target) return null;
      parsed = new URL(target);
    }
    if (isBingHost(parsed.hostname) && parsed.pathname === "/ck/a") {
      const target = parsed.searchParams.get("u");
      const decoded = target ? decodeBingTarget(target) : null;
      if (decoded) parsed = new URL(decoded);
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

export function isSearchEngineHost(hostname: string, provider: string): boolean {
  if (provider === "google") return isGoogleHost(hostname);
  if (provider === "bing") return isBingHost(hostname);
  if (provider === "duckduckgo") return /(^|\.)duckduckgo\.com$/i.test(hostname);
  if (provider === "brave") return /(^|\.)search\.brave\.com$/i.test(hostname);
  return false;
}

export function snapshotText(value: string): string {
  return value.replace(/\\"/g, '"').replace(/\\\\/g, "\\").trim();
}
