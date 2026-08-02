import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { domainToASCII } from "node:url";
import { WebToolError } from "./errors.js";

export type Resolver = (hostname: string) => Promise<string[]>;

const defaultResolver: Resolver = async (hostname) => (await lookup(hostname, { all: true, verbatim: true })).map((entry) => entry.address);

export function isBlockedIp(address: string): boolean {
  if (address.toLowerCase().startsWith("::ffff:")) return isBlockedIp(address.slice(7));
  if (isIP(address) === 4) {
    const octets = address.split(".").map(Number);
    const [a = 0, b = 0] = octets;
    return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && (b === 0 || b === 168)) || (a === 198 && (b === 18 || b === 19 || b === 51)) ||
      (a === 203 && b === 0) || a >= 224;
  }
  if (isIP(address) === 6) {
    const value = address.toLowerCase();
    return value === "::" || value === "::1" || value.startsWith("fc") || value.startsWith("fd") ||
      /^fe[89ab]/.test(value) || value.startsWith("ff") || value.startsWith("2001:db8:");
  }
  return true;
}

export async function assertSafePublicUrl(raw: string, resolver: Resolver = defaultResolver, allowedPorts = new Set(["80", "443"])): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new WebToolError("invalid_input", "URL is invalid");
  }
  if (!/^https?:$/.test(url.protocol) || url.username || url.password) {
    throw new WebToolError("unsafe_url", "Only credential-free HTTP and HTTPS URLs are allowed");
  }
  const port = url.port || (url.protocol === "https:" ? "443" : "80");
  if (!allowedPorts.has(port)) throw new WebToolError("unsafe_url", `Destination port ${port} is not allowed`);
  const hostname = domainToASCII(url.hostname.replace(/^\[|\]$/g, "")).toLowerCase();
  if (!hostname || hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local")) {
    throw new WebToolError("unsafe_url", "Local hostnames are not allowed");
  }
  const addresses = isIP(hostname) ? [hostname] : await resolver(hostname).catch((error) => {
    throw new WebToolError("upstream_unavailable", "Destination DNS lookup failed", true, 503, error);
  });
  if (addresses.length === 0 || addresses.some(isBlockedIp)) {
    throw new WebToolError("unsafe_url", "Private, reserved, or ambiguous destinations are not allowed");
  }
  return url;
}
