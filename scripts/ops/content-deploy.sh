#!/usr/bin/env bash
set -Eeuo pipefail
# Publishes articles without rebuilding the application image. Articles live
# in their own repository; a release is a git worktree of that repository
# checked out under CONTENT_ROOT/releases/<sha>, gated by a full
# validation+compile check, then switched live with an atomic symlink swap.
# The object database travels as a git bundle piped to this script over SSH,
# so the server never talks to GitHub. The symlinks are the source of truth;
# state files are audit.
#
# Usage:
#   content-deploy.sh <sha>       full deploy; the bundle arrives on stdin
#   content-deploy.sh --ensure    app deploy support: revalidate the live
#                                 release, or bootstrap an empty one
command -v git >/dev/null || { echo 'git is required on the host.' >&2; exit 1; }
ensure_mode=0
if [[ ${1:-} == --ensure ]]; then
  ensure_mode=1
  shift
else
  [[ ${1:-} =~ ^[a-f0-9]{40}$ ]] || { echo 'Usage: content-deploy.sh <40-character content SHA> | --ensure' >&2; exit 1; }
  [[ ${2:-} == "" ]] || { echo 'Unknown option.' >&2; exit 1; }
fi
source "$(dirname -- "${BASH_SOURCE[0]}")/common.sh"
[[ -n "$CONTENT_RELEASES_DIR" && -n "$CONTENT_STATE_DIR" ]] || { echo 'CONTENT_ROOT is required in .env.production.' >&2; exit 1; }
# deploy.sh and rollback.sh hold the operation lock while calling this script.
if [[ "${BLOG_OPERATION_LOCK_HELD:-0}" != 1 ]]; then lock_operation; fi
RELEASES=$CONTENT_RELEASES_DIR
STATE=$CONTENT_STATE_DIR
REPO="$CONTENT_ROOT/repo"
JOURNAL="$STATE/in-progress"
rm -f -- "$STATE"/bundle.* 2>/dev/null || true
index_name=''
bundle_file="$STATE/bundle.$$"
if [[ "$ensure_mode" == 0 ]]; then
  # Consume the transferred bundle before anything else: container commands
  # in this script share the stdin descriptor, and the first docker compose
  # run would otherwise advance it and starve the import below.
  cat > "$bundle_file"
fi

# The revision directory is created through the maintenance container so it
# is owned by the container user (uid 1000): web and ops share that uid and
# can write entries, while no other account - including the deployment user -
# can create or replace anything inside. A planted directory that is not
# owned by that uid would make the application read attacker-controlled code,
# so the deploy aborts loudly instead.
ensure_cache_revision() {
  [[ -n "$CONTENT_CACHE_DIR" ]] || return 0
  # Create and verify inside the container: bind-mount translation layers
  # (WSL/drvfs) can distort host-side ownership views, while the in-container
  # view is the one the application actually reads with.
  dc run --rm --no-deps ops sh -c '
    mkdir -p -- "/app/.content-cache/$APP_REVISION" || exit 1
    owner=$(stat -c %u -- "/app/.content-cache/$APP_REVISION")
    if [ "$owner" != "1000" ]; then
      echo "Cache revision directory is owned by uid $owner instead of the container user; refusing to publish." >&2
      exit 1
    fi
  '
}

release_ready() {
  local release=$1 marker
  [[ -f "$release/.release-ready" ]] || return 1
  marker=$(sed -n 's/^app=//p' "$release/.release-ready")
  [[ "$marker" == "$BLOG_RELEASE" ]]
}

write_ready() {
  local release=$1
  printf 'app=%s\ndate=%s\n' "$BLOG_RELEASE" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$release/.release-ready.new"
  mv -Tf -- "$release/.release-ready.new" "$release/.release-ready"
}

current_release() { readlink "$RELEASES/current" 2>/dev/null || true; }
previous_release() { readlink "$RELEASES/previous" 2>/dev/null || true; }

journal_read() { sed -n "s/^$1=//p" "$JOURNAL" 2>/dev/null | tail -n1; }
journal_write() {
  printf 'old=%s\nnew=%s\ntemp=%s\n' \
    "$(current_release)" "$1" "${2:-}" > "$JOURNAL.new"
  mv -Tf -- "$JOURNAL.new" "$JOURNAL"
}

# A swap may complete just before the process dies. Repeating that swap would
# reverse it, so recover by rebuilding the known previous release instead.
recover_interrupted() {
  [[ -f "$JOURNAL" ]] || return 0
  echo 'Recovering an interrupted content deploy.' >&2
  rollback_release
}

# All destructive release operations go through this guard. Never follow a
# release alias or remove a directory still referenced by current/previous.
remove_release() {
  local sha=$1 release
  [[ "$sha" =~ ^[a-f0-9]{40}$ ]] || return 1
  release="$RELEASES/$sha"
  [[ ! -L "$release" && "$sha" != "$(current_release)" && "$sha" != "$(previous_release)" ]] || {
    echo "Refusing to remove a protected content release: $sha" >&2
    return 1
  }
  git -C "$REPO" worktree remove --force "$release" 2>/dev/null || rm -rf -- "$release"
}

# Import the saved bundle into the object database. The first run
# initializes the repository from the bundle itself.
import_bundle() {
  local sha=$1
  if [[ ! -d "$REPO" ]]; then
    git init --quiet "$REPO"
  fi
  if ! git -C "$REPO" fetch --quiet "$bundle_file" "$sha"; then
    rm -f -- "$bundle_file"
    echo "The transferred bundle does not contain $sha." >&2
    exit 1
  fi
  rm -f -- "$bundle_file"
}

# Releases are worktrees of the object database, so materialization is a
# checkout, not a copy. Existing worktrees are revalidated in place; only
# unprotected debris is removed before re-adding.
materialize() {
  local sha=$1 release
  release="$RELEASES/$sha"
  if release_ready "$release"; then
    rm -f -- "$bundle_file"
    echo "Reusing validated release $sha (app $BLOG_RELEASE)."
    return 0
  fi
  import_bundle "$sha"
  # An application revision invalidates the validation marker, not the
  # immutable worktree. Revalidate it in place, including when it is live.
  if [[ -d "$release" && ! -L "$release" && "$(git -C "$release" rev-parse HEAD 2>/dev/null)" == "$sha" ]]; then
    return 0
  fi
  remove_release "$sha"
  git -C "$REPO" worktree prune
  if ! git -C "$REPO" worktree add --quiet --detach "$release" "$sha"; then
    remove_release "$sha"
    echo "Worktree checkout failed for $sha." >&2
    exit 1
  fi
  # Worktree files carry the deploying user's ownership and modes; the
  # containers read releases as uid 1000 (node), so publish read access.
  chmod -R a+rX -- "$release"
}

release_check() {
  local sha=$1 release
  release="$RELEASES/$sha"
  if release_ready "$release"; then return 0; fi
  echo "Validating release $sha with the running application image..." >&2
  if ! dc run --rm --no-deps -e "CONTENT_DIR=/content/$sha/posts" ops pnpm content:release-check; then
    echo 'Content release check failed. Existing release directories were preserved.' >&2
    return 1
  fi
  write_ready "$release"
}

prepare_search() {
  local sha=$1 output temp
  output=$(dc run --rm --no-deps -e "CONTENT_DIR=/content/$sha/posts" ops pnpm search:prepare)
  temp=$(printf '%s\n' "$output" | sed -n 's/^PREPARED //p' | tail -n1)
  if [[ ! "$temp" =~ ^blog_articles_build_[a-f0-9]{16}$ ]]; then
    echo "Search preparation did not report an index. Output: $output" >&2
    return 1
  fi
  index_name=$temp
}

switch_release() {
  local sha=$1 old
  old=$(current_release)
  if [[ "$old" == "$sha" ]]; then return 0; fi
  if [[ -n "$old" ]]; then
    ln -sfn -- "$old" "$RELEASES/previous.tmp.$$" || return 1
    mv -Tf -- "$RELEASES/previous.tmp.$$" "$RELEASES/previous" || return 1
  fi
  ln -sfn -- "$sha" "$RELEASES/current.tmp.$$" || return 1
  mv -Tf -- "$RELEASES/current.tmp.$$" "$RELEASES/current" || return 1
}

refresh_web() {
  dc run --rm --no-deps ops node -e '
    const token = process.env.CONTENT_REFRESH_TOKEN;
    fetch("http://web:3000/api/content/refresh", {
      method: "POST",
      headers: { authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(120000),
    }).then(async (response) => {
      if (!response.ok)
        throw new Error(`refresh HTTP ${response.status}: ${await response.text()}`);
    }).catch((error) => {
      console.error(error.message);
      process.exit(1);
    });
  '
}

swap_search() {
  dc run --rm --no-deps ops pnpm search:swap "$index_name"
}

live_check() {
  local sha=$1
  dc run --rm --no-deps \
    -e "CHECK_BASE_URL=http://web:3000" \
    -e "CONTENT_DIR=/content/$sha/posts" \
    ops pnpm content:check
}

# Rebuilding from the previous worktree is idempotent even if the search swap
# completed before a connection failure. Keep the journal until both the site
# and index are restored; an interrupted recovery can safely run again.
rollback_release() {
  local old temp
  old=$(journal_read old)
  temp=$(journal_read temp)
  [[ "$old" == empty || "$old" =~ ^[a-f0-9]{40}$ ]] || {
    echo 'Recovery requires a valid previous content release; journal retained.' >&2
    return 1
  }
  [[ -d "$RELEASES/$old/posts" ]] || return 1
  switch_release "$old" || return 1
  # During an application deploy the web container is deliberately stopped.
  if [[ "$ensure_mode" == 0 ]]; then refresh_web || return 1; fi
  dc run --rm --no-deps -e "CONTENT_DIR=/content/$old/posts" ops pnpm search:sync || return 1
  record_state || return 1
  discard_search "$temp"
  echo "Content and search restored to $old." >&2
}

discard_search() {
  local temp=$1
  [[ -n "$temp" ]] || return 0
  # Cleanup cannot invalidate a completed publish or recovery. Old build
  # indexes are also collected by search:prepare on later runs.
  dc run --rm --no-deps ops pnpm search:discard "$temp" ||
    echo "Search cleanup deferred for $temp." >&2
}

publication_failed() {
  local result=$?
  trap - ERR
  echo 'Content publication failed; restoring the previous release.' >&2
  if ! rollback_release; then
    echo 'Recovery is incomplete. The journal is retained for the next operation.' >&2
  fi
  exit "$result"
}

record_state() {
  printf '%s\n' "$(current_release)" > "$STATE/current-content" || return 1
  printf '%s\n' "$(previous_release)" > "$STATE/previous-content" || return 1
  if [[ -f "$JOURNAL" ]]; then rm -f -- "$JOURNAL"; fi
}

prune_releases() {
  local keep_current keep_previous dir name
  keep_current=$(current_release)
  keep_previous=$(previous_release)
  local -a others=()
  for dir in "$RELEASES"/*; do
    [[ -d "$dir" && ! -L "$dir" ]] || continue
    name=$(basename -- "$dir")
    [[ "$name" =~ ^[a-f0-9]{40}$ ]] || continue
    if [[ "$name" != "$keep_current" && "$name" != "$keep_previous" ]]; then
      others+=("$dir")
    fi
  done
  (( ${#others[@]} <= 3 )) && return 0
  local -a sorted=()
  while IFS= read -r d; do sorted+=("$d"); done < <(
    for d in "${others[@]}"; do
      printf '%s %s\n' "$(stat -c %Y -- "$d")" "$d"
    done | sort -rn | cut -d' ' -f2-
  )
  for d in "${sorted[@]:3}"; do
    remove_release "$(basename -- "$d")"
  done
  [[ -d "$REPO" ]] && git -C "$REPO" worktree prune
}

# Cache entries are keyed by application revision; superseded revisions can
# never be read again and are dropped. The cost of pruning too eagerly is a
# bounded recompile, so this runs on every content and application deploy.
# Entries and revision directories belong to the container user (uid 1000),
# so pruning runs through the maintenance container with that ownership; the
# deployment user cannot remove them and must never need to.
prune_cache() {
  [[ -n "${CONTENT_CACHE_DIR:-}" ]] || return 0
  dc run --rm --no-deps ops sh -c '
    cd /app/.content-cache 2>/dev/null || exit 0
    for revision in */; do
      # A revision directory planted by another uid cannot be emptied by the
      # container user; it is inert (the ownership guard rejects the current
      # revision) and root has to remove the debris.
      [ "$revision" = "$APP_REVISION/" ] || rm -rf -- "$revision" 2>/dev/null || true
    done
    exit 0
  '
}

recover_interrupted
ensure_cache_revision

if [[ "$ensure_mode" == 1 ]]; then
  target=$(current_release)
  if [[ -z "$target" || "$target" == "empty" ]]; then
    # First application deploy on a fresh server: publish an empty release so
    # the site is healthy before the content repository delivers articles.
    if [[ ! -d "$RELEASES/empty/posts" ]]; then
      mkdir -p -- "$RELEASES/empty/posts"
      chmod -R a+rX -- "$RELEASES/empty"
    fi
    write_ready "$RELEASES/empty"
    switch_release empty
    # A fresh stack has no search index; create an empty one so checks that
    # expect the index have it.
    dc run --rm --no-deps ops pnpm search:sync
    record_state
    echo 'No content release found; an empty release was published.'
    exit 0
  fi
  release_check "$target"
  # Rebuild with this image's search schema, including scheduled articles.
  dc run --rm --no-deps ops pnpm search:sync
  prune_cache
  echo "Content release $target is valid under app $BLOG_RELEASE."
  exit 0
fi

sha=$1
materialize "$sha"
release_check "$sha"
prepare_search "$sha"

journal_write "$sha" "$index_name"
trap publication_failed ERR
switch_release "$sha"
refresh_web
swap_search
live_check "$sha"
record_state
trap - ERR
discard_search "$index_name"
prune_releases
prune_cache
echo "Content deployed: $sha (app $BLOG_RELEASE, index $index_name)."
