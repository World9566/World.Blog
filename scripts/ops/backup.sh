#!/usr/bin/env bash
set -Eeuo pipefail
source "$(dirname -- "$0")/common.sh"
owns_lock=0
if [[ "${BLOG_OPERATION_LOCK_HELD:-0}" != 1 ]]; then lock_operation; owns_lock=1; fi
stamp=$(date -u +%Y%m%dT%H%M%SZ)
temporary=$(mktemp "$BACKUP_DIR/.backup.XXXXXX")
trap 'rm -f -- "$temporary"; if [[ "$owns_lock" == 1 ]]; then rmdir "$STATE_DIR/operation.lock"; fi' EXIT
dc exec -T postgres sh -c 'exec pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom --no-owner --no-acl' > "$temporary"
[[ -s "$temporary" ]] || { echo 'Empty database backup.' >&2; exit 1; }
dc exec -T postgres pg_restore --list < "$temporary" >/dev/null
file="$BACKUP_DIR/$stamp-${temporary##*.}.dump"
mv -- "$temporary" "$file"
(cd "$BACKUP_DIR" && sha256sum "${file##*/}" > "${file##*/}.sha256")
printf 'release=%s\nschema=%s\ncreated=%s\n' "$BLOG_RELEASE" "$(schema_version)" "$stamp" > "$file.meta"
# The auth encryption secret is required to recover encrypted OAuth records.
cp -- "$ENV_FILE" "$file.env"
chmod 600 "$file" "$file.sha256" "$file.meta" "$file.env"
printf '%s\n' "$file"
