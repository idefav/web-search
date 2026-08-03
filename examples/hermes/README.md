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

## Manual install

Run pip with the Python interpreter from the HermesAgent environment:

```bash
HERMES_PYTHON="$HOME/.hermes/hermes-agent/.venv/bin/python"
uv pip install --python "$HERMES_PYTHON" camofox-web-search-hermes
hermes plugins enable camofox-web-search --no-allow-tool-override
hermes config set WEB_SEARCH_ENDPOINT https://search.example.com --force
hermes config set web.search_backend camofox
hermes config set web.extract_backend camofox
```

The resulting non-secret Hermes configuration is shown in [`config.yaml`](./config.yaml). Hermes 0.19 emits an informational unknown-key notice for `WEB_SEARCH_ENDPOINT`; the plugin reads that custom key directly. Keep `WEB_SEARCH_API_KEY` in the process environment or Hermes `.env` secret environment.

Try: `Search for the latest Camofox Browser documentation, extract the primary sources, and cite them.`
