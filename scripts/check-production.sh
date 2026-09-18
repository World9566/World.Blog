#!/usr/bin/env bash
set -Eeuo pipefail
export PATH="/usr/bin:/bin:$PATH"
ROOT=$(cd -- "$(dirname -- "$0")/.." && pwd)
cd "$ROOT"
mkdir -p tmp
umask 077
export BLOG_ENV_FILE
BLOG_ENV_FILE=$(mktemp "$ROOT/tmp/production-check.XXXXXX.env")
project="world-blog-ci-$$-$RANDOM"
revision=${GITHUB_SHA:-0000000000000000000000000000000000000001}
[[ "$revision" =~ ^[a-f0-9]{40}$ ]] || exit 1
{
  printf 'COMPOSE_PROJECT_NAME=%s\nSITE_URL=https://blog.example.invalid\nSITE_HOST=blog.example.invalid\nORIGIN_PORT=18081\nBLOG_IMAGE=%s\nBLOG_RELEASE=%s\n' "$project" "$project" "$revision"
  printf 'POSTGRES_USER=blog\nPOSTGRES_DB=blog\nPOSTGRES_PASSWORD=%s\nMEILI_MASTER_KEY=%s\nBETTER_AUTH_SECRET=%s\nGITHUB_CLIENT_ID=rehearsal\nGITHUB_CLIENT_SECRET=rehearsal\n' "$(openssl rand -hex 32)" "$(openssl rand -hex 32)" "$(openssl rand -hex 32)"
  # A Windows checkout needs the drive-letter form for compose bind mounts.
  content_root="$ROOT/tmp/content-$project"
  command -v cygpath >/dev/null && content_root=$(cygpath -m "$content_root")
  printf 'CONTENT_ROOT=%s\nCONTENT_REFRESH_TOKEN=%s\n' "$content_root" "$(openssl rand -hex 32)"
} > "$BLOG_ENV_FILE"
content_repo=""
source scripts/ops/common.sh
cleanup() {
  result=$?
  trap - EXIT
  # Only the unique project created by this run may have its volumes removed.
  if [[ "$COMPOSE_PROJECT_NAME" == "$project" && "$project" == world-blog-ci-* ]]; then
    # Cache entries belong to the container user; clear them through the
    # maintenance container while it can still start, then tear the project
    # down. Cleanup must never mask the real outcome, so all of it stays
    # best effort.
    dc run --rm --no-deps ops sh -c 'cd /app/.content-cache 2>/dev/null && rm -rf -- ./*' || true
    dc down --volumes --remove-orphans || true
    rm -f -- "$BLOG_ENV_FILE" || true
    rm -rf -- "$ROOT/tmp/content-$project" "$content_repo" || true
  fi
  exit "$result"
}
trap cleanup EXIT
# A sudo-based deployment loses shell variables. Both deploy and rollback must
# still select the requested images instead of the version in the private file.
(
  DOCKER=(env -u BLOG_RELEASE -u COMPOSE_PROJECT_NAME "${DOCKER[@]}")
  for selected in 1111111111111111111111111111111111111111 2222222222222222222222222222222222222222; do
    export BLOG_RELEASE=$selected
    images=$(dc --profile tools config --images)
    printf '%s\n' "$images" | grep -Fxq "$BLOG_IMAGE:$selected"
    printf '%s\n' "$images" | grep -Fxq "$BLOG_IMAGE:$selected-ops"
  done
  if dc config --invalid-compose-check >/dev/null 2>&1; then
    echo 'Compose failure was not propagated.' >&2
    exit 1
  fi
  leftovers=("$STATE_DIR"/compose-release.*.env)
  [[ ! -e "${leftovers[0]}" ]]
)
echo 'Compose release selection survives cleared environment; failure cleanup passed.'
"${DOCKER[@]}" build --target runner --build-arg SITE_URL="$SITE_URL" --build-arg REVISION="$revision" --tag "$BLOG_IMAGE:$revision" "$(host_path "$ROOT")"
"${DOCKER[@]}" build --target ops --build-arg SITE_URL="$SITE_URL" --build-arg REVISION="$revision" --tag "$BLOG_IMAGE:$revision-ops" "$(host_path "$ROOT")"
dc pull postgres meilisearch gateway
BLOG_SKIP_PULL=1 bash scripts/ops/deploy.sh "$revision"
dc run -T --rm --no-deps ops node --input-type=module < scripts/check-production.mjs
dc run --rm --no-deps -e CHECK_BASE_URL=http://gateway:8080 ops pnpm content:check

# Publish one article through the bundle pipeline: a throwaway repository
# stands in for the content repository, its object database travels as a git
# bundle over stdin, and the release materializes as a worktree checkout.
# This is the exact path the content repository workflow uses in production.
content_repo=$(mktemp -d "$ROOT/tmp/content-repo.XXXXXX")
git init --quiet "$content_repo"
mkdir -- "$content_repo/posts"
printf -- '%s
'   '---'   'id: "post_bundle_check"'   'slug: "bundle-check"'   'title: "Bundle release check"'   'description: "Verifies the worktree delivery path."'   'publishedAt: "2026-01-01"'   'topic: "engineering"'   'tags: ["Test"]'   'cover: "layers"'   'draft: false'   '---'   ''   '## Published through a bundle'   ''   'This release was materialized by git worktree.'   > "$content_repo/posts/bundle-check.mdx"
git -C "$content_repo" add posts
git -C "$content_repo" -c user.name=ci -c user.email=ci@example.invalid commit --quiet -m "content: bundle check"
content_sha=$(git -C "$content_repo" rev-parse HEAD)
git -C "$content_repo" bundle create "$ROOT/tmp/content.bundle" HEAD >/dev/null
bash scripts/ops/content-deploy.sh "$content_sha" < "$ROOT/tmp/content.bundle"
rm -f -- "$ROOT/tmp/content.bundle"
[[ "$(readlink "$CONTENT_RELEASES_DIR/current")" == "$content_sha" ]]
[[ -f "$CONTENT_RELEASES_DIR/$content_sha/posts/bundle-check.mdx" ]]
dc run --rm --no-deps -e CHECK_BASE_URL=http://gateway:8080 -e "CONTENT_DIR=/content/$content_sha/posts" ops pnpm content:check
echo 'Content bundle delivery and worktree release checks passed.'
sql "CREATE TABLE recovery_probe (id integer PRIMARY KEY, value text NOT NULL); INSERT INTO recovery_probe VALUES (1, 'backup-roundtrip');"
backup=$(bash scripts/ops/backup.sh)
cmp -s "$ENV_FILE" "$backup.env"
bash scripts/ops/restore.sh "$backup" --into blog_recovery_check
restored=$(dc exec -T postgres psql -U blog -d blog_recovery_check -Atc 'SELECT value FROM recovery_probe WHERE id=1;')
[[ "$restored" == backup-roundtrip ]]
[[ "$(sql 'SELECT value FROM recovery_probe WHERE id=1;')" == backup-roundtrip ]]
if bash scripts/ops/restore.sh "$backup" --into blog_recovery_check; then echo 'Existing database guard failed' >&2; exit 1; fi
echo 'Production deployment, HTTP and backup recovery checks passed. Test backups are retained under the unique project name.'
