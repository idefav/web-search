#!/bin/sh
set -eu

script_dir=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)
repo_dir=$(dirname "$script_dir")
env_file="$repo_dir/.env"

if ! command -v docker >/dev/null 2>&1; then
  echo "docker is required" >&2
  exit 1
fi
if ! docker compose version >/dev/null 2>&1; then
  echo "docker compose v2 is required" >&2
  exit 1
fi
if ! command -v openssl >/dev/null 2>&1; then
  echo "openssl is required" >&2
  exit 1
fi
if [ -z "${WEB_SEARCH_IMAGE:-}" ]; then
  echo "Set WEB_SEARCH_IMAGE to the published GHCR image, for example ghcr.io/owner/repo:latest" >&2
  exit 1
fi
if [ -e "$env_file" ] && [ "${1:-}" != "--force" ]; then
  echo "$env_file already exists; use --force to replace it" >&2
  exit 1
fi

umask 077
public_key=$(openssl rand -hex 32)
internal_key=$(openssl rand -hex 32)
{
  printf 'WEB_SEARCH_API_KEY=%s\n' "$public_key"
  printf 'CAMOFOX_ACCESS_KEY=%s\n' "$internal_key"
  printf 'WEB_SEARCH_IMAGE=%s\n' "$WEB_SEARCH_IMAGE"
  printf 'WEB_SEARCH_PORT=%s\n' "${WEB_SEARCH_PORT:-8080}"
  printf 'WEB_SEARCH_PROVIDERS=%s\n' "${WEB_SEARCH_PROVIDERS:-duckduckgo,brave,bing,google}"
  printf 'WEB_SEARCH_PROVIDER_TIMEOUT_MS=%s\n' "${WEB_SEARCH_PROVIDER_TIMEOUT_MS:-15000}"
  printf 'WEB_SEARCH_PROVIDER_COOLDOWN_MS=%s\n' "${WEB_SEARCH_PROVIDER_COOLDOWN_MS:-300000}"
  printf 'WEB_FETCH_READY_TIMEOUT_MS=%s\n' "${WEB_FETCH_READY_TIMEOUT_MS:-5000}"
  if [ -n "${WEB_SEARCH_DOMAIN:-}" ]; then printf 'WEB_SEARCH_DOMAIN=%s\n' "$WEB_SEARCH_DOMAIN"; fi
} > "$env_file"

compose_args="-f $script_dir/compose.yaml"
if [ -n "${WEB_SEARCH_DOMAIN:-}" ]; then compose_args="$compose_args -f $script_dir/compose.public.yaml"; fi

# shellcheck disable=SC2086
docker compose --env-file "$env_file" $compose_args pull
# shellcheck disable=SC2086
docker compose --env-file "$env_file" $compose_args up -d --no-build --wait --wait-timeout 180

if [ -n "${WEB_SEARCH_DOMAIN:-}" ]; then
  echo "Deployment is ready at https://$WEB_SEARCH_DOMAIN"
else
  echo "Deployment is ready at http://127.0.0.1:${WEB_SEARCH_PORT:-8080}"
fi
echo "The API key is stored with mode 0600 in $env_file"
