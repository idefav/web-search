"""Exercise the HermesAgent provider against the running Docker gateway."""

from __future__ import annotations

import asyncio

from camofox_web_search_hermes import CamofoxWebSearchProvider


provider = CamofoxWebSearchProvider()
assert provider.is_available()

documents = asyncio.run(provider.extract(["https://example.com/"], max_chars=2_000))
assert len(documents) == 1
assert documents[0]["content"]
assert documents[0]["metadata"]["sourceURL"] == "https://example.com/"

search = provider.search("Model Context Protocol official", limit=1)
if search["success"]:
    assert isinstance(search["data"]["web"], list)
else:
    assert search["error"]

print("HermesAgent native provider Docker smoke passed")

