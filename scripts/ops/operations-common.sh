#!/usr/bin/env bash
# Shared by the monitor (which must work even when Docker is down) and backup
# utilities. This file never executes configuration as shell code.
load_operations_config() {
  ROOT=${ROOT:-$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)}
  local production=${BLOG_ENV_FILE:-"$ROOT/.env.production"} line key value
  [[ -f "$production" ]] || { echo 'Missing production configuration.' >&2; return 1; }
  while IFS= read -r line || [[ -n "$line" ]]; do
    line=${line%$'\r'}; key=${line%%=*}; value=${line#*=}
    case "$key" in
      COMPOSE_PROJECT_NAME|SITE_URL|ORIGIN_PORT|CONTENT_ROOT) printf -v "$key" '%s' "$value" ;;
    esac
  done < "$production"
  : "${COMPOSE_PROJECT_NAME:=world-blog}" "${ORIGIN_PORT:=8080}"
  [[ "$COMPOSE_PROJECT_NAME" =~ ^[a-z][a-z0-9-]{0,39}$ && "$COMPOSE_PROJECT_NAME" != blog-dev ]] || { echo 'Invalid production project name.' >&2; return 1; }
  [[ "$ORIGIN_PORT" =~ ^[1-9][0-9]{0,4}$ ]] && (( ORIGIN_PORT < 65536 )) || { echo 'Invalid origin port.' >&2; return 1; }
  [[ "${SITE_URL:-}" =~ ^https://[a-z0-9]([a-z0-9.-]*[a-z0-9])?$ ]] || { echo 'Invalid public site URL.' >&2; return 1; }
  BACKUP_KEEP_DAYS=14
  BACKUP_KEEP_MIN=7
  BACKUP_AUTO_PRUNE=0
  MONITOR_PUBLIC_ENABLED=1
  MONITOR_FAILURES=3
  MONITOR_DISK_PERCENT=85
  MONITOR_DISK_FREE_MB=1024
  MONITOR_BACKUP_MAX_HOURS=30
  local config=${BLOG_OPS_ENV_FILE:-"$ROOT/.env.ops"}
  if [[ -f "$config" ]]; then
    while IFS= read -r line || [[ -n "$line" ]]; do
      line=${line%$'\r'}
      [[ -z "$line" || "$line" == \#* ]] && continue
      key=${line%%=*}; value=${line#*=}
      case "$key" in
        BACKUP_KEEP_DAYS|BACKUP_KEEP_MIN|BACKUP_AUTO_PRUNE|MONITOR_PUBLIC_ENABLED|MONITOR_FAILURES|MONITOR_DISK_PERCENT|MONITOR_DISK_FREE_MB|MONITOR_BACKUP_MAX_HOURS)
          [[ "$value" =~ ^(0|[1-9][0-9]{0,5})$ ]] || { echo "Invalid numeric operations setting: $key" >&2; return 1; }
          printf -v "$key" '%s' "$value" ;;
        *) echo 'Unknown operations setting.' >&2; return 1 ;;
      esac
    done < "$config"
  fi
  (( BACKUP_KEEP_DAYS >= 1 && BACKUP_KEEP_MIN >= 1 && MONITOR_FAILURES >= 1 && MONITOR_FAILURES <= 100 && MONITOR_BACKUP_MAX_HOURS >= 1 && MONITOR_DISK_PERCENT >= 1 && MONITOR_DISK_PERCENT <= 99 && MONITOR_DISK_FREE_MB >= 1 )) || { echo 'Operations settings are outside the allowed range.' >&2; return 1; }
  [[ "$BACKUP_AUTO_PRUNE" =~ ^[01]$ && "$MONITOR_PUBLIC_ENABLED" =~ ^[01]$ ]] || { echo 'Operations switches must be 0 or 1.' >&2; return 1; }
  STATE_DIR="$ROOT/.deploy/$COMPOSE_PROJECT_NAME"
  BACKUP_DIR="$ROOT/backups/$COMPOSE_PROJECT_NAME"
  OPS_STATE_DIR="$STATE_DIR/operations-state"
  OPS_REPORT_DIR="$STATE_DIR/operations"
  umask 077
  mkdir -p "$OPS_STATE_DIR" "$OPS_REPORT_DIR"
  # Only sanitized reports live here. The container bind mount bypasses the
  # private parent; no environment files or private state are readable by web.
  chmod 755 "$OPS_REPORT_DIR"
}
