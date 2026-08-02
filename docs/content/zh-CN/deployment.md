# 服务端部署

项目支持的生产部署主线是 Linux 主机上的 Docker Compose。完整栈包含 gateway、Camofox Browser、拒绝私网目标的 Squid 出口代理，以及可选的 Caddy 自动 HTTPS。

## 前置条件

- 64 位 Linux 主机，安装 Docker Engine、Docker Compose v2、Git 和 OpenSSL。
- 能通过 HTTPS 拉取镜像、下载 GeoLite 数据并访问公开网页。
- 公网 HTTPS 模式需要域名解析到服务器并放行 TCP 80/443；UDP 443 只用于可选的 HTTP/3。
- 使用私有 Fork 镜像时，需要先完成 `docker login ghcr.io`；公开镜像无需登录。

不要向公网暴露 gateway 的 8080、Camofox 的 9377 或 Squid 的 3128 端口。远程 Agent 只能使用 HTTPS endpoint。

## 生成固定版本的部署命令

源码 Git tag 和 gateway 镜像 tag 必须一致。下面的命令默认使用构建当前文档时的项目版本。

<div class="fields">
  <label>GitHub owner<input id="owner" value="idefav" autocomplete="off"></label>
  <label>Repository<input id="repo" value="web-search" autocomplete="off"></label>
  <label>版本<input id="version" value="{{version}}" autocomplete="off"></label>
  <label>域名（可选）<input id="domain" placeholder="search.example.com" autocomplete="off"></label>
</div>
<div class="command-card"><div><span>Linux / Docker Compose</span><button data-copy="deploy-command">复制</button></div><pre id="deploy-command"></pre></div>

不填写域名时，gateway 只监听 `127.0.0.1:8080`；填写域名后，bootstrap 会加载 Caddy overlay 并自动申请 HTTPS 证书。脚本以 `0600` 权限创建 `.env`，生成两把独立的 64 字符密钥，拉取所有镜像并等待服务就绪。

## 配置搜索 Provider

默认使用不需要额外凭据的稳定优先顺序：

```dotenv
WEB_SEARCH_PROVIDERS=duckduckgo,brave,bing,google
WEB_SEARCH_PROVIDER_TIMEOUT_MS=15000
WEB_SEARCH_PROVIDER_COOLDOWN_MS=300000
```

列表同时决定启用的 Provider 和故障切换顺序，不能为空、不能重复，也不能包含未知名称。只填写 `google` 可保留单引擎行为；将其放在第一位可使用 Google-first。无论 gateway 浏览器并发设为多少，Google 都固定为单并发。

遇到 `search_blocked` 后，该 Provider 会立即进入冷却，同一个请求继续尝试下一 Provider。冷却期间会直接跳过，不再创建浏览器 Tab；冷却结束后只允许一个半开探测请求。明确的零结果不会触发切换。Provider 超时、不可用或解析契约变化也会触发本次降级，但只有 blocked 会打开冷却熔断。

## 选择暴露方式

### 仅回环地址

不要设置 `WEB_SEARCH_DOMAIN`。适用于 Agent 与服务位于同一主机、SSH Tunnel、私有 VPN，或者已经存在本机反向代理的场景。在服务端检查：

```bash
curl --fail http://127.0.0.1:8080/readyz
```

### 使用 Caddy 公网 HTTPS

先完成域名解析，再设置 `WEB_SEARCH_DOMAIN`。Caddy 会监听 80/443、自动申请和续期证书，并且只反向代理 gateway。如果服务器没有可工作的 IPv6 路由，不要配置 AAAA 记录。

```bash
curl --fail https://search.example.com/readyz
```

### 使用已有反向代理

按回环模式部署，把 HTTPS 请求转发到 `http://127.0.0.1:8080`。保持回环监听，转发请求体与 `Authorization` Header，并允许 MCP 流式响应。不要把 `/metrics` 暴露到公网。

## 验证认证与 MCP

`/healthz` 只表示 gateway 进程存活；`/readyz` 还会确认 Camofox 已连接且浏览器正在运行。这两个端点无需认证，搜索、抓取、MCP 和 metrics 都需要公开 API Key。

```bash
set -a
. ./.env
set +a

curl --fail http://127.0.0.1:8080/readyz
curl --fail http://127.0.0.1:8080/v1/search \
  -H "Authorization: Bearer $WEB_SEARCH_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"query":"Camofox Browser","count":3}'
```

在 Agent 主机安装 CLI，先运行普通检查。`--live` 会执行真实 Provider 链搜索，并显示最终 Provider 或明确的上游错误。

<div class="command-card"><div><span>Agent 验证</span><button data-copy="agent-command">复制</button></div><pre id="agent-command"></pre></div>

## 日常运维

回环部署只使用基础 Compose 文件；Caddy 部署的每条命令都要追加 `-f deploy/compose.public.yaml`。

```bash
docker compose --env-file .env -f deploy/compose.yaml ps
docker compose --env-file .env -f deploy/compose.yaml logs --tail=200 gateway camofox egress-guard
docker compose --env-file .env -f deploy/compose.yaml restart gateway
docker compose --env-file .env -f deploy/compose.yaml down
```

`down` 会保留命名卷。除非明确要删除 Caddy 证书和缓存的 GeoLite 数据，否则不要添加 `-v`。

带认证的 `/metrics` 可以通过回环 gateway 访问，其中包含 Provider 尝试结果、fallback、耗时和熔断状态指标。内置的公网 Caddy 配置会按设计对该路径返回 404。

## 升级与回滚

必须保留现有 `.env`，其中的公开 Key 已经安装到各 Agent。升级时不要运行 `bootstrap.sh --force`，否则两把密钥都会被替换。

1. 拉取并切换到目标 Release tag。
2. 只修改 `.env` 中的 `WEB_SEARCH_IMAGE`，让其指向相同版本的 GHCR 镜像。
3. 使用与首次部署相同的 Compose 文件组合执行 pull 和 up。
4. 确认 `/readyz`，再运行 `camofox-web-search doctor`。

```bash
git fetch --tags
git checkout v0.0.2
# 编辑 .env：WEB_SEARCH_IMAGE=ghcr.io/idefav/web-search:0.0.2
docker compose --env-file .env -f deploy/compose.yaml pull
docker compose --env-file .env -f deploy/compose.yaml up -d --no-build --wait --wait-timeout 180
```

回滚使用同样流程，只需切回上一版本的源码 tag 和镜像 tag。应通过 Secret Manager 或加密渠道备份 `.env`；一旦丢失，就必须在所有 Agent 上轮换公开 Key。

## 常见问题

| 现象 | 检查或处理方式 |
| --- | --- |
| `/healthz` 正常但 `/readyz` 返回 503 | 检查 `camofox`、`geolite-init` 日志以及服务器的外网 HTTPS。 |
| Caddy 无法申请证书 | 检查 A/AAAA 记录、80/443 端口，以及是否有其他进程占用端口。 |
| 401 `unauthorized` | 确认 Agent 进程读取到的 `WEB_SEARCH_API_KEY` 与服务端 `.env` 一致。 |
| 429 或 `busy` | 降低调用并发，或者有意识地调整 gateway 限制。 |
| `search_blocked` | 所有已启用 Provider 都被拦截或正在冷却。按 `Retry-After` 稍后重试，或在 Squid 后配置合规的上游代理；不得绕过出口防护。 |
| `unsafe_url` | URL 解析到了私网、保留、本地或其他禁止地址，这是预期的安全保护。 |
| `upstream_timeout` | 检查浏览器和出口日志，并且只在响应标记为可重试时重试。 |

项目不会自动解决 CAPTCHA，也不绕过搜索引擎访问控制。搜索可用性仍取决于部署服务器公网出口 IP 的信誉与策略。
