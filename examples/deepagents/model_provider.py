from __future__ import annotations

from langchain.chat_models import init_chat_model
from langchain_core.language_models.chat_models import BaseChatModel

from settings import Settings


def _split_model(settings: Settings) -> tuple[str, str]:
    """Return provider and provider-native model name for explicit initialization."""
    if ":" in settings.model:
        prefix, model_name = settings.model.split(":", 1)
        if settings.model_provider and settings.model_provider != prefix:
            raise ValueError(
                "DEEPAGENTS_MODEL_PROVIDER conflicts with the provider prefix in DEEPAGENTS_MODEL"
            )
        return prefix, model_name
    return settings.model_provider or "openai", settings.model


def create_model(settings: Settings) -> str | BaseChatModel:
    """Create a Deep Agents model string or an initialized custom model.

    Standard `provider:model` values are returned unchanged so Deep Agents can
    apply its provider profiles. Explicit provider, API key, or base URL values
    opt into an initialized LangChain model. Custom base URLs are restricted to
    OpenAI-compatible integrations because other providers use different
    endpoint parameters.
    """
    if not any((settings.model_provider, settings.model_base_url, settings.model_api_key)):
        return settings.model

    provider, model_name = _split_model(settings)
    if settings.model_base_url and provider != "openai":
        raise ValueError("custom base URLs currently require the openai model provider")

    options: dict[str, object] = {
        "model": model_name,
        "model_provider": provider,
        "timeout": settings.model_timeout_seconds,
        "max_retries": settings.model_max_retries,
    }
    if settings.model_base_url:
        options["base_url"] = settings.model_base_url
    if settings.model_api_key:
        options["api_key"] = settings.model_api_key
    return init_chat_model(
        **options,
    )
