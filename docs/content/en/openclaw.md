# OpenClaw installation and usage

Camofox Web Search integrates with OpenClaw through a native npm plugin. OpenClaw continues to expose its canonical `web_search` and `web_fetch` tools; only the backing providers change to your self-hosted gateway.

## Prerequisites

- A running Camofox Web Search deployment and its public `WEB_SEARCH_API_KEY`.
- OpenClaw 2026.7.1 or newer, with a working model provider.
- Node.js 22 or newer for the `camofox-web-search` installer.

Verify the gateway before changing OpenClaw:

```bash
curl --fail https://search.example.com/healthz
npm install -g camofox-web-search
```

## Managed installation

Export the key for the installer and diagnostics, then install the native provider:

```bash
export WEB_SEARCH_API_KEY="<copy securely from the server .env>"

camofox-web-search install openclaw \
  --endpoint https://search.example.com \
  --scope user
```

The installer:

- installs `camofox-web-search-openclaw`;
- configures `camofox` as OpenClaw's search and fetch provider;
- stores an environment SecretRef, not the token value;
- preserves unrelated OpenClaw settings and records the previous providers for uninstall.

If another provider already owns either capability, inspect the conflict first and rerun with `--force` only when replacing it is intentional.

## Make the key available to the Gateway

An OpenClaw Gateway running under systemd, launchd, or another supervisor does not inherit variables exported only in an interactive shell. Put the key in OpenClaw's runtime environment file:

```bash
mkdir -p ~/.openclaw
chmod 700 ~/.openclaw
touch ~/.openclaw/.env
chmod 600 ~/.openclaw/.env
```

Add this line to `~/.openclaw/.env` without committing the file:

```dotenv
WEB_SEARCH_API_KEY=<your-public-gateway-key>
```

Restart and verify the runtime registration:

```bash
openclaw config validate
openclaw gateway restart
openclaw gateway status
openclaw plugins inspect camofox --runtime --json

camofox-web-search doctor openclaw \
  --endpoint https://search.example.com \
  --scope user --live
```

`doctor` checks the local config, gateway health, MCP contract, native OpenClaw search/fetch provider registration, and—when `--live` is present—a real search.

## Use it

Start the OpenClaw TUI and ask for a search:

```bash
openclaw tui
```

Example prompt:

```text
Use web_search to find the latest Camofox Browser documentation, fetch the primary source, and cite it.
```

For a one-shot verification after configuring an OpenClaw model:

```bash
openclaw agent --agent main \
  --message "Use web_search to find the OpenAI official site and return its first URL."
```

## Proxy and local-model deployments

When OpenClaw uses `HTTP_PROXY` or `HTTPS_PROXY`, exclude the Web Search gateway and any local model endpoint from proxying. For a Lima VM that reaches an oMLX server on the host, for example:

```dotenv
NO_PROXY=127.0.0.1,localhost,host.lima.internal,*.local,192.168.*
no_proxy=127.0.0.1,localhost,host.lima.internal,*.local,192.168.*
```

Restart the Gateway after changing `.env`. A Gateway that is reachable while model calls fail with `fetch failed` usually indicates a missing local-model host in `NO_PROXY`.

## Manual installation and removal

The checked-in [OpenClaw example](https://github.com/idefav/web-search/tree/main/examples/openclaw) contains the equivalent manual plugin and JSON5 configuration.

Remove only the managed integration and restore the providers that were present before installation:

```bash
camofox-web-search uninstall openclaw \
  --endpoint https://search.example.com \
  --scope user
openclaw gateway restart
```

Removing the integration does not delete `WEB_SEARCH_API_KEY` from your secret environment file.
