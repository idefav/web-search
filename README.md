# Camofox Web Search

[English](./README.md) · [简体中文](./README.zh-CN.md) · [Documentation](https://idefav.github.io/web-search/en/) · [Articles (中文)](https://idefav.github.io/web-search/zh-CN/articles/)

A self-hosted, remote-first Web Search service for Codex, Claude Code, OpenCode, Pi, OpenClaw, HermesAgent, and custom Agents. It wraps the pinned Camofox Browser REST API without maintaining a fork and exposes authenticated REST, stateless Streamable HTTP MCP, and native provider plugins.

## Why Camofox Web Search

- **One service for every Agent:** connect Codex, Claude Code, OpenCode, Pi, OpenClaw, HermesAgent, LangChain, or any MCP/REST client to the same endpoint.
- **Canonical native tools:** OpenClaw keeps `web_search`/`web_fetch`, HermesAgent keeps `web_search`/`web_extract`, and both use the same self-hosted gateway.
- **Browser-backed search and fetch:** render JavaScript pages through Camofox instead of relying on a search API key, while keeping the browser implementation pinned and replaceable.
- **Resilient multi-provider search:** DuckDuckGo, Brave, Bing, and Google are pluggable and ordered; blocked providers enter cooldown and automatically fall through to the next provider.
- **Safer by design:** only read-only tools are exposed, Bearer authentication is mandatory, outbound traffic is isolated behind an SSRF-filtering proxy, and web content is explicitly marked untrusted.
- **Deployment and integration included:** version-pinned Docker Compose, multi-architecture GHCR images, typed REST client, OpenAPI contract, Agent installer, native Pi/OpenClaw/HermesAgent plugins, and runnable examples ship together.
- **Observable and automation-friendly:** structured errors, health checks, Prometheus metrics, stateless MCP, deterministic package versions, and real Docker E2E are part of the supported path.

| Agent | Integration | Native tools |
| --- | --- | --- |
| Codex, Claude Code, OpenCode | Streamable HTTP MCP | `web_search`, `web_fetch` |
| Pi | Native npm extension | `web_search`, `web_fetch` |
| OpenClaw | Native npm provider | `web_search`, `web_fetch` |
| HermesAgent | Native Python provider | `web_search`, `web_extract` |
| LangChain Deep Agents and custom Agents | MCP, REST, or typed client | Application-defined |

## Install for your Agent

Deploy the [server](https://idefav.github.io/web-search/en/deployment/) first, then install the configuration CLI on the machine where your Agent runs:

```bash
npm install -g camofox-web-search
export WEB_SEARCH_API_KEY="<copy securely from the server .env>"
```

### Codex, Claude Code, and OpenCode

These Agents connect through Streamable HTTP MCP; no additional native plugin package is required:

```bash
camofox-web-search install codex --endpoint https://search.example.com --scope user
camofox-web-search install claude --endpoint https://search.example.com --scope user
camofox-web-search install opencode --endpoint https://search.example.com --scope user
```

Restart the selected Agent and ask it to call `web_search`. Use `doctor` with the same target to verify its configuration:

```bash
camofox-web-search doctor codex --endpoint https://search.example.com --scope user --live
```

### Pi

```bash
camofox-web-search install pi --endpoint https://search.example.com --scope user
camofox-web-search doctor pi --endpoint https://search.example.com --scope user --live
pi
```

The installer runs `pi install npm:camofox-web-search-pi` and configures the native REST-backed `web_search` and `web_fetch` tools.

### OpenClaw

```bash
camofox-web-search install openclaw --endpoint https://search.example.com --scope user
# Persist WEB_SEARCH_API_KEY in ~/.openclaw/.env when the Gateway runs as a service.
openclaw gateway restart
camofox-web-search doctor openclaw --endpoint https://search.example.com --scope user --live
openclaw tui
```

The installer runs `openclaw plugins install npm:camofox-web-search-openclaw`, selects the native providers, and stores environment SecretRefs instead of the token. See the [complete OpenClaw guide](https://idefav.github.io/web-search/en/openclaw/).

### HermesAgent

```bash
camofox-web-search install hermes --endpoint https://search.example.com --scope user
# Persist WEB_SEARCH_API_KEY in ~/.hermes/.env.
camofox-web-search doctor hermes --endpoint https://search.example.com --scope user --live
hermes -t web chat --tui
```

The installer adds `camofox-web-search-hermes` to Hermes' Python environment, enables it, and selects the native search/extract backend. See the [complete HermesAgent guide](https://idefav.github.io/web-search/en/hermes/).

### LangChain Deep Agents and custom Agents

Custom Agents can use `/mcp`, the REST API, or `camofox-web-search-client` directly. The runnable Deep Agents example needs no native plugin:

```bash
cd examples/deepagents
cp .env.example .env
uv sync --locked
uv run --env-file .env python agent.py --transport mcp --stream \
  "Research Camofox Browser and cite primary sources"
```

See [`examples/deepagents`](./examples/deepagents) and the [manual MCP configurations](./examples/agent-configs).

Codex, Claude Code, OpenCode, and Pi also support `--scope project`. OpenClaw and HermesAgent plugins are user-scoped. Add `--dry-run` to preview changes or `--force` to intentionally replace a conflicting managed entry.

## What's new in v0.0.5

- Fixed HermesAgent 0.20 plugin discovery by exporting a module entry point compatible with the current loader.
- Made the CLI detect the official Hermes shell launcher, both `venv` and `.venv` layouts, and Hermes' bundled `uv` without requiring `pip`.
- Upgraded `doctor hermes` to verify real runtime provider registration instead of only importing the package.
- Hardened `doctor openclaw` so a plugin load failure cannot pass based on declared provider IDs alone.
- Added complete OpenClaw and HermesAgent guides plus quick installation commands for every supported Agent on the README and GitHub Pages home page.

Read the complete [v0.0.5 release notes](https://github.com/idefav/web-search/releases/tag/v0.0.5) or browse [all releases](https://github.com/idefav/web-search/releases).

## Architecture

![Camofox Web Search architecture: Coding Agents connect through MCP or REST to the authenticated gateway, Camofox Browser, and the public web through the Squid SSRF guard.](./docs/assets/architecture.png)

- `apps/server`: authenticated REST and stateless MCP gateway.
- `packages/core`: contracts, pluggable search providers, URL safety, and browser orchestration.
- `packages/client`: typed REST client.
- `packages/cli`: idempotent Agent configuration installer.
- `plugins/pi`: native Pi tools.
- `plugins/openclaw`: native OpenClaw search/fetch providers, published to npm.
- `plugins/hermes`: native HermesAgent search/extract provider, published to PyPI.
- `deploy`: pinned Docker deployment with isolated browser networking.
- `examples`: manual Agent configurations and a custom LangChain Deep Agents research Agent.

Only the two high-level, read-only tools are exposed. Browser clicking, typing, script evaluation, cookie import, and authenticated browsing are intentionally out of scope.

## Server deployment

The supported production path is Docker Compose on a 64-bit Linux host with Docker Engine, Compose v2, Git, and OpenSSL. Use the same version for the source tag and GHCR image:

```bash
VERSION="0.0.5"
git clone --branch "v${VERSION}" --depth 1 https://github.com/idefav/web-search.git
cd web-search
WEB_SEARCH_IMAGE="ghcr.io/idefav/web-search:${VERSION}" ./deploy/bootstrap.sh
```

The default gateway listens only on `127.0.0.1:8080`. To expose it with automatic HTTPS, point a domain at the host, allow ports 80/443, and set the domain during bootstrap:

```bash
WEB_SEARCH_DOMAIN="search.example.com" \
WEB_SEARCH_IMAGE="ghcr.io/idefav/web-search:${VERSION}" \
./deploy/bootstrap.sh
```

Bootstrap creates `.env` with mode `0600`, generates different public and internal keys, pulls the pinned stack, and waits for Camofox readiness. Do not rerun it with `--force` during upgrades because that rotates both keys.

Read the complete [server deployment guide](https://idefav.github.io/web-search/en/deployment/) for existing reverse proxies, verification, logs, metrics, upgrades, rollback, network security, and troubleshooting. GitHub Pages hosts documentation only; it cannot execute the browser service.

Search uses the stable-first provider chain `duckduckgo,brave,bing,google` by default. A blocked provider is cooled down for five minutes and the request automatically falls back to the next provider. Override the order with `WEB_SEARCH_PROVIDERS`; Google is always limited to one concurrent attempt. The project does not bypass CAPTCHA or search-engine controls.

`web_fetch` performs one bounded readiness wait when a page initially exposes only an empty or iframe placeholder. This covers WeChat Official Account links that briefly pass through an automatic verification interstitial. A verification page that does not clear is returned as retryable `fetch_blocked`; the service never attempts to solve CAPTCHA.

## Installer behavior

The installer stores only the endpoint and an environment-variable reference, never the token. It preserves unrelated settings, creates backups for edited Agent configuration files, and supports idempotent reruns. Manual configurations for Codex, Claude Code, OpenCode, and Pi are available in [`examples/agent-configs`](./examples/agent-configs).

## OpenClaw installation and usage

OpenClaw 2026.7.1+ can use the native provider without changing its standard tool names:

```bash
export WEB_SEARCH_API_KEY="<copy securely from the server .env>"
camofox-web-search install openclaw \
  --endpoint https://search.example.com \
  --scope user

# Also persist WEB_SEARCH_API_KEY in ~/.openclaw/.env for a managed Gateway.
openclaw gateway restart
camofox-web-search doctor openclaw \
  --endpoint https://search.example.com \
  --scope user --live
openclaw tui
```

The installer uses OpenClaw environment SecretRefs and does not write the token into `openclaw.json`. A Gateway managed by systemd or launchd must be able to read the key from `~/.openclaw/.env` or its service environment; an interactive-shell `export` alone is not persistent.

Read the complete [OpenClaw installation, usage, proxy, verification, and uninstall guide](https://idefav.github.io/web-search/en/openclaw/). A detailed [Chinese visual tutorial](https://idefav.github.io/web-search/zh-CN/articles/openclaw-camofox-web-search-guide/) walks through deployment, native-provider setup, live research, and five-layer verification. The [OpenClaw example](./examples/openclaw) also includes equivalent manual configuration.

## HermesAgent installation and usage

The managed installer discovers the Hermes launcher, both current `venv` and legacy `.venv` layouts, and Hermes' bundled `uv`:

```bash
export WEB_SEARCH_API_KEY="<copy securely from the server .env>"
camofox-web-search install hermes \
  --endpoint https://search.example.com \
  --scope user

# Also persist WEB_SEARCH_API_KEY in ~/.hermes/.env.
camofox-web-search doctor hermes \
  --endpoint https://search.example.com \
  --scope user --live
hermes -t web chat --tui
```

The doctor performs Hermes' actual plugin discovery, so `PASS hermes-provider` proves that `camofox` was registered—not merely that the package appears in the plugin list. Set `HERMES_PYTHON` or pass `--hermes-python` for a custom installation.

Read the complete [HermesAgent installation, usage, Python/uv troubleshooting, verification, and uninstall guide](https://idefav.github.io/web-search/en/hermes/). A detailed [Chinese visual tutorial](https://idefav.github.io/web-search/zh-CN/articles/hermesagent-camofox-web-search-guide/) covers Python-provider discovery, live search/extraction, and five-layer verification. The [HermesAgent example](./examples/hermes) includes the manual PyPI path.

## API

```bash
curl --fail https://search.example.com/v1/search \
  -H "Authorization: Bearer $WEB_SEARCH_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"query":"Camofox browser","count":5,"freshness":"month"}'

curl --fail https://search.example.com/v1/fetch \
  -H "Authorization: Bearer $WEB_SEARCH_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://example.com/","max_chars":20000}'
```

Search supports `query`, `count`, `freshness`, `include_domains`, `exclude_domains`, `language`, and `country`. Fetch supports `url`, `offset`, and `max_chars`. See `/openapi.json` and the exported TypeScript types for the complete contract.

All returned web text is untrusted input. Tool descriptions and output delimiters warn Agents not to execute instructions found in pages, but callers must retain their own prompt-injection policy.

## Examples

### LangChain Deep Agents demo

[![Watch the LangChain Deep Agents integration demo](./docs/assets/deepagents-demo.svg)](https://idefav.github.io/web-search/en/examples/#langchain-deep-agents-demo)

The recording shows the custom LangChain Deep Agents example discovering and calling this project's `web_search` and `web_fetch` MCP tools with streaming step output. [Open the interactive player](https://idefav.github.io/web-search/en/examples/#langchain-deep-agents-demo) or [download `demo.cast`](./examples/deepagents/demo.cast) for local playback with `asciinema play`.

- [`examples/deepagents`](./examples/deepagents): runnable Python 3.11+ custom research Agent using MCP or REST tools, with standard LangChain models or a custom OpenAI-compatible provider.
- [`examples/agent-configs`](./examples/agent-configs): exact Codex, Claude Code, OpenCode, and Pi manual configuration examples.
- [`examples/openclaw`](./examples/openclaw): managed and manual OpenClaw native-provider integration.
- [`examples/hermes`](./examples/hermes): managed and manual HermesAgent native-provider integration.

The [examples guide](https://idefav.github.io/web-search/en/examples/) also includes direct REST calls. The CLI remains the recommended Agent installation path.

Use `--stream` with the Deep Agents example to print Agent steps, tool activity, and answer tokens in real time.

## Development and verification

Requires Node.js 22 or newer.

```bash
npm install
npm run typecheck
npm test
npm run build
npm run docs:build
npm run docs:check
```

Start the gateway against an existing Camofox server:

```bash
export WEB_SEARCH_API_KEY="$(openssl rand -hex 32)"
export CAMOFOX_ACCESS_KEY="$(openssl rand -hex 32)"
export CAMOFOX_URL=http://127.0.0.1:9377
npm run dev
```

With the full Docker stack running, `npm run e2e:docker` validates REST authentication, real page fetch, metadata-address rejection, live multi-provider search or explicit typed failure, MCP discovery/call, and Camofox tab cleanup.

## Release delivery

- `CI`: TypeScript, unit tests, docs, Deep Agents, OpenClaw/HermesAgent host compatibility, package dry-runs, Compose validation, and gateway image build.
- `GitHub Pages`: builds and publishes the bilingual site after relevant changes reach `main`.
- `Release`: publishes the multi-architecture GHCR image, five npm packages, and the HermesAgent PyPI package through Trusted Publishing and OIDC.
- `Docker E2E`: runs the real pinned browser stack plus OpenClaw and HermesAgent native providers weekly and on demand.

See the [deployment guide](https://idefav.github.io/web-search/en/deployment/) for upgrades and rollback, and the existing release workflow for npm/GHCR publication.

## Upstream compatibility

The browser image is pinned to Camofox Browser 1.13.0 and its multi-platform digest. Provider parsers depend on the v1.13.0 accessibility snapshot contract; fixture tests intentionally fail on incompatible changes. Upgrade the image only through a reviewed dependency change that passes contract and opt-in live tests.
