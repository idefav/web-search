# HermesAgent 安装与使用

Camofox Web Search 通过 Python entry-point 插件接入 HermesAgent。HermesAgent 继续使用标准 `web_search` 与 `web_extract` 工具，`camofox` backend 会把请求发送到你的自托管 Gateway。

## 前置条件

- 已运行的 Camofox Web Search 服务，以及它生成的公开 `WEB_SEARCH_API_KEY`。
- 已安装 HermesAgent，并可通过 `hermes` 命令运行。
- HermesAgent 环境使用 Python 3.11 至 3.13。
- 安装 `camofox-web-search` CLI 所需的 Node.js 22 或更高版本。

```bash
curl --fail https://search.example.com/healthz
npm install -g camofox-web-search
```

## 受管安装

```bash
export WEB_SEARCH_API_KEY="<通过安全方式从服务端 .env 复制>"

camofox-web-search install hermes \
  --endpoint https://search.example.com \
  --scope user
```

安装器会：

- 从当前 Hermes 启动脚本或 `venv`/`.venv` 目录发现 Python；
- 优先使用可用的 `uv`，包括 Hermes 自带的 `~/.hermes/bin/uv`；
- 把 `camofox-web-search-hermes` 安装到 Hermes 环境；
- 启用插件，并把搜索和提取 backend 都设置为 `camofox`；
- 不把 API Key 写入 `config.yaml`。

Hermes 使用自定义环境时，可明确指定解释器：

```bash
export HERMES_PYTHON=/path/to/hermes/python
camofox-web-search install hermes \
  --endpoint https://search.example.com \
  --scope user \
  --hermes-python "$HERMES_PYTHON"
```

## 持久化 Key

Hermes 会从 `~/.hermes/.env` 加载 Secret。先创建并限制文件权限，再添加 Key；不要提交该文件：

```bash
mkdir -p ~/.hermes
chmod 700 ~/.hermes
touch ~/.hermes/.env
chmod 600 ~/.hermes/.env
```

```dotenv
WEB_SEARCH_API_KEY=<公开-gateway-key>
```

Endpoint 与 backend 选择属于非敏感配置，保存在 `~/.hermes/config.yaml`。

## 验证集成

```bash
hermes plugins list --plain --no-bundled

camofox-web-search doctor hermes \
  --endpoint https://search.example.com \
  --scope user --live
```

`hermes-provider` 诊断会执行 Hermes 的真实插件发现流程，并确认 `camofox` Provider 已注册搜索与提取能力；`--live` 还会执行一次真实 Gateway 搜索。

如果当前 Shell 没有导出 Key，应在运行 `doctor` 前先执行 `export`；Hermes 自身可以从 `~/.hermes/.env` 读取持久化值。

## 开始使用

启动 TUI 时明确启用 Web Toolset：

```bash
hermes -t web chat --tui
```

示例提示词：

```text
使用 web_search 搜索 Camofox Browser 最新文档，提取主要来源并给出引用。
```

模型已经配置好时，也可以执行一次性验证：

```bash
hermes -t web -z \
  "使用 web_search 搜索 OpenAI 官方网站，只返回第一个 URL。"
```

## 常见问题

### 找不到 HermesAgent Python 解释器

明确指定 Hermes 使用的解释器：

```bash
export HERMES_PYTHON="$HOME/.hermes/hermes-agent/venv/bin/python"
camofox-web-search install hermes \
  --endpoint https://search.example.com \
  --scope user \
  --hermes-python "$HERMES_PYTHON"
```

部分旧版安装使用 `.venv/bin/python`，而不是 `venv/bin/python`。

### No module named pip

Hermes 环境可能有意不安装 `pip`。当前安装器会自动使用 Hermes 自带的 `uv`。需要手工修复时执行：

```bash
~/.hermes/bin/uv pip install \
  --python ~/.hermes/hermes-agent/venv/bin/python \
  --reinstall camofox-web-search-hermes
```

### 插件在列表里，但 Provider 没有注册

重新安装当前包、再次启用插件并运行 `doctor`。诊断必须报告 `PASS hermes-provider`；只在 `hermes plugins list` 中看到包名，不能证明运行时已经注册成功。

## 手工安装与卸载

仓库中的 [HermesAgent 示例](https://github.com/idefav/web-search/tree/main/examples/hermes)提供等价的 PyPI 手工安装与 YAML 配置。

卸载受管集成并恢复原 backend：

```bash
camofox-web-search uninstall hermes \
  --endpoint https://search.example.com \
  --scope user
```

卸载集成不会删除 `~/.hermes/.env` 中的 `WEB_SEARCH_API_KEY`。
