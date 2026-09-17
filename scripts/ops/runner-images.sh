#!/usr/bin/env bash
set -Eeuo pipefail
[[ $# == 2 && "$1" =~ ^(list|load)$ && "$2" =~ ^[a-f0-9]{40}$ ]] || {
  echo 'Usage: runner-images.sh list|load <40-character commit SHA>' >&2
  exit 1
}
action=$1
target=$2
source "$(dirname -- "$0")/common.sh"
export BLOG_RELEASE=$target

if [[ "$action" == load ]]; then
  # Docker accepts gzip on stdin; no registry login or proxy is needed here.
  "${DOCKER[@]}" image load
  exit
fi

# Export only image references and IDs, never the interpolated private config.
platform=$("${DOCKER[@]}" version --format '{{.Server.Os}}/{{.Server.Arch}}')
images=$(dc --profile tools config --images | sort -u)
printf 'platform\t%s\n' "$platform"
while IFS= read -r image; do
  id=$("${DOCKER[@]}" image inspect --format '{{.Id}}' "$image" 2>/dev/null) || id=missing
  printf '%s\t%s\n' "$image" "$id"
done <<< "$images"
