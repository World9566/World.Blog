#!/usr/bin/env bash
set -Eeuo pipefail
export PATH="/usr/bin:/bin:$PATH"
ROOT=$(cd -- "$(dirname -- "$0")/.." && pwd)
cd "$ROOT"
mkdir -p tmp
umask 077
export BLOG_ENV_FILE
BLOG_ENV_FILE=$(mktemp "$ROOT/tmp/production-check.XXXXXX.env")
project="world-blog-ci-$$-$RANDOM"
revision=${GITHUB_SHA:-0000000000000000000000000000000000000001}
[[ "$revision" =~ ^[a-f0-9]{40}$ ]] || exit 1
{
  printf 'COMPOSE_PROJECT_NAME=%s\nSITE_URL=https://blog.example.invalid\nSITE_HOST=blog.example.invalid\nORIGIN_PORT=18081\nBLOG_IMAGE=%s\nBLOG_RELEASE=%s\n' "$project" "$project" "$revision"
  printf 'POSTGRES_USER=blog\nPOSTGRES_DB=blog\nPOSTGRES_PASSWORD=%s\nMEILI_MASTER_KEY=%s\nBETTER_AUTH_SECRET=%s\nGITHUB_CLIENT_ID=rehearsal\nGITHUB_CLIENT_SECRET=rehearsal\n' "$(openssl rand -hex 32)" "$(openssl rand -hex 32)" "$(openssl rand -hex 32)"
} > "$BLOG_ENV_FILE"
source scripts/ops/common.sh
cleanup() {
  result=$?
  trap - EXIT
  # Only the unique project created by this run may have its volumes removed.
  if [[ "$COMPOSE_PROJECT_NAME" == "$project" && "$project" == world-blog-ci-* ]]; then
    dc down --volumes --remove-orphans || true
    rm -f -- "$BLOG_ENV_FILE"
  fi
  exit "$result"
}
trap cleanup EXIT
"${DOCKER[@]}" build --target runner --build-arg SITE_URL="$SITE_URL" --build-arg REVISION="$revision" --tag "$BLOG_IMAGE:$revision" "$(host_path "$ROOT")"
"${DOCKER[@]}" build --target ops --build-arg SITE_URL="$SITE_URL" --build-arg REVISION="$revision" --tag "$BLOG_IMAGE:$revision-ops" "$(host_path "$ROOT")"
dc pull postgres meilisearch gateway
BLOG_SKIP_PULL=1 bash scripts/ops/deploy.sh "$revision"
dc run -T --rm --no-deps ops node --input-type=module < scripts/check-production.mjs
dc run --rm --no-deps -e CHECK_BASE_URL=http://gateway:8080 ops pnpm content:check
sql "CREATE TABLE recovery_probe (id integer PRIMARY KEY, value text NOT NULL); INSERT INTO recovery_probe VALUES (1, 'backup-roundtrip');"
backup=$(bash scripts/ops/backup.sh)
cmp -s "$ENV_FILE" "$backup.env"
bash scripts/ops/restore.sh "$backup" --into blog_recovery_check
restored=$(dc exec -T postgres psql -U blog -d blog_recovery_check -Atc 'SELECT value FROM recovery_probe WHERE id=1;')
[[ "$restored" == backup-roundtrip ]]
[[ "$(sql 'SELECT value FROM recovery_probe WHERE id=1;')" == backup-roundtrip ]]
if bash scripts/ops/restore.sh "$backup" --into blog_recovery_check; then echo 'Existing database guard failed' >&2; exit 1; fi
echo 'Production deployment, HTTP and backup recovery checks passed. Test backups are retained under the unique project name.'
