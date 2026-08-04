# HermesAgent installation and usage

Camofox Web Search integrates with HermesAgent through a Python entry-point plugin. HermesAgent keeps its canonical `web_search` and `web_extract` tools while the `camofox` backend sends requests to your self-hosted gateway.

## Prerequisites

- A running Camofox Web Search deployment and its public `WEB_SEARCH_API_KEY`.
- HermesAgent installed and runnable as `hermes`.
- Python 3.11 through 3.13 in the HermesAgent environment.
- Node.js 22 or newer for the `camofox-web-search` installer.

```bash
curl --fail https://search.example.com/healthz
npm install -g camofox-web-search
```

## Managed installation

```bash
export WEB_SEARCH_API_KEY="<copy securely from the server .env>"

camofox-web-search install hermes \
  --endpoint https://search.example.com \
  --scope user
```

The installer:

- discovers Python from the current Hermes launcher or its `venv`/`.venv` directory;
- uses `uv`, including Hermes' bundled `~/.hermes/bin/uv`, when available;
- installs `camofox-web-search-hermes` into the Hermes environment;
- enables the plugin and selects `camofox` for both search and extraction;
- never writes the API key into `config.yaml`.

If Hermes lives in a custom environment, select its interpreter explicitly:

```bash
export HERMES_PYTHON=/path/to/hermes/python
camofox-web-search install hermes \
  --endpoint https://search.example.com \
  --scope user \
  --hermes-python "$HERMES_PYTHON"
```

## Persist the key

Hermes loads secrets from `~/.hermes/.env`. Create the file with restricted permissions, then add the key without committing it:

```bash
mkdir -p ~/.hermes
chmod 700 ~/.hermes
touch ~/.hermes/.env
chmod 600 ~/.hermes/.env
```

```dotenv
WEB_SEARCH_API_KEY=<your-public-gateway-key>
```

The endpoint and backend selection remain non-secret settings in `~/.hermes/config.yaml`.

## Verify the integration

```bash
hermes plugins list --plain --no-bundled

camofox-web-search doctor hermes \
  --endpoint https://search.example.com \
  --scope user --live
```

The `hermes-provider` doctor check runs Hermes' real plugin discovery and verifies that the `camofox` provider is registered for both search and extraction. `--live` adds a real gateway search.

If the current shell does not export the key, export it before running `doctor`; Hermes itself can read the persisted value from `~/.hermes/.env`.

## Use it

Explicitly enable the web toolset when starting the TUI:

```bash
hermes -t web chat --tui
```

Example prompt:

```text
Use web_search to find the latest Camofox Browser documentation, extract the primary sources, and cite them.
```

For a one-shot check with an already configured model:

```bash
hermes -t web -z \
  "Use web_search to find the OpenAI official site and return its first URL."
```

## Troubleshooting

### Could not locate the HermesAgent Python interpreter

Pass the interpreter used by Hermes:

```bash
export HERMES_PYTHON="$HOME/.hermes/hermes-agent/venv/bin/python"
camofox-web-search install hermes \
  --endpoint https://search.example.com \
  --scope user \
  --hermes-python "$HERMES_PYTHON"
```

Some older installations use `.venv/bin/python` instead of `venv/bin/python`.

### No module named pip

Hermes installations may intentionally omit `pip`. The current installer uses Hermes' bundled `uv` automatically. For a manual repair:

```bash
~/.hermes/bin/uv pip install \
  --python ~/.hermes/hermes-agent/venv/bin/python \
  --reinstall camofox-web-search-hermes
```

### Plugin is listed but the provider is missing

Reinstall the current package, enable it again, and rerun `doctor`. The diagnostic must report `PASS hermes-provider`; a package merely appearing in `hermes plugins list` is not sufficient runtime proof.

## Manual installation and removal

The checked-in [HermesAgent example](https://github.com/idefav/web-search/tree/main/examples/hermes) contains the equivalent manual PyPI and YAML configuration.

Remove the managed integration and restore the previous backends:

```bash
camofox-web-search uninstall hermes \
  --endpoint https://search.example.com \
  --scope user
```

Removing the integration does not delete `WEB_SEARCH_API_KEY` from `~/.hermes/.env`.
