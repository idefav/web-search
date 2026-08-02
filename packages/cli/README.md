# camofox-web-search

Configure Codex, Claude Code, OpenCode, or Pi to use a deployed Camofox Web Search gateway.

```bash
npm install -g camofox-web-search
export WEB_SEARCH_API_KEY="..."
camofox-web-search install codex --endpoint https://search.example.com --scope user
camofox-web-search doctor codex --endpoint https://search.example.com --scope user
```

The installer stores an endpoint and an environment-variable reference, never the token itself.
