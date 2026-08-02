# Camofox Web Search

[English](./README.md) · [简体中文](./README.zh-CN.md) · [在线文档](https://idefav.github.io/web-search/zh-CN/)

面向 Codex、Claude Code、OpenCode、Pi 与自定义 Agent 的自托管 `web_search`、`web_fetch` 服务。项目封装固定版本的 Camofox Browser REST API，不维护上游 Fork，同时提供带认证的 REST 和无状态 Streamable HTTP MCP。

## 架构

```text
Agent ──HTTPS/MCP 或 REST──> Gateway ──内部网络──> Camofox ──Squid 出口防护──> 公开网页
```

- `apps/server`：带认证的 REST 与 MCP gateway。
- `packages/core`：公开契约、可插拔搜索 Provider、URL 安全和浏览器编排。
- `packages/client`：类型安全的 REST 客户端。
- `packages/cli`：可幂等执行的 Agent 配置安装器。
- `plugins/pi`：Pi 原生工具。
- `deploy`：浏览器网络隔离、镜像固定的 Docker 部署。
- `examples`：Agent 手工配置与 LangChain Deep Agents 自定义研究 Agent。

服务只公开两个高层只读工具，不提供浏览器点击、输入、脚本执行、Cookie 导入或登录态浏览。

## 部署服务端

生产部署主线是安装了 Docker Engine、Compose v2、Git 和 OpenSSL 的 64 位 Linux 主机。源码 tag 与 GHCR 镜像必须使用同一个版本：

```bash
VERSION="0.0.2"
git clone --branch "v${VERSION}" --depth 1 https://github.com/idefav/web-search.git
cd web-search
WEB_SEARCH_IMAGE="ghcr.io/idefav/web-search:${VERSION}" ./deploy/bootstrap.sh
```

默认只监听 `127.0.0.1:8080`。需要公网自动 HTTPS 时，先把域名解析到服务器并放行 80/443，再执行：

```bash
WEB_SEARCH_DOMAIN="search.example.com" \
WEB_SEARCH_IMAGE="ghcr.io/idefav/web-search:${VERSION}" \
./deploy/bootstrap.sh
```

Bootstrap 会以 `0600` 权限创建 `.env`，生成不同的公开与内部 Key，拉取固定版本的完整服务栈并等待 Camofox 就绪。升级时不要使用 `--force`，否则两把 Key 都会被轮换。

已有反向代理、部署验证、日志与 metrics、升级回滚、网络安全和排障请查看完整的[服务端部署指南](https://idefav.github.io/web-search/zh-CN/deployment/)。GitHub Pages 只托管文档，不能运行浏览器服务。

默认按稳定优先顺序使用 `duckduckgo,brave,bing,google`。某个 Provider 被拦截后会进入五分钟冷却，并自动切换到下一个 Provider；可通过 `WEB_SEARCH_PROVIDERS` 调整顺序。Google 始终限制为单并发。项目不会绕过 CAPTCHA 或搜索引擎访问控制。

## 接入 Agent

```bash
npm install -g camofox-web-search
export WEB_SEARCH_API_KEY="<通过安全方式从服务端 .env 复制>"

camofox-web-search install codex --endpoint https://search.example.com --scope user
camofox-web-search doctor codex --endpoint https://search.example.com --scope user
```

可以把 `codex` 替换为 `claude`、`opencode` 或 `pi`。安装器只保存 endpoint 和环境变量引用，不会保存 Token。使用 `--dry-run` 预览改动，使用 `--force` 替换冲突的受管配置，使用 `doctor --live` 执行真实搜索验证。

Pi 安装流程还会执行 `pi install npm:camofox-web-search-pi`，注册调用 REST gateway 的原生工具。

## API

```bash
curl --fail https://search.example.com/v1/search \
  -H "Authorization: Bearer $WEB_SEARCH_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"query":"Camofox browser","count":5,"freshness":"month"}'

curl --fail https://search.example.com/v1/fetch \
  -H "Authorization: Bearer $WEB_SEARCH_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://example.com/","max_chars":20000}'
```

Search 支持 `query`、`count`、`freshness`、`include_domains`、`exclude_domains`、`language` 和 `country`。Fetch 支持 `url`、`offset` 和 `max_chars`。完整契约可查看 `/openapi.json` 与导出的 TypeScript 类型。

所有网页文本都是不可信输入。工具描述和输出边界会提醒 Agent 不要执行网页指令，但调用方仍需保留自己的 Prompt Injection 防护。

## 示例

- [`examples/deepagents`](./examples/deepagents)：可运行的 Python 3.11+ Deep Agents 自定义研究 Agent，支持 MCP/REST 工具、标准 LangChain 模型和自定义 OpenAI-compatible Provider。
- [`examples/agent-configs`](./examples/agent-configs)：Codex、Claude Code、OpenCode 和 Pi 的准确手工配置。

[示例文档](https://idefav.github.io/web-search/zh-CN/examples/)还包含直接 REST 调用方式。Agent 配置仍推荐使用 CLI 安装。

Deep Agents 示例添加 `--stream` 后，会实时打印 Agent 步骤、工具活动和回答 Token。

## 开发与验证

需要 Node.js 22 或更高版本。

```bash
npm install
npm run typecheck
npm test
npm run build
npm run docs:build
npm run docs:check
```

完整 Docker 栈运行后，`npm run e2e:docker` 会验证 REST 认证、真实页面抓取、元数据地址拒绝、多 Provider 实时搜索或明确的类型化失败、MCP 工具发现和调用，以及 Camofox Tab 清理。

Deep Agents 示例使用 `uv sync --locked && uv run pytest` 进行不访问真实服务和模型的离线测试。

## 发布

- `CI`：TypeScript、单元测试、文档构建、Deep Agents 离线测试、npm 打包检查、Compose 验证和 gateway 镜像构建。
- `GitHub Pages`：相关改动进入 `main` 后构建并发布双语站点。
- `Release`：通过 Trusted Publishing 与 OIDC 发布多架构 GHCR 镜像和四个 npm 包。
- `Docker E2E`：每周和手工执行真实固定版本浏览器栈。

升级与回滚见[服务端部署指南](https://idefav.github.io/web-search/zh-CN/deployment/)。

## 上游兼容性

浏览器镜像固定为 Camofox Browser 1.13.0 及其多平台 digest。各 Provider 解析器依赖 v1.13.0 accessibility snapshot 契约；不兼容变更会让 fixture 测试失败。只有经过评审并通过契约与可选真实测试后才能升级镜像。
