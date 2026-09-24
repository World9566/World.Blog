#!/usr/bin/env bash
set -euo pipefail
[[ "$1 $2" == 'image pull' ]] || exit 2
image=$3
name=${image##*/}
count_file="$TEST_ROOT/$name.count"
count=0
[[ ! -f "$count_file" ]] || count=$(cat "$count_file")
count=$((count+1))
printf '%s\n' "$count" > "$count_file"
printf 'start %s %s\n' "$image" "$count" >> "$TEST_ROOT/events"
case ${TEST_FAULT:-} in
  transient) if ((count == 1)); then exit 1; fi ;;
  failed) exit 1 ;;
  interrupted) exit 143 ;;
  stalled|always-stalled)
    if [[ "$TEST_FAULT" == always-stalled || "$count" == 1 ]]; then
      trap 'printf "cancel %s %s\n" "$image" "$count" >> "$TEST_ROOT/events"; exit 143' TERM
      # Repeated output is not proof that bytes are still arriving.
      while true; do echo 'ffe297ec5888 Downloading 1.049MB'; sleep 0.1; done
    fi
    ;;
esac
printf 'done %s %s\n' "$image" "$count" >> "$TEST_ROOT/events"
