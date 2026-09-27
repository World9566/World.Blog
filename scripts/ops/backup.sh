#!/usr/bin/env bash
set -Eeuo pipefail
source "$(dirname -- "$0")/common.sh"
owns_lock=0
if [[ "${BLOG_OPERATION_LOCK_HELD:-0}" != 1 ]]; then lock_operation; owns_lock=1; fi
stamp=$(date -u +%Y%m%dT%H%M%SZ)
temporary=$(mktemp "$BACKUP_DIR/.backup.XXXXXX")
finish() {
  local result=$?
  trap - EXIT
  set +e
  rm -f -- "$temporary"
  printf '%s %s\n' "$(date +%s)" "$result" > "$STATE_DIR/backup-result.new" &&
    mv -- "$STATE_DIR/backup-result.new" "$STATE_DIR/backup-result" || result=1
  if [[ "$owns_lock" == 1 ]]; then rmdir "$STATE_DIR/operation.lock" || result=1; fi
  exit "$result"
}
trap finish EXIT
dc exec -T postgres sh -c 'exec pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom --no-owner --no-acl' > "$temporary"
[[ -s "$temporary" ]] || { echo 'Empty database backup.' >&2; exit 1; }
dc exec -T postgres pg_restore --list < "$temporary" >/dev/null
file="$BACKUP_DIR/$stamp-${temporary##*.}.dump"
mv -- "$temporary" "$file"
(cd "$BACKUP_DIR" && sha256sum "${file##*/}" > "${file##*/}.sha256")
# During an application deployment the caller selects the NEW image, while
# the dump still belongs to the last successful application/schema.
backup_release=$BLOG_RELEASE
[[ ! -f "$STATE_DIR/current-release" ]] || backup_release=$(cat "$STATE_DIR/current-release")
[[ "$backup_release" =~ ^[a-f0-9]{40}$ || "$backup_release" == not-deployed ]]
content_release=none
if [[ -n "$CONTENT_RELEASES_DIR" && -L "$CONTENT_RELEASES_DIR/current" ]]; then
  content_release=$(readlink "$CONTENT_RELEASES_DIR/current")
  [[ ( "$content_release" =~ ^[a-f0-9]{40}$ || "$content_release" == empty ) && -d "$CONTENT_RELEASES_DIR/$content_release/posts" ]] || { echo 'Invalid active content release.' >&2; exit 1; }
  tar --exclude=.git -czf "$file.content.tar.gz" -C "$CONTENT_RELEASES_DIR/$content_release" .
  (cd "$BACKUP_DIR" && sha256sum "${file##*/}.content.tar.gz" > "${file##*/}.content.tar.gz.sha256")
fi
printf 'release=%s\nschema=%s\ncreated=%s\ncontent=%s\n' "$backup_release" "$(schema_version)" "$stamp" "$content_release" > "$file.meta"
# The auth encryption secret is required to recover encrypted OAuth records.
cp -- "$ENV_FILE" "$file.env"
for suffix in meta env; do
  (cd "$BACKUP_DIR" && sha256sum "${file##*/}.$suffix" > "${file##*/}.$suffix.sha256")
done
chmod 600 "$file" "$file.sha256" "$file.meta" "$file.env"
# A complete marker is published last. Monitoring and retention ignore
# interrupted sets; the dump's existing recovery interface stays compatible.
printf '%s\n' "$(date +%s)" > "$file.complete"
printf '%s\n' "$file"
