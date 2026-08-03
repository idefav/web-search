import asyncio

from camofox_web_search_hermes import provider as module


def test_search_maps_public_contract(monkeypatch):
    monkeypatch.setattr(
        module,
        "_request",
        lambda path, payload: {
            "results": [{"rank": 1, "title": "Example", "url": "https://example.com", "snippet": "Text"}]
        },
    )
    result = module.CamofoxWebSearchProvider().search("example", 20)
    assert result == {
        "success": True,
        "data": {"web": [{"title": "Example", "url": "https://example.com", "description": "Text", "position": 1}]},
    }


def test_extract_preserves_order_and_errors(monkeypatch):
    def request(path, payload):
        if payload["url"].endswith("bad"):
            raise RuntimeError("blocked")
        return {"content": payload["url"], "final_url": payload["url"], "truncated": False, "next_offset": None}

    monkeypatch.setattr(module, "_request", request)
    result = asyncio.run(module.CamofoxWebSearchProvider().extract(["https://a.example", "https://b.example/bad"]))
    assert [item["url"] for item in result] == ["https://a.example", "https://b.example/bad"]
    assert result[0]["content"] == "https://a.example"
    assert result[1]["error"] == "blocked"


def test_remote_http_is_rejected(monkeypatch):
    monkeypatch.setattr(module, "get_provider_env", lambda name: "http://search.example" if name == "WEB_SEARCH_ENDPOINT" else "x" * 32)
    assert module.CamofoxWebSearchProvider().is_available() is False


def test_endpoint_falls_back_to_hermes_config(monkeypatch):
    monkeypatch.setattr(module, "get_provider_env", lambda name: "x" * 32 if name == "WEB_SEARCH_API_KEY" else "")
    monkeypatch.setattr("hermes_cli.config.load_config", lambda: {"WEB_SEARCH_ENDPOINT": "https://search.example/"})
    assert module._endpoint() == "https://search.example"
