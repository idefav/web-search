from io import StringIO
from types import SimpleNamespace

import agent as agent_module
from agent import SYSTEM_PROMPT, StreamRenderer, final_text, tools_for
from model_provider import create_model
from settings import Settings


def settings() -> Settings:
    return Settings(endpoint="https://search.example.com", api_key="a" * 32, model="openai:test")


async def test_agent_module_loads_mcp_adapter_and_builds_rest_tools():
    tools = await tools_for("rest", settings())
    assert [tool.name for tool in tools] == ["web_search", "web_fetch"]
    assert "untrusted data" in SYSTEM_PROMPT


def test_final_text_reads_last_message():
    assert final_text({"messages": [SimpleNamespace(content="answer with sources")]}) == "answer with sources"


def test_standard_provider_model_remains_a_deep_agents_model_string():
    assert create_model(settings()) == "openai:test"


def test_custom_openai_compatible_provider_builds_chat_model():
    custom = Settings(
        endpoint="https://search.example.com",
        api_key="a" * 32,
        model="custom-tool-model",
        model_provider="openai",
        model_base_url="http://127.0.0.1:8000/v1",
        model_api_key="local",
        model_timeout_seconds=45,
        model_max_retries=2,
    )
    model = create_model(custom)
    assert model.__class__.__name__ == "ChatOpenAI"
    assert model.model_name == "custom-tool-model"
    assert model.openai_api_base == "http://127.0.0.1:8000/v1"
    assert model.request_timeout == 45
    assert model.max_retries == 2


def test_stream_renderer_prints_steps_tools_and_text_tokens():
    output = StringIO()
    renderer = StreamRenderer(output)
    renderer.render({
        "type": "updates",
        "ns": (),
        "data": {
            "model_request": {
                "messages": [SimpleNamespace(tool_calls=[{"name": "web_search", "args": {"query": "Camofox"}}])]
            }
        },
    })
    renderer.render({
        "type": "messages",
        "ns": (),
        "data": (SimpleNamespace(content="Searching now. "), {}),
    })
    renderer.render({
        "type": "messages",
        "ns": (),
        "data": (SimpleNamespace(content=[
            {"type": "reasoning", "reasoning": "private reasoning"},
            {"type": "text", "text": "Found sources."},
        ]), {}),
    })
    renderer.finish()
    rendered = output.getvalue()
    assert "[main] step: model_request" in rendered
    assert '[main] tool: web_search {"query":"Camofox"}' in rendered
    assert "[main] Searching now. Found sources." in rendered
    assert "private reasoning" not in rendered


def test_stream_renderer_labels_subagents_and_tool_results():
    output = StringIO()
    renderer = StreamRenderer(output)
    renderer.render({
        "type": "updates",
        "ns": ("tools:abc", "researcher"),
        "data": {"tools": {"messages": [SimpleNamespace(type="tool", name="web_fetch")]},},
    })
    assert "[subagent:tools:abc/researcher] step: tools" in output.getvalue()
    assert "tool result: web_fetch" in output.getvalue()


async def test_stream_run_requests_v2_steps_tokens_and_subgraphs(monkeypatch):
    class FakeAgent:
        async def astream(self, inputs, **options):
            assert inputs["messages"][0]["content"] == "research question"
            assert options == {
                "stream_mode": ["updates", "messages"],
                "subgraphs": True,
                "version": "v2",
            }
            yield {"type": "updates", "ns": (), "data": {"model_request": {}}}
            yield {"type": "messages", "ns": (), "data": (SimpleNamespace(content="answer"), {})}

    async def fake_create_agent(_transport, _settings):
        return FakeAgent()

    monkeypatch.setattr(agent_module, "create_agent", fake_create_agent)
    output = StringIO()
    await agent_module.stream_run("research question", "mcp", settings(), output)
    assert output.getvalue() == "[main] step: model_request\n[main] answer\n"
