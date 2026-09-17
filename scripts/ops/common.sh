#!/usr/bin/env bash
set -Eeuo pipefail
export PATH="/usr/bin:/bin:$PATH"
ROOT=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)
ENV_FILE=${BLOG_ENV_FILE:-"$ROOT/.env.production"}
[[ -f "$ENV_FILE" ]] || { echo "Missing .env.production. Run scripts/ops/init-env.sh first." >&2; exit 1; }
# Parse simple KEY=value records without executing the configuration as shell code.
while IFS= read -r line || [[ -n "$line" ]]; do
  line=${line%$'\r'}
  [[ -z "$line" || "$line" == \#* ]] && continue
  key=${line%%=*}; value=${line#*=}
  case "$key" in
    COMPOSE_PROJECT_NAME|SITE_URL|SITE_HOST|ORIGIN_PORT|BLOG_IMAGE|BLOG_RELEASE|GATEWAY_IMAGE|POSTGRES_IMAGE|MEILI_IMAGE|POSTGRES_USER|POSTGRES_DB|POSTGRES_PASSWORD|MEILI_MASTER_KEY|BETTER_AUTH_SECRET|GITHUB_CLIENT_ID|GITHUB_CLIENT_SECRET) export "$key=$value" ;;
    *) echo "Unexpected setting name in production environment." >&2; exit 1 ;;
  esac
done < "$ENV_FILE"
: "${COMPOSE_PROJECT_NAME:=world-blog}"
[[ "$COMPOSE_PROJECT_NAME" =~ ^[a-z][a-z0-9-]{0,39}$ && "$COMPOSE_PROJECT_NAME" != blog-dev ]] || { echo "Invalid production project name." >&2; exit 1; }
[[ "${SITE_HOST:-}" =~ ^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$ && "${SITE_URL:-}" == "https://$SITE_HOST" ]] || { echo "SITE_HOST must match the HTTPS SITE_URL." >&2; exit 1; }
[[ "${BLOG_IMAGE:-}" =~ ^[a-z0-9][a-z0-9./_-]*$ ]] || { echo "Invalid image repository." >&2; exit 1; }
[[ "${POSTGRES_PASSWORD:-}" =~ ^[a-fA-F0-9]{64}$ ]] || { echo "POSTGRES_PASSWORD must contain 64 hexadecimal characters." >&2; exit 1; }
[[ "${POSTGRES_USER:-blog}" =~ ^[a-z][a-z0-9_]*$ && "${POSTGRES_DB:-blog}" =~ ^[a-z][a-z0-9_]*$ ]] || { echo "Invalid database name or user." >&2; exit 1; }
STATE_DIR="$ROOT/.deploy/$COMPOSE_PROJECT_NAME"
BACKUP_DIR="$ROOT/backups/$COMPOSE_PROJECT_NAME"
umask 077
mkdir -p "$STATE_DIR" "$BACKUP_DIR"
if [[ -f "$STATE_DIR/current-release" ]]; then
  BLOG_RELEASE=$(cat "$STATE_DIR/current-release")
  [[ "$BLOG_RELEASE" =~ ^[a-f0-9]{40}$ ]] || { echo "Invalid release state." >&2; exit 1; }
  export BLOG_RELEASE
fi
DOCKER=(docker)
if ! docker info >/dev/null 2>&1; then
  if command -v sudo >/dev/null && sudo -n docker info >/dev/null 2>&1; then DOCKER=(sudo -n docker)
  else echo "Docker is unavailable or requires permission." >&2; exit 1; fi
fi
host_path() { if command -v cygpath >/dev/null; then cygpath -m "$1"; else printf '%s' "$1"; fi; }
dc() { MSYS_NO_PATHCONV=1 "${DOCKER[@]}" compose --env-file "$(host_path "$ENV_FILE")" --project-directory "$(host_path "$ROOT")" -f "$(host_path "$ROOT/compose.prod.yaml")" "$@"; }
sql() { dc exec -T postgres sh -c 'exec psql -X -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -At' <<< "$1"; }
schema_version() {
  local exists
  exists=$(sql "SELECT to_regclass('public.\"_prisma_migrations\"') IS NOT NULL;")
  if [[ "$exists" == t ]]; then sql 'SELECT count(*) FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL;'
  else printf '0\n'; fi
}
lock_operation() {
  mkdir "$STATE_DIR/operation.lock" 2>/dev/null || { echo "Another operation is active. Inspect .deploy before removing a stale lock." >&2; exit 1; }
  export BLOG_OPERATION_LOCK_HELD=1
  trap 'rmdir "$STATE_DIR/operation.lock"' EXIT
}
