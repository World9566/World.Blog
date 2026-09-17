#!/usr/bin/env bash
set -Eeuo pipefail
cd "$(dirname -- "$0")/../.."
[[ "${DEPLOY_HOST:-}" =~ ^[a-zA-Z0-9][a-zA-Z0-9.-]*$ ]]
[[ "${DEPLOY_USER:-}" =~ ^[a-z_][a-z0-9_-]*$ ]]
[[ "${GITHUB_SHA:-}" =~ ^[a-f0-9]{40}$ ]]
[[ "${PUBLISHED_IMAGE:-}" =~ ^ghcr.io/[a-z0-9][a-z0-9./_-]*$ ]]
[[ -n "${DEPLOY_SSH_KEY:-}" && -n "${DEPLOY_KNOWN_HOSTS:-}" ]]
umask 077
temporary=$(mktemp -d "${RUNNER_TEMP:-${TMPDIR:-/tmp}}/blog-deploy.XXXXXX")
cleanup() {
  rm -f -- "$temporary/key" "$temporary/hosts" "$temporary/before" \
    "$temporary/after" "$temporary/expected" "$temporary/actual"
  rmdir -- "$temporary"
}
trap cleanup EXIT
printf '%s\n' "$DEPLOY_SSH_KEY" | tr -d '\r' > "$temporary/key"
printf '%s\n' "$DEPLOY_KNOWN_HOSTS" | tr -d '\r' > "$temporary/hosts"
unset DEPLOY_SSH_KEY DEPLOY_KNOWN_HOSTS
if ! ssh-keygen -y -P '' -f "$temporary/key" >/dev/null 2>&1; then
  echo 'DEPLOY_SSH_KEY must contain a complete, unencrypted OpenSSH-compatible private key.' >&2
  exit 1
fi
ssh_options=(-T -i "$temporary/key" -o BatchMode=yes -o IdentitiesOnly=yes
  -o StrictHostKeyChecking=yes -o "UserKnownHostsFile=$temporary/hosts"
  -o ConnectTimeout=15 -o ServerAliveInterval=15 -o ServerAliveCountMax=6)
remote() { ssh "${ssh_options[@]}" "$DEPLOY_USER@$DEPLOY_HOST" "$@"; }
remote_root='cd ~/apps/world-blog'

# git archive excludes ignored credentials, backups and build output.
git archive "$GITHUB_SHA" | remote "set -eu; mkdir -p ~/apps/world-blog; $remote_root; tar -xf -"
remote "$remote_root && bash scripts/ops/runner-images.sh list '$GITHUB_SHA'" < /dev/null > "$temporary/before"
IFS=$'\t' read -r marker platform < "$temporary/before"
[[ "$marker" == platform && "$platform" == linux/amd64 ]] || {
  echo 'This workflow publishes linux/amd64 images; the deployment host must match.' >&2
  exit 1
}
image_names=$(cut -f 1 "$temporary/before")
for image in "$PUBLISHED_IMAGE:$GITHUB_SHA" "$PUBLISHED_IMAGE:$GITHUB_SHA-ops"; do
  grep -Fxq "$image" <<< "$image_names" || {
    echo 'Server BLOG_IMAGE does not match the published application repository.' >&2
    exit 1
  }
done
transfer=()
: > "$temporary/expected"
while IFS=$'\t' read -r image cached_id extra; do
  [[ "$image" != platform ]] || continue
  [[ "$image" =~ ^[a-z0-9][a-zA-Z0-9._/:@-]*$ && -z "$extra" ]]
  [[ "$cached_id" == missing || "$cached_id" =~ ^sha256:[a-f0-9]{64}$ ]]
  echo "Pulling on the runner: $image"
  docker pull --platform "$platform" "$image"
  id=$(docker image inspect --format '{{.Id}}' "$image")
  [[ "$id" =~ ^sha256:[a-f0-9]{64}$ ]]
  [[ "$(docker image inspect --format '{{.Os}}/{{.Architecture}}' "$image")" == "$platform" ]]
  printf '%s\t%s\n' "$image" "$id" >> "$temporary/expected"
  if [[ "$id" != "$cached_id" ]]; then
    transfer+=("$image")
  else
    echo "Already present on the server: $image"
  fi
done < "$temporary/before"

if [[ ${#transfer[@]} -gt 0 ]]; then
  echo "Streaming ${#transfer[@]} images over SSH. The server will not pull from a registry."
  docker image save "${transfer[@]}" | gzip -1 | \
    remote "$remote_root && bash scripts/ops/runner-images.sh load '$GITHUB_SHA'"
fi
# Verify the actual imported images before starting backup, migration or downtime.
remote "$remote_root && bash scripts/ops/runner-images.sh list '$GITHUB_SHA'" < /dev/null > "$temporary/after"
tail -n +2 "$temporary/after" | sort > "$temporary/actual"
sort -o "$temporary/expected" "$temporary/expected"
diff -u "$temporary/expected" "$temporary/actual"
echo 'Server image IDs verified. Starting deployment with registry pulls disabled.'
remote "$remote_root && BLOG_SKIP_PULL=1 bash scripts/ops/deploy.sh '$GITHUB_SHA'" < /dev/null
