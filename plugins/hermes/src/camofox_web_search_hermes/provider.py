"""Camofox native web provider for HermesAgent."""

from __future__ import annotations

import asyncio
import json
from typing import Any, Dict, List
from urllib.error import HTTPError, URLError
from urllib.parse import urlparse
from urllib.request import Request, urlopen

from agent.web_search_provider import WebSearchProvider, get_provider_env


def _endpoint() -> str:
    value = get_provider_env("WEB_SEARCH_ENDPOINT")
    if not value:
        try:
            from hermes_cli.config import load_config

            configured = load_config().get("WEB_SEARCH_ENDPOINT", "")
            value = configured if isinstance(configured, str) else ""
        except Exception:  # noqa: BLE001 - stripped/minimal Hermes installs
            value = ""
    value = value.rstrip("/")
    if not value:
        raise ValueError("WEB_SEARCH_ENDPOINT is not configured")
    parsed = urlparse(value)
    local = parsed.hostname in {"localhost", "127.0.0.1", "::1"}
    if parsed.scheme != "https" and not (parsed.scheme == "http" and local):
        raise ValueError("Camofox remote endpoints must use HTTPS")
    return value


def _api_key() -> str:
    value = get_provider_env("WEB_SEARCH_API_KEY")
    if not value:
        raise ValueError("WEB_SEARCH_API_KEY is not configured")
    return value


def _message(body: object, fallback: str) -> str:
    if isinstance(body, dict):
        error = body.get("error")
        if isinstance(error, dict) and isinstance(error.get("message"), str):
            return error["message"]
    return fallback


def _request(path: str, payload: Dict[str, Any]) -> Dict[str, Any]:
    request = Request(
        f"{_endpoint()}{path}",
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Accept": "application/json",
            "Authorization": f"Bearer {_api_key()}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with urlopen(request, timeout=60) as response:  # noqa: S310 - endpoint is validated above
            value = json.loads(response.read().decode("utf-8"))
            if not isinstance(value, dict):
                raise ValueError("Camofox returned a non-object response")
            return value
    except HTTPError as exc:
        try:
            body = json.loads(exc.read().decode("utf-8"))
        except (ValueError, UnicodeDecodeError):
            body = None
        raise RuntimeError(_message(body, f"Camofox returned HTTP {exc.code}")) from None
    except URLError as exc:
        raise RuntimeError(f"Camofox request failed: {exc.reason}") from None


class CamofoxWebSearchProvider(WebSearchProvider):
    """Expose Camofox through HermesAgent's canonical web tools."""

    @property
    def name(self) -> str:
        return "camofox"

    @property
    def display_name(self) -> str:
        return "Camofox Web Search"

    def is_available(self) -> bool:
        try:
            _endpoint()
            return bool(get_provider_env("WEB_SEARCH_API_KEY"))
        except ValueError:
            return False

    def supports_search(self) -> bool:
        return True

    def supports_extract(self) -> bool:
        return True

    def search(self, query: str, limit: int = 5) -> Dict[str, Any]:
        try:
            response = _request("/v1/search", {"query": query, "count": max(1, min(10, limit))})
            results = response.get("results", [])
            return {
                "success": True,
                "data": {
                    "web": [
                        {
                            "title": str(item.get("title", "")),
                            "url": str(item.get("url", "")),
                            "description": str(item.get("snippet", "")),
                            "position": int(item.get("rank", index + 1)),
                        }
                        for index, item in enumerate(results)
                        if isinstance(item, dict)
                    ]
                },
            }
        except Exception as exc:  # noqa: BLE001 - Hermes requires a failure envelope
            return {"success": False, "error": str(exc)}

    async def extract(self, urls: List[str], **kwargs: Any) -> List[Dict[str, Any]]:
        max_chars = kwargs.get("max_chars", 40_000)
        if not isinstance(max_chars, int):
            max_chars = 40_000
        max_chars = max(1, min(40_000, max_chars))
        semaphore = asyncio.Semaphore(3)

        async def fetch_one(url: str) -> Dict[str, Any]:
            async with semaphore:
                try:
                    response = await asyncio.to_thread(
                        _request,
                        "/v1/fetch",
                        {"url": url, "offset": 0, "max_chars": max_chars},
                    )
                    content = str(response.get("content", ""))
                    final_url = str(response.get("final_url", url))
                    return {
                        "url": final_url,
                        "title": "",
                        "content": content,
                        "raw_content": content,
                        "metadata": {
                            "sourceURL": final_url,
                            "requestedURL": url,
                            "requestId": response.get("request_id"),
                            "fetchedAt": response.get("fetched_at"),
                            "truncated": bool(response.get("truncated", False)),
                            "nextOffset": response.get("next_offset"),
                        },
                    }
                except Exception as exc:  # noqa: BLE001 - preserve per-URL failures
                    return {
                        "url": url,
                        "title": "",
                        "content": "",
                        "raw_content": "",
                        "error": str(exc),
                        "metadata": {"sourceURL": url},
                    }

        return await asyncio.gather(*(fetch_one(url) for url in urls))

    def get_setup_schema(self) -> Dict[str, Any]:
        return {
            "name": self.display_name,
            "badge": "self-hosted",
            "tag": "Browser-backed search and extraction through one Camofox endpoint.",
            "env_vars": [
                {
                    "key": "WEB_SEARCH_ENDPOINT",
                    "prompt": "Camofox gateway endpoint",
                    "url": "https://idefav.github.io/web-search/en/deployment/",
                },
                {
                    "key": "WEB_SEARCH_API_KEY",
                    "prompt": "Camofox gateway API key",
                    "url": "https://idefav.github.io/web-search/en/deployment/",
                },
            ],
        }
