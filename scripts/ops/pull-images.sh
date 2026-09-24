#!/usr/bin/env bash
# Sourced by deploy.sh after common.sh. Keep all downloads before any service
# changes. A registry connection can stop transferring without returning an
# error, so Docker's own error retries are not sufficient.
pull_images() {
  local attempt_timeout=${BLOG_PULL_ATTEMPT_TIMEOUT:-180}
  local total_timeout=${BLOG_PULL_TOTAL_TIMEOUT:-600}
  local attempts=${BLOG_PULL_ATTEMPTS:-3}
  local retry_delay=${BLOG_PULL_RETRY_DELAY:-5}
  local value listing deadline image attempt remaining allowance result delay
  local -A seen=()
  local -a pull_timeout=(timeout --verbose --signal=TERM --kill-after=15s)
  local -a pull_docker=("${DOCKER[@]}")
  # timeout must have permission to signal the actual Docker client. Running
  # `timeout sudo docker` can kill the monitor while leaving a root-owned
  # pull alive, so each retry joins the same stuck daemon-side download.
  # common.sh uses either (docker) or (sudo -n docker).
  if [[ "${DOCKER[0]}" == sudo && "${DOCKER[1]:-}" == -n ]]; then
    pull_timeout=(sudo -n "${pull_timeout[@]}")
    pull_docker=("${DOCKER[@]:2}")
  fi
  for value in "$attempt_timeout" "$total_timeout" "$attempts"; do
    [[ "$value" =~ ^[1-9][0-9]{0,4}$ ]] || { echo 'Invalid image pull timeout or attempt count.' >&2; return 1; }
  done
  [[ "$retry_delay" =~ ^(0|[1-9][0-9]{0,3})$ ]] || { echo 'Invalid image pull retry delay.' >&2; return 1; }
  command -v timeout >/dev/null || { echo 'Image downloads require GNU timeout.' >&2; return 1; }
  listing=$(dc --profile tools config --images) || return
  [[ -n "$listing" ]] || { echo 'No deployment images were configured.' >&2; return 1; }
  deadline=$((SECONDS + total_timeout))
  while IFS= read -r image; do
    [[ -n "$image" && -z "${seen[$image]:-}" ]] || continue
    seen[$image]=1
    for ((attempt=1; attempt<=attempts; attempt++)); do
      remaining=$((deadline - SECONDS))
      if ((remaining <= 0)); then
        echo "Image download budget exhausted (${total_timeout}s). Existing services were not changed." >&2
        return 1
      fi
      allowance=$attempt_timeout
      ((allowance <= remaining)) || allowance=$remaining
      printf 'Pulling %s (attempt %s/%s, timeout %ss)\n' "$image" "$attempt" "$attempts" "$allowance"
      # Terminate the client connection and allow Docker to cancel this pull.
      # The daemon and the currently running containers are never restarted.
      if "${pull_timeout[@]}" "${allowance}s" "${pull_docker[@]}" image pull "$image"; then
        break
      else
        result=$?
      fi
      case "$result" in
        130|143) return "$result" ;;
        124|137) echo "Image pull timed out: $image" >&2 ;;
        *) echo "Image pull failed (exit $result): $image" >&2 ;;
      esac
      if ((attempt == attempts)); then
        echo "Image download failed after $attempts attempts. Existing services were not changed." >&2
        return 1
      fi
      delay=$((retry_delay * attempt))
      remaining=$((deadline - SECONDS))
      ((delay <= remaining)) || delay=$remaining
      if ((delay > 0)); then
        echo "Retrying in ${delay}s..." >&2
        sleep "$delay"
      fi
    done
  done <<< "$listing"
  echo 'All deployment images are available locally.'
}
