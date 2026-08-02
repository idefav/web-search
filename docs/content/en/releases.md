# Release notes

Release tags pin the source, npm packages, and GHCR image to the same version. Production deployments should never mix versions.

## v0.0.3 — WeChat fetch readiness

- Waits once through transient WeChat Official Account verification interstitials and empty or iframe-only snapshots.
- Returns typed `fetch_blocked` with HTTP 503 and `Retry-After` when interactive verification persists; CAPTCHA is never solved or bypassed.
- Removes temporary `poc_token` values from returned final URLs while preserving final-URL SSRF validation.
- Adds `WEB_FETCH_READY_TIMEOUT_MS`, structured readiness logs, Prometheus metrics, bilingual deployment guidance, and real WeChat Docker E2E coverage.

[GitHub Release v0.0.3](https://github.com/idefav/web-search/releases/tag/v0.0.3) · [Compare v0.0.2...v0.0.3](https://github.com/idefav/web-search/compare/v0.0.2...v0.0.3)

## v0.0.2 — Multi-provider search and Agent examples

- Added pluggable DuckDuckGo, Brave, Bing, and Google providers with automatic fallback, cooldown circuit breaking, telemetry, and Google single-flight protection.
- Added bilingual deployment documentation plus runnable Codex, Claude Code, OpenCode, Pi, and LangChain Deep Agents examples.
- Added custom OpenAI-compatible Deep Agents model providers and streaming progress output.
- Expanded REST, MCP, client, CLI, Pi plugin, Docker E2E, and release verification for the multi-provider contract.

[GitHub Release v0.0.2](https://github.com/idefav/web-search/releases/tag/v0.0.2) · [Compare v0.0.1...v0.0.2](https://github.com/idefav/web-search/compare/v0.0.1...v0.0.2)

## v0.0.1 — Initial release

- Introduced the authenticated `web_search` and `web_fetch` REST and stateless Streamable HTTP MCP service.
- Published the TypeScript core/client, Agent configuration CLI, Pi plugin, and version-pinned Docker deployment.
- Established CI, GitHub Pages, npm Trusted Publishing, and multi-architecture GHCR release automation.

[GitHub Release v0.0.1](https://github.com/idefav/web-search/releases/tag/v0.0.1) · [All GitHub releases](https://github.com/idefav/web-search/releases)
