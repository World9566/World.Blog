#!/usr/bin/env bash
set -Eeuo pipefail
source "$(dirname -- "$0")/common.sh"
lock_operation
[[ -f "$STATE_DIR/previous-release" ]] || { echo 'No previous release is recorded.' >&2; exit 1; }
target=$(cat "$STATE_DIR/previous-release")
previous=$BLOG_RELEASE
[[ "$target" =~ ^[a-f0-9]{40}$ ]] || exit 1
# Compare the actual database to the migrations packaged with the old image.
export BLOG_RELEASE=$target
dc run --rm --no-deps ops node scripts/ops/check-env.mjs
expected=$(dc run --rm --no-deps ops node scripts/ops/migration-count.mjs)
actual=$(schema_version)
[[ "$expected" == "$actual" ]] || { echo 'Database migrations differ from the previous image. Automatic rollback is blocked; use the recovery guide.' >&2; exit 1; }
# The live content release was validated by the newer application image;
# revalidate it under the rolled-back image before continuing.
bash scripts/ops/content-deploy.sh --validate-current
dc stop gateway web
dc run --rm --no-deps ops pnpm search:sync
dc up -d --no-deps --wait --wait-timeout 120 web
dc up -d --no-deps --force-recreate --wait gateway
printf '%s\n' "$target" > "$STATE_DIR/current-release"
printf '%s\n' "$previous" > "$STATE_DIR/previous-release"
echo "Application rolled back to $target. Database data was preserved."
