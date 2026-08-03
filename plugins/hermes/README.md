# Camofox Web Search for HermesAgent

Native HermesAgent provider for the canonical `web_search` and `web_extract` tools.

```bash
python -m pip install camofox-web-search-hermes
hermes plugins enable camofox-web-search --no-allow-tool-override
hermes config set WEB_SEARCH_ENDPOINT https://search.example.com --force
hermes config set web.search_backend camofox
hermes config set web.extract_backend camofox
export WEB_SEARCH_API_KEY="..."
```

The package intentionally does not depend on `hermes-agent`, so installing it cannot replace the user's HermesAgent version.
