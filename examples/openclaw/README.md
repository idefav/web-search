# OpenClaw native provider

The native plugin preserves OpenClaw's canonical `web_search` and `web_fetch` tool names.

## Managed install

```bash
export WEB_SEARCH_API_KEY="..."
camofox-web-search install openclaw \
  --endpoint https://search.example.com \
  --scope user
openclaw gateway restart
camofox-web-search doctor openclaw \
  --endpoint https://search.example.com \
  --scope user --live
```

The installer writes an environment SecretRef, not the token. OpenClaw native plugins are user-scoped.

## Manual install

```bash
openclaw plugins install npm:camofox-web-search-openclaw --force
openclaw config set plugins.entries.camofox.config.endpoint https://search.example.com
openclaw config set plugins.entries.camofox.config.webSearch.apiKey \
  --ref-source env --ref-provider default --ref-id WEB_SEARCH_API_KEY
openclaw config set plugins.entries.camofox.config.webFetch.apiKey \
  --ref-source env --ref-provider default --ref-id WEB_SEARCH_API_KEY
openclaw config set tools.web.search.provider camofox
openclaw config set tools.web.fetch.provider camofox
openclaw config validate
openclaw gateway restart
openclaw plugins inspect camofox --runtime --json
```

The relevant source-shaped config is shown in [`openclaw.json5`](./openclaw.json5).

Try: `Search for the latest Camofox Browser documentation, fetch the primary source, and cite it.`
