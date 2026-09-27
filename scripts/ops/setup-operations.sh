#!/usr/bin/env bash
set -Eeuo pipefail
[[ $# -le 1 && ( $# == 0 || "$1" == --install ) ]] || { echo 'Usage: setup-operations.sh [--install]' >&2; exit 1; }
source "$(dirname -- "$0")/operations-common.sh"
load_operations_config
user=$(id -un)
[[ "$user" =~ ^[a-z_][a-z0-9_-]*$ && "$user" != root && "$ROOT" =~ ^/[a-zA-Z0-9/_.-]+$ ]] || { echo 'Run as the regular deployment user, from an absolute path without spaces.' >&2; exit 1; }
if [[ ! -e "$ROOT/.env.ops" ]]; then
  (set -o noclobber; cat "$ROOT/.env.ops.example" > "$ROOT/.env.ops")
fi
units="$OPS_STATE_DIR/units"
mkdir -p "$units"
for name in world-blog-backup.service world-blog-backup.timer world-blog-monitor.service world-blog-monitor.timer; do
  sed -e "s|^User=.*|User=$user|" -e "s|^WorkingDirectory=.*|WorkingDirectory=$ROOT|" "$ROOT/deploy/$name" > "$units/$name"
done
printf 'Prepared units for %s in %s\n' "$user" "$units"
if [[ "${1:-}" == --install ]]; then
  # This command is explicitly invoked by the server operator. It is never
  # called by application deployments or CI.
  sudo install -m 644 "$units"/world-blog-{backup,monitor}.{service,timer} /etc/systemd/system/
  sudo systemctl daemon-reload
  sudo systemctl enable --now world-blog-backup.timer world-blog-monitor.timer
  sudo systemctl start world-blog-monitor.service
  systemctl list-timers world-blog-backup.timer world-blog-monitor.timer --no-pager
else
  echo 'Review these files, then rerun with --install to enable the timers.'
fi
