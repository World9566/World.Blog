#!/usr/bin/env bash
set -Eeuo pipefail
[[ $# == 1 ]] || { echo 'Usage: restore-drill.sh <backup.dump>' >&2; exit 1; }
file=$(cd -- "$(dirname -- "$1")" && pwd)/$(basename -- "$1")
source "$(dirname -- "$0")/common.sh"
lock_operation
destination="blog_drill_$(openssl rand -hex 8)"
[[ "$destination" =~ ^blog_drill_[a-f0-9]{16}$ && "$destination" != "${POSTGRES_DB:-blog}" ]]
[[ "$(sql "SELECT count(*) FROM pg_database WHERE datname = '$destination';")" == 0 ]]
cleanup() {
  local result=$?
  trap - EXIT
  set +e
  # Only this randomly named, previously absent scratch database is dropped.
  if ! dc exec -T postgres sh -c 'exec dropdb -U "$POSTGRES_USER" --if-exists "$1"' sh "$destination"; then result=1; fi
  printf '%s %s\n' "$(date +%s)" "$result" > "$STATE_DIR/restore-drill-result.new" &&
    mv -- "$STATE_DIR/restore-drill-result.new" "$STATE_DIR/restore-drill-result" || result=1
  rmdir "$STATE_DIR/operation.lock" || result=1
  exit "$result"
}
trap cleanup EXIT
bash "$ROOT/scripts/ops/restore.sh" "$file" --into "$destination"
[[ -s "$file.env" ]] || { echo 'Backup configuration copy is missing.' >&2; exit 1; }
expected=$(sed -n 's/^schema=//p' "$file.meta")
[[ "$expected" =~ ^[0-9]+$ ]]
actual=$(dc exec -T postgres sh -c 'exec psql -X -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$1" -At' sh "$destination" <<'SQL'
SELECT count(*) FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL;
SQL
)
[[ "$actual" == "$expected" ]] || { echo 'Restored migration count does not match the backup.' >&2; exit 1; }
dc exec -T postgres sh -c 'exec psql -X -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$1" -At' sh "$destination" <<'SQL'
SELECT 'users=' || count(*) FROM "user";
SELECT 'comments=' || count(*) FROM "comment";
SELECT 'bookmarks=' || count(*) FROM "bookmark";
SQL
content=$(sed -n 's/^content=//p' "$file.meta")
if [[ "$content" != none && -n "$content" ]]; then
  [[ -f "$file.content.tar.gz" && -f "$file.content.tar.gz.sha256" ]]
  [[ "$(sha256sum "$file.content.tar.gz" | cut -d ' ' -f 1)" == "$(cut -d ' ' -f 1 "$file.content.tar.gz.sha256")" ]]
  tar -tzf "$file.content.tar.gz" >/dev/null
fi
echo 'Restore drill passed. Active data and content were preserved; scratch database will be removed.'
