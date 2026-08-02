# One Web Search for every coding Agent

Camofox Web Search is a self-hosted, read-only `web_search` and `web_fetch` service for Codex, Claude Code, OpenCode, Pi, and custom Agents. It exposes authenticated REST and stateless Streamable HTTP MCP on top of a pinned Camofox Browser deployment.

<div class="badges"><span>Multi-provider Search</span><span>MCP + REST</span><span>SSRF Guard</span><span>Bearer Auth</span></div>

> GitHub Pages hosts this documentation only. Run the service on a Linux host with Docker Compose.

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
