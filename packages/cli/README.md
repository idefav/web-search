# camofox-web-search

Configure Codex, Claude Code, OpenCode, Pi, OpenClaw, or HermesAgent to use a deployed Camofox Web Search gateway.

```bash
npm install -g camofox-web-search
export WEB_SEARCH_API_KEY="..."
camofox-web-search install codex --endpoint https://search.example.com --scope user
camofox-web-search doctor codex --endpoint https://search.example.com --scope user
camofox-web-search install openclaw --endpoint https://search.example.com --scope user
camofox-web-search install hermes --endpoint https://search.example.com --scope user
```

The installer stores an endpoint and an environment-variable reference, never the token itself. OpenClaw and HermesAgent integrations install native provider packages and support only user scope. Use `--hermes-python` when HermesAgent runs in a non-standard Python environment.
