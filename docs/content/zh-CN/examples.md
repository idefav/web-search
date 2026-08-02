# 示例

可运行示例位于仓库的 `examples/` 目录。建议检出与服务端部署相同的 Git tag，确保示例与公开接口版本一致。

## LangChain Deep Agents 研究 Agent

这个 Python 自定义 Agent 展示两种接入方式：

- **MCP，推荐方式：**通过 gateway 的标准 `/mcp` endpoint 发现 `web_search` 与 `web_fetch`。
- **REST 自定义工具：**使用 LangChain `@tool` 定义函数，直接调用 `/v1/search` 和 `/v1/fetch`。

两种模式使用相同的研究提示词，并将标题、摘要和抓取页面全部视为不可信数据。

### LangChain Deep Agents 演示

<div class="asciinema-demo" data-asciinema-src="../../assets/deepagents-demo.cast" aria-label="LangChain Deep Agents 使用 Camofox Web Search 的交互式终端录屏"></div>

录屏展示 MCP 工具发现、主 Agent 与子 Agent 的流式步骤、`web_search`、`web_fetch` 调用，以及最终带来源的回答。可以[下载原始 `.cast` 录屏](../../assets/deepagents-demo.cast)并使用 `asciinema play` 在本地播放，或[在 asciinema.org 打开已上传的录屏](https://asciinema.org/a/1262198)。

```bash
cd examples/deepagents
cp .env.example .env
# 填写 WEB_SEARCH_API_KEY、DEEPAGENTS_MODEL 和模型供应商 Key。
uv sync --locked
uv run --env-file .env python agent.py --transport mcp "比较 MCP 与 REST Agent 工具接口"
uv run --env-file .env python agent.py --transport rest "比较 MCP 与 REST Agent 工具接口"
```

添加 `--stream` 后，可以实时打印主 Agent/子 Agent 步骤、长度受限的工具参数、工具完成事件和回答 Token。模型的 Reasoning Block 不会被输出：

```bash
uv run --env-file .env python agent.py --transport mcp --stream \
  "搜索 Camofox Browser 最新资料并附上来源"
```

使用自定义 OpenAI-compatible 模型服务时，把 `DEEPAGENTS_MODEL` 设置为服务端原生模型名，并配置 `DEEPAGENTS_MODEL_PROVIDER=openai`、`DEEPAGENTS_BASE_URL` 和 `DEEPAGENTS_API_KEY`。本地模型服务允许 HTTP，远程自定义 endpoint 必须使用 HTTPS；示例的模型工厂还支持配置超时和重试次数。

配置方式和错误处理详见 [Deep Agents 示例 README](https://github.com/idefav/web-search/tree/main/examples/deepagents)。

## Codex、Claude Code、OpenCode 与 Pi

推荐使用 CLI 安装，因为它支持幂等写入、保留无关配置、创建备份，并且永远不会持久化 Token。

```bash
export WEB_SEARCH_API_KEY="..."
camofox-web-search install codex --endpoint https://search.example.com --scope user
camofox-web-search install claude --endpoint https://search.example.com --scope project
camofox-web-search install opencode --endpoint https://search.example.com --scope user
camofox-web-search install pi --endpoint https://search.example.com --scope user
```

[手工配置示例](https://github.com/idefav/web-search/tree/main/examples/agent-configs)展示了安装器管理的准确配置，适合审计或自定义配置分发。Codex、Claude Code 和 OpenCode 使用 MCP；Pi 安装原生 npm 扩展并调用 REST gateway。

## 直接调用 API

```bash
curl --fail https://search.example.com/v1/search \
  -H "Authorization: Bearer $WEB_SEARCH_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"query":"Model Context Protocol","count":5,"freshness":"month"}'

curl --fail https://search.example.com/v1/fetch \
  -H "Authorization: Bearer $WEB_SEARCH_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://example.com/","max_chars":20000}'
```

完整 REST 契约可从 `/openapi.json` 获取；需要类型安全的 TypeScript 调用时使用 `camofox-web-search-client`。
