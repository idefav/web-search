#!/bin/sh
set -eu

endpoint=${WEB_SEARCH_ENDPOINT:-http://127.0.0.1:8080}
api_key=${WEB_SEARCH_API_KEY:?WEB_SEARCH_API_KEY is required}
camofox_key=${CAMOFOX_ACCESS_KEY:?CAMOFOX_ACCESS_KEY is required}
compose_project=${COMPOSE_PROJECT_NAME:-camofox-web-search-e2e}
compose_file=${COMPOSE_FILE:-deploy/compose.yaml}

curl --retry 10 --retry-delay 1 --retry-connrefused --retry-all-errors -fsS "$endpoint/healthz" >/dev/null
curl --retry 10 --retry-delay 1 --retry-connrefused --retry-all-errors -fsS "$endpoint/readyz" >/dev/null

unauthorized_code=$(curl -sS -o /tmp/camofox-web-search-unauthorized.json -w '%{http_code}' \
  -H 'content-type: application/json' -d '{"query":"test"}' "$endpoint/v1/search")
test "$unauthorized_code" = "401"

fetch_body=$(curl -fsS -H "authorization: Bearer $api_key" -H 'content-type: application/json' \
  -d '{"url":"https://example.com/","max_chars":2000}' "$endpoint/v1/fetch")
node -e 'const x=JSON.parse(process.argv[1]); if(x.content_format!=="accessibility_text"||!x.content||x.final_url!=="https://example.com/") process.exit(1)' "$fetch_body"

wechat_file=/tmp/camofox-web-search-wechat-fetch.json
wechat_code=$(curl -sS --max-time 55 -o "$wechat_file" -w '%{http_code}' \
  -H "authorization: Bearer $api_key" -H 'content-type: application/json' \
  -d '{"url":"https://mp.weixin.qq.com/s?__biz=Mzg5MzEyNzEwNQ==&mid=2247827469&idx=1&sn=4427e49e9ebc2e1ba0f79cca044d76a6","max_chars":2000}' \
  "$endpoint/v1/fetch")
node -e '
  const fs=require("fs"); const status=Number(process.argv[1]); const x=JSON.parse(fs.readFileSync(process.argv[2],"utf8"));
  if(status===200 && x.content_format==="accessibility_text" && x.content?.trim() && x.content.trim()!=="- iframe" && !x.final_url.includes("wappoc_appmsgcaptcha") && !x.final_url.includes("poc_token")) process.exit(0);
  if(status===503 && x.error?.code==="fetch_blocked" && x.error?.retryable===true && x.error?.retry_after_seconds===60) process.exit(0);
  console.error(x); process.exit(1);
' "$wechat_code" "$wechat_file"

unsafe_code=$(curl -sS -o /tmp/camofox-web-search-unsafe.json -w '%{http_code}' \
  -H "authorization: Bearer $api_key" -H 'content-type: application/json' \
  -d '{"url":"http://169.254.169.254/latest/meta-data/"}' "$endpoint/v1/fetch")
test "$unsafe_code" = "400"
node -e 'const x=JSON.parse(require("fs").readFileSync("/tmp/camofox-web-search-unsafe.json","utf8")); if(x.error?.code!=="unsafe_url") process.exit(1)'

search_file=/tmp/camofox-web-search-live-search.json
search_code=$(curl -sS -o "$search_file" -w '%{http_code}' \
  -H "authorization: Bearer $api_key" -H 'content-type: application/json' \
  -d '{"query":"Model Context Protocol official","count":3,"include_domains":["modelcontextprotocol.io"]}' "$endpoint/v1/search")
# The following single-quoted program is JavaScript; its template literal is not a shell expansion.
# shellcheck disable=SC2016
node -e '
  const fs=require("fs"); const status=Number(process.argv[1]); const x=JSON.parse(fs.readFileSync(process.argv[2],"utf8"));
  if(status===200 && Array.isArray(x.results) && x.results.length>0 && typeof x.provider==="string") { console.log(`Live ${x.provider} returned ${x.results.length} result(s)`); process.exit(0); }
  if(status>=500 && ["search_blocked","upstream_unavailable","upstream_timeout"].includes(x.error?.code)) { console.log(`Live provider chain returned typed ${x.error.code}`); process.exit(0); }
  console.error(x); process.exit(1);
' "$search_code" "$search_file"

WEB_SEARCH_ENDPOINT="$endpoint" WEB_SEARCH_API_KEY="$api_key" node scripts/mcp-smoke.mjs

for provider in duckduckgo brave bing google; do
  for slot in 1 2 3; do
    user_id="web-search-$provider-slot-$slot"
    tabs=$(docker compose -p "$compose_project" -f "$compose_file" exec -T camofox \
      curl -fsS -H "authorization: Bearer $camofox_key" "http://127.0.0.1:9377/tabs?userId=$user_id")
    node -e 'const x=JSON.parse(process.argv[1]); if(!Array.isArray(x.tabs)||x.tabs.length!==0) process.exit(1)' "$tabs"
  done
done

echo "Docker REST, MCP, SSRF, WeChat fetch readiness, multi-provider live-search classification, and tab cleanup E2E passed"
