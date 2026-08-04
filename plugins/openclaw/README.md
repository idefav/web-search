# Camofox Web Search for OpenClaw

Native OpenClaw providers for the canonical `web_search` and `web_fetch` tools.

```bash
export WEB_SEARCH_API_KEY="..."
openclaw plugins install npm:camofox-web-search-openclaw
openclaw config set plugins.entries.camofox.config.endpoint https://search.example.com
openclaw config set tools.web.search.provider camofox
openclaw config set tools.web.fetch.provider camofox
openclaw gateway restart
```

Use `camofox-web-search install openclaw --endpoint ...` for a managed installation that stores only an environment SecretRef, never the token value. Persist the key in `~/.openclaw/.env` when the Gateway runs as a service.

See the full [OpenClaw installation and usage guide](https://idefav.github.io/web-search/en/openclaw/).
