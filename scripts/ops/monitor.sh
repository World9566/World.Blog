#!/usr/bin/env bash
set -Eeuo pipefail
source "$(dirname -- "$0")/operations-common.sh"
load_operations_config
for command in curl timeout flock df; do command -v "$command" >/dev/null || { echo "Required command unavailable: $command" >&2; exit 1; }; done
exec 9>"$OPS_STATE_DIR/monitor.lock"
flock -n 9 || exit 0
now=$(date +%s)
checked=$(date -u +%Y-%m-%dT%H:%M:%SZ)
report=$(mktemp "$OPS_REPORT_DIR/.report.XXXXXX")
events=$(mktemp "$OPS_STATE_DIR/.events.XXXXXX")
trap 'rm -f -- "$report" "$events"' EXIT
[[ ! -f "$OPS_STATE_DIR/events.jsonl" ]] || tail -n 200 "$OPS_STATE_DIR/events.jsonl" > "$events"
printf '{"version":1,"checkedAt":"%s","checks":[' "$checked" > "$report"
separator=''
record_check() {
  local id=$1 observed=$2 failures=0 previous=unknown changed=$now status
  if [[ -f "$OPS_STATE_DIR/$id" ]]; then
    read -r failures previous changed < "$OPS_STATE_DIR/$id" || true
    [[ "$failures" =~ ^[0-9]{1,6}$ && "$previous" =~ ^(ok|pending|firing|disabled)$ && "$changed" =~ ^[0-9]{1,12}$ ]] || { failures=0; previous=unknown; changed=$now; }
  fi
  if [[ "$observed" == failed ]]; then
    (( failures < 999999 )) && failures=$((failures + 1))
    status=pending
    if (( failures >= MONITOR_FAILURES )) || [[ "$previous" == firing ]]; then status=firing; fi
  else status=$observed; failures=0; fi
  if [[ "$status" != "$previous" ]]; then
    changed=$now
    # Emit only confirmed incidents and their recovery, not every healthy tick.
    if [[ "$status" == firing || "$previous" == firing ]]; then
      printf '%s %s %s\n' "$checked" "$id" "$status"
      printf '{"check":"%s","status":"%s","at":"%s"}\n' "$id" "$status" "$checked" >> "$events"
    fi
  fi
  printf '%s %s %s\n' "$failures" "$status" "$changed" > "$OPS_STATE_DIR/$id.new"
  mv -- "$OPS_STATE_DIR/$id.new" "$OPS_STATE_DIR/$id"
  printf '%s{"id":"%s","status":"%s","failures":%s,"since":%s}' "$separator" "$id" "$status" "$failures" "$changed" >> "$report"
  separator=,
}
DOCKER=(docker)
docker_ready=0
if timeout --kill-after=2s 10s docker info >/dev/null 2>&1; then docker_ready=1
elif timeout --kill-after=2s 10s sudo -n docker info >/dev/null 2>&1; then DOCKER=(sudo -n docker); docker_ready=1; fi
observed=failed
if [[ "$docker_ready" == 1 ]]; then
  observed=ok
  for service in web gateway postgres meilisearch; do
    id=$(timeout --kill-after=2s 10s "${DOCKER[@]}" ps -aq --filter "label=com.docker.compose.project=$COMPOSE_PROJECT_NAME" --filter "label=com.docker.compose.service=$service" 2>/dev/null) || id=''
    if [[ ! "$id" =~ ^[a-f0-9]{12,64}$ ]]; then observed=failed; continue; fi
    health=$(timeout --kill-after=2s 10s "${DOCKER[@]}" inspect --format '{{.State.Status}} {{if .State.Health}}{{.State.Health.Status}}{{end}}' "$id" 2>/dev/null) || health=''
    [[ "$health" == 'running healthy' ]] || observed=failed
  done
fi
record_check containers "$observed"
observed=failed
curl --fail --silent --max-time 8 --output /dev/null "http://127.0.0.1:$ORIGIN_PORT/api/health" && observed=ok
record_check origin "$observed"
observed=disabled
if [[ "$MONITOR_PUBLIC_ENABLED" == 1 ]]; then
  observed=failed
  # Homepage exercises the configured public Tunnel path. No query or cookies.
  code=$(curl --silent --max-time 12 --output /dev/null --write-out '%{http_code}' "$SITE_URL/") || code=000
  [[ "$code" == 200 ]] && observed=ok
fi
record_check public "$observed"
observed=ok
for directory in "$ROOT" "${CONTENT_ROOT:-$ROOT}"; do
  disk=$(df -Pk -- "$directory" 2>/dev/null | awk 'NR==2 {gsub(/%/, "", $5); print $4, $5}') || disk=''
  if [[ "$disk" =~ ^([0-9]+)[[:space:]]([0-9]+)$ ]]; then
    (( BASH_REMATCH[1] >= MONITOR_DISK_FREE_MB * 1024 && BASH_REMATCH[2] < MONITOR_DISK_PERCENT )) || observed=failed
  else observed=failed; fi
done
record_check disk "$observed"
latest=0
if [[ -d "$BACKUP_DIR" ]]; then
  while IFS= read -r marker; do
    file=${marker%.complete}
    [[ -s "$file" && -s "$file.env" && -s "$file.meta" && -s "$file.sha256" ]] || continue
    completed=$(cat "$marker")
    if [[ "$completed" =~ ^[0-9]{1,12}$ ]] && (( completed > latest && completed <= now )); then latest=$completed; fi
  done < <(find "$BACKUP_DIR" -maxdepth 1 -type f -name '*.dump.complete' -print)
fi
observed=failed
(( latest > 0 && now - latest < MONITOR_BACKUP_MAX_HOURS * 3600 )) && observed=ok
record_check backup_age "$observed"
observed=failed
if [[ -f "$STATE_DIR/backup-result" ]]; then
  read -r backup_time backup_exit < "$STATE_DIR/backup-result" || true
  [[ "${backup_exit:-}" == 0 ]] && observed=ok
fi
record_check backup_job "$observed"
tail -n 200 "$events" > "$OPS_STATE_DIR/events.jsonl.new"
mv -- "$OPS_STATE_DIR/events.jsonl.new" "$OPS_STATE_DIR/events.jsonl"
printf '],"events":[' >> "$report"
separator=''
while IFS= read -r event; do printf '%s%s' "$separator" "$event" >> "$report"; separator=,; done < "$OPS_STATE_DIR/events.jsonl"
printf ']}\n' >> "$report"
chmod 644 "$report"
mv -- "$report" "$OPS_REPORT_DIR/status.json"
