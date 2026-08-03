"""HermesAgent provider backed by a Camofox Web Search gateway."""

from .provider import CamofoxWebSearchProvider


def register(ctx) -> None:
    """Register the native web_search/web_extract provider with HermesAgent."""
    ctx.register_web_search_provider(CamofoxWebSearchProvider())


__all__ = ["CamofoxWebSearchProvider", "register"]

