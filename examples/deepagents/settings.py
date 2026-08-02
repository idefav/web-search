from __future__ import annotations

import os
from dataclasses import dataclass
from urllib.parse import urlsplit


@dataclass(frozen=True)
class Settings:
    endpoint: str
    api_key: str
    model: str
    model_provider: str | None = None
    model_base_url: str | None = None
    model_api_key: str | None = None
    model_timeout_seconds: float = 120.0
    model_max_retries: int = 6

    @classmethod
    def from_environment(cls) -> "Settings":
        endpoint = os.environ.get("WEB_SEARCH_ENDPOINT", "").strip().rstrip("/")
        api_key = os.environ.get("WEB_SEARCH_API_KEY", "").strip()
        model = os.environ.get("DEEPAGENTS_MODEL", "").strip()
        model_provider = os.environ.get("DEEPAGENTS_MODEL_PROVIDER", "").strip() or None
        model_base_url = os.environ.get("DEEPAGENTS_BASE_URL", "").strip().rstrip("/") or None
        model_api_key = os.environ.get("DEEPAGENTS_API_KEY", "").strip() or None
        if not endpoint:
            raise ValueError("WEB_SEARCH_ENDPOINT is required")
        parsed = urlsplit(endpoint)
        if parsed.scheme not in {"http", "https"} or not parsed.hostname:
            raise ValueError("WEB_SEARCH_ENDPOINT must be an absolute HTTP(S) URL")
        if parsed.scheme != "https" and parsed.hostname not in {"localhost", "127.0.0.1", "::1"}:
            raise ValueError("remote WEB_SEARCH_ENDPOINT values must use HTTPS")
        if len(api_key) < 32:
            raise ValueError("WEB_SEARCH_API_KEY must contain at least 32 characters")
        if not model:
            raise ValueError("DEEPAGENTS_MODEL is required")
        if model_base_url:
            model_endpoint = urlsplit(model_base_url)
            if model_endpoint.scheme not in {"http", "https"} or not model_endpoint.hostname:
                raise ValueError("DEEPAGENTS_BASE_URL must be an absolute HTTP(S) URL")
            if model_endpoint.scheme != "https" and model_endpoint.hostname not in {"localhost", "127.0.0.1", "::1"}:
                raise ValueError("remote DEEPAGENTS_BASE_URL values must use HTTPS")
            if model_provider not in {None, "openai"}:
                raise ValueError("DEEPAGENTS_BASE_URL currently supports OpenAI-compatible providers only")
            if not model_api_key and not os.environ.get("OPENAI_API_KEY", "").strip():
                raise ValueError("DEEPAGENTS_API_KEY is required for a custom OpenAI-compatible provider; use any non-empty value for an auth-free local server")
        timeout = _positive_float("DEEPAGENTS_TIMEOUT_SECONDS", 120.0)
        max_retries = _nonnegative_integer("DEEPAGENTS_MAX_RETRIES", 6)
        return cls(
            endpoint=endpoint,
            api_key=api_key,
            model=model,
            model_provider=model_provider,
            model_base_url=model_base_url,
            model_api_key=model_api_key,
            model_timeout_seconds=timeout,
            model_max_retries=max_retries,
        )

    @property
    def mcp_url(self) -> str:
        return f"{self.endpoint}/mcp"


def _positive_float(name: str, default: float) -> float:
    raw = os.environ.get(name, "").strip()
    if not raw:
        return default
    try:
        value = float(raw)
    except ValueError as error:
        raise ValueError(f"{name} must be a positive number") from error
    if value <= 0:
        raise ValueError(f"{name} must be a positive number")
    return value


def _nonnegative_integer(name: str, default: int) -> int:
    raw = os.environ.get(name, "").strip()
    if not raw:
        return default
    try:
        value = int(raw)
    except ValueError as error:
        raise ValueError(f"{name} must be a non-negative integer") from error
    if value < 0:
        raise ValueError(f"{name} must be a non-negative integer")
    return value
