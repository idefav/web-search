# Agent configuration examples

These files show the entries managed by `camofox-web-search`. Replace `https://search.example.com` with the deployed HTTPS endpoint and export the token before starting the Agent:

```bash
export WEB_SEARCH_API_KEY="..."
```

The recommended installation path is still the idempotent CLI:

```bash
npm install -g camofox-web-search
camofox-web-search install codex --endpoint https://search.example.com --scope user
camofox-web-search install claude --endpoint https://search.example.com --scope project
camofox-web-search install opencode --endpoint https://search.example.com --scope user
camofox-web-search install pi --endpoint https://search.example.com --scope user
```

| Agent | Example | Destination |
| --- | --- | --- |
| Codex | `codex.toml` | `~/.codex/config.toml` or `.codex/config.toml` |
| Claude Code | `claude.json` | `~/.claude.json` or `.mcp.json` |
| OpenCode | `opencode.jsonc` | `~/.config/opencode/opencode.jsonc` or `opencode.jsonc` |
| Pi | `pi.json` | `~/.config/camofox-web-search/pi.json` or `.camofox-web-search/pi.json` |

Pi also requires the native extension:

```bash
pi install npm:camofox-web-search-pi
```

Never replace the environment-variable references with a real token in a tracked file.
