# 版本记录

Release tag 会把源码、npm 包和 GHCR 镜像固定为同一个版本。生产部署不应混用不同版本。

## v0.0.4 — OpenClaw 与 HermesAgent 原生 Provider

- 增加 `camofox-web-search-openclaw`，提供标准原生 `web_search` 和 `web_fetch`。
- 增加 PyPI 包 `camofox-web-search-hermes`，提供标准原生 `web_search` 和 `web_extract`。
- 扩展 CLI、示例、CI、npm Trusted Publishing 和 PyPI Trusted Publishing 流程。
- 增加真实 OpenClaw 2026.7.1、HermesAgent 0.19 宿主兼容检查与 Docker Provider E2E。

[GitHub Release v0.0.4](https://github.com/idefav/web-search/releases/tag/v0.0.4) · [比较 v0.0.3...v0.0.4](https://github.com/idefav/web-search/compare/v0.0.3...v0.0.4)

## v0.0.3 — 微信抓取就绪等待

- 微信公众号文章短暂经过验证中间页，或 snapshot 为空、只有 iframe 时，执行一次有界就绪等待。
- 交互验证持续存在时返回 HTTP 503、`Retry-After` 和类型化 `fetch_blocked`；不会解决或绕过 CAPTCHA。
- 从返回的最终 URL 中移除临时 `poc_token`，同时保留最终 URL 的 SSRF 校验。
- 增加 `WEB_FETCH_READY_TIMEOUT_MS`、结构化就绪日志、Prometheus metrics、双语部署指引和真实微信 Docker E2E。

[GitHub Release v0.0.3](https://github.com/idefav/web-search/releases/tag/v0.0.3) · [比较 v0.0.2...v0.0.3](https://github.com/idefav/web-search/compare/v0.0.2...v0.0.3)

## v0.0.2 — 多 Provider 搜索与 Agent 示例

- 增加可插拔的 DuckDuckGo、Brave、Bing、Google Provider，以及自动回退、冷却熔断、telemetry 和 Google 单并发保护。
- 增加双语部署文档，以及可运行的 Codex、Claude Code、OpenCode、Pi 和 LangChain Deep Agents 示例。
- Deep Agents 支持自定义 OpenAI-compatible 模型 Provider 和流式步骤输出。
- 扩展 REST、MCP、客户端、CLI、Pi 插件、Docker E2E 和多 Provider 契约的发布验证。

[GitHub Release v0.0.2](https://github.com/idefav/web-search/releases/tag/v0.0.2) · [比较 v0.0.1...v0.0.2](https://github.com/idefav/web-search/compare/v0.0.1...v0.0.2)

## v0.0.1 — 首次发布

- 提供带认证的 `web_search`、`web_fetch` REST 与无状态 Streamable HTTP MCP 服务。
- 发布 TypeScript core/client、Agent 配置 CLI、Pi 插件和固定版本 Docker 部署。
- 建立 CI、GitHub Pages、npm Trusted Publishing 和多架构 GHCR 发布流程。

[GitHub Release v0.0.1](https://github.com/idefav/web-search/releases/tag/v0.0.1) · [全部 GitHub Releases](https://github.com/idefav/web-search/releases)
