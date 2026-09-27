#!/usr/bin/env bash
set -Eeuo pipefail
source "$(dirname -- "$0")/operations-common.sh"
load_operations_config
# Serialize scheduled cycles without holding the deployment lock during
# monitoring/pruning. Manual backups still use the existing operation lock.
exec 9>"$OPS_STATE_DIR/backup-cycle.lock"
flock -n 9 || exit 0
if [[ -d "$STATE_DIR/operation.lock" ]]; then
  echo 'Backup deferred: another deployment or maintenance operation is active.'
  exit 75
fi
bash "$ROOT/scripts/ops/backup.sh"
if [[ "$BACKUP_AUTO_PRUNE" == 1 ]]; then bash "$ROOT/scripts/ops/backup-prune.sh" --apply; fi
