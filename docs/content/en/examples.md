# Examples

Runnable examples live in the repository under `examples/`. Clone the same tag as your server deployment so examples and public contracts remain aligned.

## LangChain Deep Agents research Agent

The custom Python Agent demonstrates both supported integration styles:

- **MCP, recommended:** discover `web_search` and `web_fetch` through the gateway's standard `/mcp` endpoint.
- **REST custom tools:** define LangChain `@tool` functions that call `/v1/search` and `/v1/fetch` directly.

Both modes use the same research system prompt and treat every title, snippet, and fetched page as untrusted data.

```bash
cd examples/deepagents
cp .env.example .env
# Fill WEB_SEARCH_API_KEY, DEEPAGENTS_MODEL, and the model provider key.
uv sync --locked
uv run --env-file .env python agent.py --transport mcp "Compare MCP and REST for Agent tools"
uv run --env-file .env python agent.py --transport rest "Compare MCP and REST for Agent tools"
```

Add `--stream` to print main/subagent steps, bounded tool-call arguments, tool completion events, and answer tokens in real time. Reasoning blocks are not exposed:

```bash
uv run --env-file .env python agent.py --transport mcp --stream \
  "Research the latest Camofox Browser information and cite sources"
```

To use a custom OpenAI-compatible model endpoint, set `DEEPAGENTS_MODEL` to the provider-native model name and configure `DEEPAGENTS_MODEL_PROVIDER=openai`, `DEEPAGENTS_BASE_URL`, and `DEEPAGENTS_API_KEY`. Local HTTP model endpoints are allowed; remote custom endpoints must use HTTPS. The example model factory also exposes timeout and retry settings.

Read the [Deep Agents example README](https://github.com/idefav/web-search/tree/main/examples/deepagents) for configuration and error-handling details.

## Codex, Claude Code, OpenCode, and Pi

The CLI is the recommended installation path because it writes idempotently, preserves unrelated settings, stores backups, and never persists the token.

```bash
export WEB_SEARCH_API_KEY="..."
camofox-web-search install codex --endpoint https://search.example.com --scope user
camofox-web-search install claude --endpoint https://search.example.com --scope project
camofox-web-search install opencode --endpoint https://search.example.com --scope user
camofox-web-search install pi --endpoint https://search.example.com --scope user
```

The [manual configuration examples](https://github.com/idefav/web-search/tree/main/examples/agent-configs) show the exact managed entries for auditing or custom provisioning. Codex, Claude Code, and OpenCode use MCP. Pi installs the native npm extension and calls the REST gateway.

## Direct API calls

```bash
curl --fail https://search.example.com/v1/search \
  -H "Authorization: Bearer $WEB_SEARCH_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"query":"Model Context Protocol","count":5,"freshness":"month"}'

curl --fail https://search.example.com/v1/fetch \
  -H "Authorization: Bearer $WEB_SEARCH_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://example.com/","max_chars":20000}'
```

Use `/openapi.json` for the complete REST contract and `camofox-web-search-client` when a typed TypeScript client is preferred.
