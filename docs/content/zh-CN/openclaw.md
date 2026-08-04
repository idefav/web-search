# OpenClaw 安装与使用

Camofox Web Search 通过原生 npm 插件接入 OpenClaw。OpenClaw 仍然暴露标准 `web_search` 与 `web_fetch` 工具，只把底层 Provider 切换到你的自托管 Gateway。

## 前置条件

- 已运行的 Camofox Web Search 服务，以及它生成的公开 `WEB_SEARCH_API_KEY`。
- OpenClaw 2026.7.1 或更高版本，并已配置可用模型。
- 安装 `camofox-web-search` CLI 所需的 Node.js 22 或更高版本。

修改 OpenClaw 前先检查服务端：

```bash
curl --fail https://search.example.com/healthz
npm install -g camofox-web-search
```

## 受管安装

将 Key 导出给安装器和诊断命令，然后安装原生 Provider：

```bash
export WEB_SEARCH_API_KEY="<通过安全方式从服务端 .env 复制>"

camofox-web-search install openclaw \
  --endpoint https://search.example.com \
  --scope user
```

安装器会：

- 安装 `camofox-web-search-openclaw`；
- 把 OpenClaw 的搜索与抓取 Provider 设置为 `camofox`；
- 只写入环境变量 SecretRef，不把 Token 值写进配置；
- 保留其他 OpenClaw 设置，并记录卸载时需要恢复的原 Provider。

如果搜索或抓取已经由其他 Provider 接管，应先检查冲突；只有明确要替换时才添加 `--force`。

## 让 Gateway 读取 Key

通过 systemd、launchd 或其他 supervisor 运行的 OpenClaw Gateway，不会继承只在交互式 Shell 中执行的 `export`。应把 Key 放入 OpenClaw 的运行时环境文件：

```bash
mkdir -p ~/.openclaw
chmod 700 ~/.openclaw
touch ~/.openclaw/.env
chmod 600 ~/.openclaw/.env
```

在 `~/.openclaw/.env` 中加入下面一行，且不要提交该文件：

```dotenv
WEB_SEARCH_API_KEY=<公开-gateway-key>
```

重启并检查运行时注册：

```bash
openclaw config validate
openclaw gateway restart
openclaw gateway status
openclaw plugins inspect camofox --runtime --json

camofox-web-search doctor openclaw \
  --endpoint https://search.example.com \
  --scope user --live
```

`doctor` 会检查本地配置、Gateway 健康状态、MCP 契约、OpenClaw 原生搜索/抓取 Provider 注册；添加 `--live` 后还会执行一次真实搜索。

## 开始使用

启动 OpenClaw TUI：

```bash
openclaw tui
```

示例提示词：

```text
使用 web_search 搜索 Camofox Browser 最新文档，抓取主要来源并给出引用。
```

OpenClaw 模型配置完成后，也可以执行一次性验证：

```bash
openclaw agent --agent main \
  --message "使用 web_search 搜索 OpenAI 官方网站，只返回第一个 URL。"
```

## 代理与本地模型

OpenClaw 使用 `HTTP_PROXY` 或 `HTTPS_PROXY` 时，应把 Web Search Gateway 和本地模型 endpoint 排除在代理之外。例如 Lima VM 通过宿主机访问 oMLX：

```dotenv
NO_PROXY=127.0.0.1,localhost,host.lima.internal,*.local,192.168.*
no_proxy=127.0.0.1,localhost,host.lima.internal,*.local,192.168.*
```

修改 `.env` 后重启 Gateway。Gateway 可以连接，但模型请求持续报告 `fetch failed`，通常说明本地模型主机没有加入 `NO_PROXY`。

## 手工安装与卸载

仓库中的 [OpenClaw 示例](https://github.com/idefav/web-search/tree/main/examples/openclaw)提供等价的手工插件安装与 JSON5 配置。

卸载受管集成并恢复安装前的 Provider：

```bash
camofox-web-search uninstall openclaw \
  --endpoint https://search.example.com \
  --scope user
openclaw gateway restart
```

卸载集成不会删除 Secret 环境文件中的 `WEB_SEARCH_API_KEY`。
