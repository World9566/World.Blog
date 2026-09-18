#!/usr/bin/env bash
set -Eeuo pipefail
ROOT=$(cd -- "$(dirname -- "$0")/../.." && pwd)
[[ $# == 2 ]] || { echo 'Usage: bash scripts/ops/init-env.sh https://blog.example.com ghcr.nju.edu.cn/owner/repository' >&2; exit 1; }
[[ "$1" =~ ^https://[a-z0-9]([a-z0-9.-]*[a-z0-9])?$ && "$2" =~ ^[a-z0-9][a-z0-9./_-]*$ ]] || { echo 'Use a canonical HTTPS origin and a lowercase image repository.' >&2; exit 1; }
[[ ! -e "$ROOT/.env.production" ]] || { echo 'Existing .env.production preserved.'; exit 0; }
command -v openssl >/dev/null
umask 077
# noclobber also protects against simultaneous initialization.
set -o noclobber
{
  printf 'COMPOSE_PROJECT_NAME=world-blog\nSITE_URL=%s\nSITE_HOST=%s\nORIGIN_PORT=8080\nBLOG_IMAGE=%s\nBLOG_RELEASE=not-deployed\n' "$1" "${1#https://}" "$2"
  printf 'GATEWAY_IMAGE=%s:nginx-1.28.2-alpine\nPOSTGRES_IMAGE=%s:postgres-18.6-bookworm\nMEILI_IMAGE=%s:meilisearch-1.53.2\n' "$2" "$2" "$2"
  printf 'POSTGRES_USER=blog\nPOSTGRES_DB=blog\nPOSTGRES_PASSWORD=%s\nMEILI_MASTER_KEY=%s\nBETTER_AUTH_SECRET=%s\nGITHUB_CLIENT_ID=\nGITHUB_CLIENT_SECRET=\n' "$(openssl rand -hex 32)" "$(openssl rand -hex 32)" "$(openssl rand -hex 32)"
} > "$ROOT/.env.production"
echo 'Created private production environment. Add production GitHub OAuth credentials before deployment.'
