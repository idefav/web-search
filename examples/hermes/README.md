# HermesAgent native provider

The PyPI plugin preserves HermesAgent's canonical `web_search` and `web_extract` tool names.

## Managed install

```bash
export WEB_SEARCH_API_KEY="..."
camofox-web-search install hermes \
  --endpoint https://search.example.com \
  --scope user
camofox-web-search doctor hermes \
  --endpoint https://search.example.com \
  --scope user --live
```

If Hermes uses a non-standard environment, add `--hermes-python /path/to/python`. The installer never writes the API key.

Persist `WEB_SEARCH_API_KEY` in `~/.hermes/.env` with mode `0600`. The complete [HermesAgent guide](https://idefav.github.io/web-search/en/hermes/) covers interpreter discovery, bundled `uv`, runtime verification, usage, and removal.

## Manual install

Run pip with the Python interpreter from the HermesAgent environment:

```bash
HERMES_PYTHON="$HOME/.hermes/hermes-agent/venv/bin/python"
~/.hermes/bin/uv pip install --python "$HERMES_PYTHON" camofox-web-search-hermes
hermes plugins enable camofox-web-search --no-allow-tool-override
hermes config set WEB_SEARCH_ENDPOINT https://search.example.com --force
hermes config set web.search_backend camofox
hermes config set web.extract_backend camofox
```

Some older installations use `~/.hermes/hermes-agent/.venv/bin/python`. The resulting non-secret Hermes configuration is shown in [`config.yaml`](./config.yaml). Keep `WEB_SEARCH_API_KEY` in the process environment or Hermes `.env` secret environment.

Start `hermes -t web chat --tui`, then try: `Search for the latest Camofox Browser documentation, extract the primary sources, and cite them.`
