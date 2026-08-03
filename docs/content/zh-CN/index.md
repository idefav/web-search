# 给所有 Coding Agent 同一个 Web Search

Camofox Web Search 是一个可自托管、只读的 Web Search 服务，可供 Codex、Claude Code、OpenCode、Pi、OpenClaw、HermesAgent 和自定义 Agent 使用。服务基于固定版本的 Camofox Browser，同时提供带认证的 REST、无状态 Streamable HTTP MCP 与原生 Provider 插件。

<div class="badges"><span>多 Provider 搜索</span><span>MCP + REST</span><span>SSRF 防护</span><span>Bearer 认证</span></div>

> GitHub Pages 只托管这份文档。真实服务需要部署在支持 Docker Compose 的 Linux 主机上。

> 深度阅读：[《让 AI Agent 真正看见互联网：我们开源了 Camofox Web Search》](/zh-CN/article/)，了解 Agent Web Search 的完整能力、五种主流实现路线和项目设计取舍。

## 项目特色

<div class="release-grid">
<article><h3>一个 Agent endpoint</h3><p>Codex、Claude Code、OpenCode、Pi、OpenClaw、HermesAgent、LangChain 和自定义客户端共用一个认证服务。</p></article>
<article><h3>保留原生工具</h3><p>OpenClaw 使用 web_search/web_fetch，HermesAgent 使用 web_search/web_extract。</p></article>
<article><h3>搜索自动容错</h3><p>四个可插拔 Provider、顺序回退、冷却熔断，以及 Google 单并发保护。</p></article>
<article><h3>浏览器驱动抓取</h3><p>Camofox 可渲染 JavaScript 页面，并对短暂页面占位执行有界就绪重试。</p></article>
<article><h3>只读安全边界</h3><p>Bearer 认证、SSRF 出站防护、不可信内容边界，不提供浏览器交互或登录工具。</p></article>
<article><h3>完整交付链路</h3><p>Docker Compose、GHCR、OpenAPI、TypeScript 客户端、CLI 与 Pi/OpenClaw/HermesAgent 原生插件。</p></article>
<article><h3>生产可观测</h3><p>类型化错误、健康检查、Prometheus metrics、结构化日志、CI 和真实 Docker E2E。</p></article>
</div>

## 最新版本：v{{version}}

0.0.4 增加 OpenClaw 原生 `web_search`/`web_fetch` 与 HermesAgent 原生 `web_search`/`web_extract` Provider，并提供 CLI 受管安装和诊断、可运行示例、真实宿主兼容测试与 registry Trusted Publishing。

[查看 Release Notes](/zh-CN/releases/)或打开 [GitHub Release](https://github.com/idefav/web-search/releases/tag/v0.0.4)。

## 架构

<img class="architecture-diagram" src="../assets/architecture.png" alt="Camofox Web Search 架构：Coding Agent 通过 MCP 或 REST 连接认证 Gateway，再经 Camofox Browser 与带 SSRF 防护的 Squid 访问公开网页。">

Agent 只能访问 Gateway。Camofox 位于内部网络中，浏览器流量必须经过带 SSRF 防护的 Squid 出站代理才能访问公开网页。

## 从这里开始

1. 按照[服务端部署指南](/zh-CN/deployment/)创建固定版本的部署。
2. 安装 Agent 配置 CLI。
3. 启动 Agent 前导出服务端生成的公开 API Key。

```bash
npm install -g camofox-web-search
export WEB_SEARCH_API_KEY="<通过安全方式从服务端 .env 复制>"
camofox-web-search install codex --endpoint https://search.example.com --scope user
camofox-web-search doctor codex --endpoint https://search.example.com --scope user
```

安装器同样支持 `claude`、`opencode`、`pi`、`openclaw` 和 `hermes`。它只写入 endpoint 和环境变量引用，不会把 Token 保存到 Agent 配置中。

## 对外接口

| 接口 | Endpoint 或包 | 使用场景 |
| --- | --- | --- |
| MCP | `/mcp` | Codex、Claude Code、OpenCode 与自定义 MCP 客户端 |
| REST | `/v1/search`、`/v1/fetch` | Pi 与应用程序集成 |
| OpenClaw | `camofox-web-search-openclaw` | 原生 `web_search` 与 `web_fetch` Provider |
| HermesAgent | `camofox-web-search-hermes` | 原生 `web_search` 与 `web_extract` Provider |
| TypeScript | `camofox-web-search-client` | 类型安全的 Node.js 应用 |
| OpenAPI | `/openapi.json` | 查看契约或生成客户端 |

前往[示例](/zh-CN/examples/)查看手工 Agent 配置，以及基于 LangChain Deep Agents 的自定义研究 Agent。

## 安全边界

服务只公开两个高层只读工具，不提供浏览器点击、输入、脚本执行、Cookie 导入或登录态浏览。Camofox 无法直接访问外网，所有浏览器流量必须经过 Squid；Squid 会拒绝私网、保留地址、本地地址与云元数据地址。

搜索结果和抓取页面始终是不可信输入。工具输出会加入安全边界，但调用方仍需保留自己的 Prompt Injection 防护策略。

默认搜索顺序为 `duckduckgo → brave → bing → google`。被拦截的 Provider 会进入冷却并被自动跳过，Google 还会单独限制为一个并发请求。Provider 顺序和冷却时间都在服务端配置，因此 Agent 配置无需变化。

Fetch 遇到空白或只有 iframe 的页面时会执行一次有界的就绪重试，让微信公众号的临时验证中间页有机会自动完成；持续存在的验证会返回明确的 `fetch_blocked`，不会把占位内容交给 Agent。
