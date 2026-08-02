# Server deployment

The supported production path is Docker Compose on a Linux host. The stack starts the gateway, Camofox Browser, a deny-private-address Squid egress proxy, and optionally Caddy for automatic HTTPS.

## Prerequisites

- A 64-bit Linux host with Docker Engine, Docker Compose v2, Git, and OpenSSL.
- Outbound HTTPS access for pulling images, downloading GeoLite data, and browsing public pages.
- For public HTTPS: a DNS record pointing at the host and inbound TCP 80/443; UDP 443 is optional for HTTP/3.
- A public GHCR image or an authenticated `docker login ghcr.io` session for a private fork.

Do not expose gateway port 8080, Camofox port 9377, or Squid port 3128 to the public network. Remote Agent endpoints must use HTTPS.

## Generate a version-pinned command

The source tag and gateway image tag must match. The generated command defaults to the version used to build this documentation.

<div class="fields">
  <label>GitHub owner<input id="owner" value="idefav" autocomplete="off"></label>
  <label>Repository<input id="repo" value="web-search" autocomplete="off"></label>
  <label>Version<input id="version" value="{{version}}" autocomplete="off"></label>
  <label>Domain (optional)<input id="domain" placeholder="search.example.com" autocomplete="off"></label>
</div>
<div class="command-card"><div><span>Linux / Docker Compose</span><button data-copy="deploy-command">Copy</button></div><pre id="deploy-command"></pre></div>

Without a domain, the gateway listens only on `127.0.0.1:8080`. With a domain, bootstrap adds the Caddy overlay and provisions HTTPS automatically. The script creates `.env` with mode `0600`, generates independent 64-character public and internal keys, pulls every image, and waits for readiness.

## Configure search providers

The default provider order is stable-first and needs no additional credentials:

```dotenv
WEB_SEARCH_PROVIDERS=duckduckgo,brave,bing,google
WEB_SEARCH_PROVIDER_TIMEOUT_MS=15000
WEB_SEARCH_PROVIDER_COOLDOWN_MS=300000
```

The list controls both enabled providers and fallback order. It must contain unique built-in names and cannot be empty. Use `google` alone to retain single-engine behavior, or place it first for Google-first results. Google has a fixed one-at-a-time limit even when the gateway browser concurrency is higher.

On `search_blocked`, the provider immediately enters cooldown and the same request continues with the next provider. During cooldown, requests skip it without opening a browser tab. After expiry, one request performs a half-open probe. Explicit no-results responses do not trigger fallback. The gateway also falls back for provider timeouts, unavailability, and parser contract changes, but only blocking opens the cooldown circuit.

## Choose an exposure mode

### Loopback only

Omit `WEB_SEARCH_DOMAIN`. Use this for Agents running on the same host, an SSH tunnel, a private VPN, or an existing local reverse proxy. Check readiness on the server:

```bash
curl --fail http://127.0.0.1:8080/readyz
```

### Public HTTPS with Caddy

Create the DNS record before bootstrap, then set `WEB_SEARCH_DOMAIN`. Caddy binds ports 80 and 443, obtains and renews the certificate, and proxies only to the gateway. If the host has no working IPv6 route, do not publish an AAAA record.

```bash
curl --fail https://search.example.com/readyz
```

### Existing reverse proxy

Deploy in loopback mode and proxy HTTPS to `http://127.0.0.1:8080`. Keep the loopback binding, forward request bodies and the `Authorization` header, and allow MCP streaming responses. Do not proxy `/metrics` publicly.

## Verify authentication and MCP

`/healthz` confirms the gateway process is alive. `/readyz` additionally confirms that Camofox is connected and running. Both endpoints are intentionally unauthenticated; search, fetch, MCP, and metrics require the public key.

```bash
set -a
. ./.env
set +a

curl --fail http://127.0.0.1:8080/readyz
curl --fail http://127.0.0.1:8080/v1/search \
  -H "Authorization: Bearer $WEB_SEARCH_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"query":"Camofox Browser","count":3}'
```

Install the CLI on the Agent machine and run the non-live checks first. `--live` performs a real provider-chain search and reports the selected provider or a typed upstream error.

<div class="command-card"><div><span>Agent verification</span><button data-copy="agent-command">Copy</button></div><pre id="agent-command"></pre></div>

## Operate the stack

Use the base file for loopback deployments. Append `-f deploy/compose.public.yaml` to every command for a Caddy deployment.

```bash
docker compose --env-file .env -f deploy/compose.yaml ps
docker compose --env-file .env -f deploy/compose.yaml logs --tail=200 gateway camofox egress-guard
docker compose --env-file .env -f deploy/compose.yaml restart gateway
docker compose --env-file .env -f deploy/compose.yaml down
```

`down` preserves named volumes. Do not add `-v` unless deleting Caddy certificates and cached GeoLite data is intentional.

The authenticated `/metrics` endpoint is available through the loopback gateway. It includes provider attempt/outcome, fallback, latency, and circuit-state metrics. The bundled public Caddy configuration returns 404 for it by design.

## Upgrade and rollback

Keep the existing `.env`; it contains the public key already installed on Agent machines. Do **not** rerun `bootstrap.sh --force` during an upgrade because it replaces both keys.

1. Fetch and check out the target release tag.
2. Change only `WEB_SEARCH_IMAGE` in `.env` to the matching GHCR version.
3. Pull and recreate the stack with the same Compose file set used for deployment.
4. Confirm `/readyz`, then run `camofox-web-search doctor`.

```bash
git fetch --tags
git checkout v0.0.2
# Edit .env: WEB_SEARCH_IMAGE=ghcr.io/idefav/web-search:0.0.2
docker compose --env-file .env -f deploy/compose.yaml pull
docker compose --env-file .env -f deploy/compose.yaml up -d --no-build --wait --wait-timeout 180
```

Rollback uses the same procedure with the previous source tag and image tag. Back up `.env` through a secret manager or another encrypted channel; losing it requires rotating the public key on every Agent.

## Troubleshooting

| Symptom | Check or action |
| --- | --- |
| `/healthz` works but `/readyz` is 503 | Inspect `camofox` and `geolite-init` logs and verify outbound HTTPS. |
| Caddy cannot obtain a certificate | Verify A/AAAA records, ports 80/443, and that no other process owns those ports. |
| 401 `unauthorized` | Confirm the Agent process inherited the same `WEB_SEARCH_API_KEY` stored in the server `.env`. |
| 429 or `busy` | Reduce caller concurrency or adjust the gateway limits deliberately. |
| `search_blocked` | Every enabled provider is blocked or cooling down. Honor `Retry-After`, or configure a legitimate parent proxy behind Squid; never bypass the egress guard. |
| `unsafe_url` | The requested URL resolved to a private, reserved, local, or otherwise prohibited destination. This is expected protection. |
| `upstream_timeout` | Inspect browser/egress logs and retry only when the response marks the error retryable. |

The project does not solve CAPTCHA or bypass search-engine controls. Search availability still depends on the reputation and policy of the deployment's public egress IP.
