# One Web Search for every coding Agent

Camofox Web Search is a self-hosted, read-only `web_search` and `web_fetch` service for Codex, Claude Code, OpenCode, Pi, and custom Agents. It exposes authenticated REST and stateless Streamable HTTP MCP on top of a pinned Camofox Browser deployment.

<div class="badges"><span>Multi-provider Search</span><span>MCP + REST</span><span>SSRF Guard</span><span>Bearer Auth</span></div>

> GitHub Pages hosts this documentation only. Run the service on a Linux host with Docker Compose.

## Project highlights

<div class="release-grid">
<article><h3>One Agent endpoint</h3><p>Codex, Claude Code, OpenCode, Pi, LangChain, and custom MCP or REST clients share one authenticated service.</p></article>
<article><h3>Resilient search</h3><p>Four pluggable providers, ordered fallback, cooldown circuit breaking, and Google single-flight protection.</p></article>
<article><h3>Browser-backed fetch</h3><p>Camofox renders JavaScript pages and performs a bounded readiness retry for transient page placeholders.</p></article>
<article><h3>Read-only security</h3><p>Bearer auth, SSRF-filtered egress, untrusted-content boundaries, and no browser interaction or login tools.</p></article>
<article><h3>Complete delivery</h3><p>Docker Compose, multi-arch GHCR images, OpenAPI, TypeScript client, CLI installer, and Pi plugin.</p></article>
<article><h3>Production signals</h3><p>Typed errors, health checks, Prometheus metrics, structured logs, CI, and real Docker E2E.</p></article>
</div>

## Latest release: v{{version}}

Version 0.0.3 improves WeChat Official Account article fetching, returns retryable `fetch_blocked` errors for persistent verification pages, strips temporary `poc_token` values from final URLs, and adds readiness telemetry plus real WeChat Docker E2E coverage.

[Read the release notes](/en/releases/) or open the [GitHub Release](https://github.com/idefav/web-search/releases/tag/v0.0.3).

## Architecture

<img class="architecture-diagram" src="../assets/architecture.png" alt="Camofox Web Search architecture: Coding Agents connect through MCP or REST to the authenticated gateway, Camofox Browser, and the public web through the Squid SSRF guard.">

Agents can access only the gateway. Camofox stays on the internal network, and its browser traffic can reach the public web only through the SSRF-filtering Squid egress guard.

## Start here

1. Follow the [server deployment guide](/en/deployment/) to create a version-pinned deployment.
2. Install the Agent configuration CLI.
3. Export the public API key before starting your Agent.

```bash
npm install -g camofox-web-search
export WEB_SEARCH_API_KEY="<copy securely from the server .env>"
camofox-web-search install codex --endpoint https://search.example.com --scope user
camofox-web-search doctor codex --endpoint https://search.example.com --scope user
```

The installer also supports `claude`, `opencode`, and `pi`. It stores only the endpoint and an environment-variable reference, never the token.

## Interfaces

| Interface | Endpoint or package | Use case |
| --- | --- | --- |
| MCP | `/mcp` | Codex, Claude Code, OpenCode, and custom MCP clients |
| REST | `/v1/search`, `/v1/fetch` | Pi and application integrations |
| TypeScript | `camofox-web-search-client` | Typed Node.js applications |
| OpenAPI | `/openapi.json` | Contract discovery and client generation |

See the [examples](/en/examples/) for manual Agent configuration and a custom LangChain Deep Agents research Agent.

## Security boundary

Only two high-level read-only tools are exposed. Browser clicking, typing, script evaluation, cookie import, and authenticated browsing are intentionally unavailable. Camofox has no direct external network access: browser traffic passes through Squid, which rejects private, reserved, local, and metadata destinations.

Search results and fetched pages are untrusted input. Tool output includes warning boundaries, but every caller must retain its own prompt-injection policy.

Search defaults to `duckduckgo → brave → bing → google`. Blocked providers enter a cooldown and are skipped automatically, while Google is separately limited to one concurrent attempt. Provider order and cooldowns are configured on the server, so Agent configurations do not change.

Fetch performs one bounded readiness retry for empty or iframe-only pages. This lets transient WeChat verification interstitials finish while reporting persistent challenges as typed `fetch_blocked` errors instead of returning placeholder content.
