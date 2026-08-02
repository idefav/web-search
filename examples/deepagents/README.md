# LangChain Deep Agents example

This example builds a custom research Agent with [`create_deep_agent`](https://github.com/langchain-ai/deepagents). It can obtain the same `web_search` and `web_fetch` tools in two ways:

- `mcp` (recommended): standard Streamable HTTP MCP through `langchain-mcp-adapters`.
- `rest`: custom LangChain `StructuredTool` wrappers around the REST API.

Both modes use the same system prompt, require source URLs in the final answer, and treat all returned web text as untrusted data.

## Requirements

- Python 3.11 or newer.
- [`uv`](https://docs.astral.sh/uv/).
- A running Camofox Web Search gateway and its public API key.
- A model provider key. The example includes `langchain-openai`; install the matching LangChain provider package if `DEEPAGENTS_MODEL` uses another provider.

## Configure

```bash
cp .env.example .env
```

Set these values in `.env`:

- `WEB_SEARCH_ENDPOINT`: gateway base URL, without `/mcp`.
- `WEB_SEARCH_API_KEY`: public gateway key, at least 32 characters.
- `DEEPAGENTS_MODEL`: a LangChain model identifier such as `openai:gpt-5.5`.
- The provider credential required by that model, such as `OPENAI_API_KEY`.

Remote gateway URLs must use HTTPS. Localhost URLs may use HTTP. The example never logs either API key.

### Custom OpenAI-compatible provider

The example can initialize a custom provider explicitly instead of passing a model string directly to Deep Agents. This works with OpenAI-compatible services such as vLLM, LocalAI, Together, or an internal gateway:

```dotenv
DEEPAGENTS_MODEL=your-model-name
DEEPAGENTS_MODEL_PROVIDER=openai
DEEPAGENTS_BASE_URL=http://127.0.0.1:8000/v1
DEEPAGENTS_API_KEY=local
DEEPAGENTS_TIMEOUT_SECONDS=120
DEEPAGENTS_MAX_RETRIES=6
```

`DEEPAGENTS_API_KEY` must be non-empty because the OpenAI LangChain integration requires a credential value; `local` is sufficient when the local server does not authenticate. Remote custom endpoints must use HTTPS.

The custom model is created in [`model_provider.py`](./model_provider.py) with `init_chat_model`, then passed to `create_deep_agent` as a `BaseChatModel`. Edit that factory when a provider needs parameters other than the OpenAI-compatible `base_url`, API key, timeout, and retry settings.

## Run

```bash
uv sync --locked

uv run --env-file .env python agent.py --transport mcp \
  "Research the current Model Context Protocol transport options and cite sources"

uv run --env-file .env python agent.py --transport rest \
  "Research the current Model Context Protocol transport options and cite sources"
```

Add `--stream` to print progress as it happens:

```bash
uv run --env-file .env python agent.py --transport mcp --stream \
  "Research the latest Camofox Browser information and cite sources"
```

Streaming uses the Deep Agents/LangGraph v2 event format with `updates` and `messages` modes. It prints main-agent and subagent step names, tool calls with bounded arguments, tool completion events, and answer text tokens. Provider reasoning blocks are deliberately not printed.

MCP mode passes tools returned by `MultiServerMCPClient.get_tools()` directly to Deep Agents. REST mode supplies custom typed tools implementing every public search and fetch input field.

## Test without a live service or model

```bash
uv run pytest
```

Tests use an in-memory HTTP transport. They validate authentication, request shape, typed service errors, endpoint safety, and untrusted-content delimiters without making network or LLM calls.
