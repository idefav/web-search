import pytest

from settings import Settings


def test_environment_requires_https_for_remote_endpoint(monkeypatch):
    monkeypatch.setenv("WEB_SEARCH_ENDPOINT", "http://search.example.com")
    monkeypatch.setenv("WEB_SEARCH_API_KEY", "a" * 32)
    monkeypatch.setenv("DEEPAGENTS_MODEL", "openai:test")
    with pytest.raises(ValueError, match="must use HTTPS"):
        Settings.from_environment()


def test_environment_allows_local_http(monkeypatch):
    monkeypatch.setenv("WEB_SEARCH_ENDPOINT", "http://127.0.0.1:8080/")
    monkeypatch.setenv("WEB_SEARCH_API_KEY", "a" * 32)
    monkeypatch.setenv("DEEPAGENTS_MODEL", "openai:test")
    assert Settings.from_environment().mcp_url == "http://127.0.0.1:8080/mcp"


def test_environment_loads_custom_openai_compatible_provider(monkeypatch):
    monkeypatch.setenv("WEB_SEARCH_ENDPOINT", "http://127.0.0.1:8080")
    monkeypatch.setenv("WEB_SEARCH_API_KEY", "a" * 32)
    monkeypatch.setenv("DEEPAGENTS_MODEL", "custom-tool-model")
    monkeypatch.setenv("DEEPAGENTS_MODEL_PROVIDER", "openai")
    monkeypatch.setenv("DEEPAGENTS_BASE_URL", "http://localhost:8000/v1/")
    monkeypatch.setenv("DEEPAGENTS_API_KEY", "local")
    monkeypatch.setenv("DEEPAGENTS_TIMEOUT_SECONDS", "45.5")
    monkeypatch.setenv("DEEPAGENTS_MAX_RETRIES", "2")
    loaded = Settings.from_environment()
    assert loaded.model_base_url == "http://localhost:8000/v1"
    assert loaded.model_api_key == "local"
    assert loaded.model_timeout_seconds == 45.5
    assert loaded.model_max_retries == 2


def test_custom_remote_provider_requires_https(monkeypatch):
    monkeypatch.setenv("WEB_SEARCH_ENDPOINT", "http://127.0.0.1:8080")
    monkeypatch.setenv("WEB_SEARCH_API_KEY", "a" * 32)
    monkeypatch.setenv("DEEPAGENTS_MODEL", "custom-tool-model")
    monkeypatch.setenv("DEEPAGENTS_BASE_URL", "http://models.example.com/v1")
    monkeypatch.setenv("DEEPAGENTS_API_KEY", "secret")
    with pytest.raises(ValueError, match="remote DEEPAGENTS_BASE_URL values must use HTTPS"):
        Settings.from_environment()
