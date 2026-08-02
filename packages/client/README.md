# camofox-web-search-client

Typed Node.js client for a deployed Camofox Web Search gateway.

```ts
import { WebSearchClient } from "camofox-web-search-client";

const client = new WebSearchClient({
  endpoint: "https://search.example.com",
  apiKey: process.env.WEB_SEARCH_API_KEY!
});

const result = await client.webSearch({ query: "MCP", count: 5 });
```
