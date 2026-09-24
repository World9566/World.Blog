#!/usr/bin/env bash
set -Eeuo pipefail
[[ $# == 1 && "$1" =~ ^[a-f0-9]{40}$ ]] || { echo 'Usage: bash scripts/ops/deploy.sh <40-character commit SHA>' >&2; exit 1; }
target=$1
source "$(dirname -- "$0")/common.sh"
lock_operation
previous=""
[[ ! -f "$STATE_DIR/current-release" ]] || previous=$(cat "$STATE_DIR/current-release")
export BLOG_RELEASE=$target
dc config --quiet
if [[ "${BLOG_SKIP_PULL:-0}" != 1 ]]; then
  source "$ROOT/scripts/ops/pull-images.sh"
  pull_images
fi
for image in "$BLOG_IMAGE:$target" "$BLOG_IMAGE:$target-ops"; do
  image_revision=$("${DOCKER[@]}" image inspect "$image" --format '{{index .Config.Labels "org.opencontainers.image.revision"}}')
  [[ "$image_revision" == "$target" ]] || { echo "Image revision does not match requested release: $image" >&2; exit 1; }
done
dc run --rm --no-deps ops node scripts/ops/check-env.mjs
dc up -d --wait --wait-timeout 120 postgres meilisearch
before=$(schema_version)
failed() {
  trap - ERR
  echo 'Deployment failed. Any completed database backup is retained.' >&2
  dc stop gateway web || true
  # Only restore an old application automatically when no migration was attempted.
  # Failed/partial migrations also require an operator to inspect the database.
  if [[ -n "$previous" && "${migration_safe:-0}" == 1 ]]; then
    export BLOG_RELEASE=$previous
    dc run --rm --no-deps ops pnpm search:sync && dc up -d --no-deps --wait --wait-timeout 120 web && dc up -d --no-deps --force-recreate --wait gateway \
      && echo "Previous application release restored: $previous" >&2
  else
    echo 'Services remain stopped. Inspect migration state and restore or fix forward before restarting.' >&2
  fi
  exit 1
}
trap failed ERR
migration_safe=1
dc stop gateway web
backup=$(bash "$ROOT/scripts/ops/backup.sh")
printf 'Pre-deploy backup: %s\n' "$backup"
migration_safe=0
dc run --rm --no-deps ops pnpm db:deploy
after=$(schema_version)
[[ "$before" != "$after" ]] || migration_safe=1
# Ensure the article release the application expects is valid under this
# image: revalidate the live release, or bootstrap an empty one on a fresh
# server. Real content arrives from the content repository pipeline.
bash "$ROOT/scripts/ops/content-deploy.sh" --ensure
dc up -d --no-deps --wait --wait-timeout 120 web
dc up -d --no-deps --force-recreate --wait --wait-timeout 60 gateway
dc exec -T gateway wget -q -O /dev/null http://127.0.0.1:8080/api/health
printf '%s\n' "$target" > "$STATE_DIR/current-release.new"
mv -- "$STATE_DIR/current-release.new" "$STATE_DIR/current-release"
[[ -z "$previous" ]] || printf '%s\n' "$previous" > "$STATE_DIR/previous-release"
printf '%s\n' "$after" > "$STATE_DIR/current-schema"
echo "Deployed $target. Origin: http://127.0.0.1:${ORIGIN_PORT:-8080}"
