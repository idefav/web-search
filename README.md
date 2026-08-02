# Camofox Web Search

A self-hosted, remote-first `web_search` and `web_fetch` service for Codex, Claude Code, OpenCode, and Pi. It wraps the pinned Camofox Browser REST API without maintaining a fork.

## Architecture

- `apps/server`: authenticated REST and stateless Streamable HTTP MCP gateway.
- `packages/core`: public contracts, Google query builder/parser, URL safety, browser orchestration.
- `packages/client`: typed REST client.
- `packages/cli`: idempotent Agent configuration installer.
- `plugins/pi`: native Pi tools.
- `deploy`: pinned Docker deployment with isolated Camofox networking and a deny-private-address egress proxy.

Only the two high-level, read-only tools are exposed. Browser clicking, typing, script evaluation, cookie import, and authenticated browsing are intentionally out of scope.

## Development

Requires Node.js 22 or newer.

```bash
npm install
npm run typecheck
npm test
npm run build
```

Start the gateway against an existing Camofox server:

```bash
export WEB_SEARCH_API_KEY="$(openssl rand -hex 32)"
export CAMOFOX_ACCESS_KEY="$(openssl rand -hex 32)"
export CAMOFOX_URL=http://127.0.0.1:9377
npm run dev
```

## Deployment

```bash
cp .env.example .env
# Populate both keys with different values of at least 32 characters.
docker compose --env-file .env -f deploy/compose.yaml up --build -d
curl http://127.0.0.1:8080/readyz
```

Terminate TLS in a reverse proxy and forward only to the loopback-bound gateway. The Camofox container has no direct external network: browser traffic must pass through Squid, which blocks private, reserved, local, and metadata destinations. If a residential proxy is required for Google reliability, configure it as Squid's parent proxy so these destination checks remain in force.

Google can still block datacenter or proxy traffic. Such responses are reported as retryable `search_blocked` errors; the service does not claim to bypass Google controls.

For a released GHCR image, clone the repository and let the bootstrap script generate independent secrets and start the pinned stack:

```bash
WEB_SEARCH_IMAGE=ghcr.io/OWNER/REPOSITORY:latest ./deploy/bootstrap.sh
```

Set `WEB_SEARCH_DOMAIN=search.example.com` in the same command to include the Caddy overlay and automatic HTTPS. GitHub Pages hosts only the static deployment guide; it cannot execute the Node.js/browser service.

## API

```bash
curl -sS http://127.0.0.1:8080/v1/search \
  -H "Authorization: Bearer $WEB_SEARCH_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"query":"Camofox browser","count":5,"freshness":"month"}'

curl -sS http://127.0.0.1:8080/v1/fetch \
  -H "Authorization: Bearer $WEB_SEARCH_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://example.com/","max_chars":20000}'
```

Search supports `query`, `count`, `freshness`, `include_domains`, `exclude_domains`, `language`, and `country`. Fetch supports `url`, `offset`, and `max_chars`. See `/openapi.json` and the exported TypeScript types for the complete contract.

All returned web text is untrusted input. Tool descriptions and output delimiters warn Agents not to execute instructions found in pages, but callers must retain their own prompt-injection policy.

## Agent installation

Install the released CLI, or build the workspace locally:

```bash
npm install -g camofox-web-search
```

Then run:

```bash
node packages/cli/dist/index.js install codex --endpoint https://search.example.com --scope user
node packages/cli/dist/index.js install claude --endpoint https://search.example.com --scope project
node packages/cli/dist/index.js install opencode --endpoint https://search.example.com --scope user
node packages/cli/dist/index.js install pi --endpoint https://search.example.com --scope user
```

The installer writes only the endpoint and an environment-variable reference. It never stores the token. Export `WEB_SEARCH_API_KEY` before starting the Agent.

Use `--dry-run` to inspect changes, `--force` to replace a conflicting managed entry, or `uninstall` to remove it. `doctor` checks configuration, token presence, HTTPS, and service health; `doctor --live` additionally performs a real Google search.

For Pi, the installer runs `pi install npm:camofox-web-search-pi`. Before the first npm release, use `--pi-package ./plugins/pi` from this repository; `CAMOFOX_WEB_SEARCH_PI_PACKAGE` provides the same override for automation.

## GitHub delivery

The repository includes four workflows:

- `CI`: typecheck, tests, npm audit, package dry-runs, shell validation, Compose validation, and gateway image build.
- `GitHub Pages`: publishes `docs/` after changes reach `main`.
- `Release`: after a GitHub Release is published, validates its tag, publishes a multi-architecture GHCR image with SBOM/provenance, and publishes the four npm packages in dependency order. Prereleases use the npm `next` tag and never replace the container `latest` tag.
- `Docker E2E`: runs the real pinned Camofox, Squid, and gateway stack weekly and on demand.

npm publication uses Trusted Publishing only; no long-lived npm token is accepted by the workflow. Configure these values in each package's npm **Settings → Trusted Publisher** section:

- Provider: GitHub Actions
- Organization or user: `idefav`
- Repository: `web-search`
- Workflow filename: `release.yml`
- Environment name: `npm`
- Allowed action: `npm publish`

Trusted Publishing can only be configured from an existing package's settings. For brand-new package names, perform a one-time bootstrap publication with an interactive maintainer login and 2FA, then configure the publisher above. Subsequent releases authenticate exclusively through short-lived OIDC credentials and generate provenance automatically.

Prepare and publish a release with:

```bash
npm run release:version -- 0.2.0
npm run release:verify
git add . && git commit -m "release: v0.2.0"
git tag -a v0.2.0 -m "v0.2.0"
git push origin main v0.2.0
gh release create v0.2.0 --target main --generate-notes --verify-tag
```

All workspace versions and internal dependency versions must match the Release tag. Publishing is idempotent: rerunning a partially failed Release skips npm package versions that already exist.

Enable GitHub Pages with **Source: GitHub Actions** after pushing the repository. The page generates deployment and Agent installation commands from the repository owner/name entered by the visitor.

## Docker E2E

With the full stack running:

```bash
export WEB_SEARCH_API_KEY="..."
export CAMOFOX_ACCESS_KEY="..."
export WEB_SEARCH_ENDPOINT=http://127.0.0.1:8080
npm run e2e:docker
```

The suite validates REST authentication, real page fetch, metadata-address rejection, live Google success or explicit blocking classification, MCP discovery/call, and Camofox tab cleanup. The scheduled workflow runs the same suite weekly.

## Upstream compatibility

The browser image is pinned to Camofox Browser 1.13.0 and its multi-platform digest. Google parsing depends on the v1.13.0 snapshot lines `link`, `/url`, `cite`, and `text`; fixture tests intentionally fail on incompatible changes. Upgrade the image only through a reviewed dependency change that passes contract and opt-in live tests.
