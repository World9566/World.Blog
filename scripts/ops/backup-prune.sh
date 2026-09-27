#!/usr/bin/env bash
set -Eeuo pipefail
[[ $# -le 1 && ( $# == 0 || "$1" == --apply ) ]] || { echo 'Usage: backup-prune.sh [--apply]' >&2; exit 1; }
source "$(dirname -- "$0")/common.sh"
source "$ROOT/scripts/ops/operations-common.sh"
load_operations_config
lock_operation
cutoff=$(( $(date +%s) - BACKUP_KEEP_DAYS * 86400 ))
kept=0
# Only script-generated complete sets inside this project's backup directory.
# Never follow symlinks, recurse, or use a broad backup-name glob for deletion.
while IFS= read -r marker; do
  name=${marker##*/}
  [[ "$name" =~ ^[0-9]{8}T[0-9]{6}Z-[a-zA-Z0-9]+\.dump\.complete$ && ! -L "$marker" ]] || continue
  file=${marker%.complete}
  [[ -f "$file" && ! -L "$file" && -f "$file.env" && -f "$file.meta" && -f "$file.sha256" ]] || continue
  kept=$((kept + 1))
  (( kept > BACKUP_KEEP_MIN )) || continue
  completed=$(cat "$marker")
  [[ "$completed" =~ ^[0-9]{1,12}$ ]] || continue
  (( completed < cutoff )) || continue
  printf '%s %s\n' "${1:-preview}" "${file##*/}"
  if [[ "${1:-}" == --apply ]]; then
    for suffix in '' .sha256 .meta .meta.sha256 .env .env.sha256 .content.tar.gz .content.tar.gz.sha256 .complete; do
      rm -f -- "$file$suffix"
    done
  fi
done < <(find "$BACKUP_DIR" -maxdepth 1 -type f -name '*.dump.complete' -print | LC_ALL=C sort -r)
