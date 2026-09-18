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
  printf 'old=%s\nnew=%s\ntemp=%s\nswapped=%s\n' \
    "$(current_release)" "$1" "${2:-}" 0 > "$JOURNAL.new"
  mv -Tf -- "$JOURNAL.new" "$JOURNAL"
}
journal_update_swapped() {
  printf 'old=%s\nnew=%s\ntemp=%s\nswapped=1\n' \
    "$(journal_read old)" "$(journal_read new)" "${1:-}" > "$JOURNAL.new"
  mv -Tf -- "$JOURNAL.new" "$JOURNAL"
}

# A crash can leave a half-finished deploy. The current symlink tells us how
# far it got; recovery finishes or discards the interrupted transition before
# anything else touches the releases.
recover_interrupted() {
  [[ -f "$JOURNAL" ]] || return 0
  local old new temp swapped cur
  old=$(journal_read old)
  new=$(journal_read new)
  temp=$(journal_read temp)
  swapped=$(journal_read swapped)
  cur=$(current_release)
  echo "Recovering an interrupted content deploy (new=$new)." >&2
  if [[ "$cur" == "$new" && -n "$new" && "$swapped" == 0 && -n "$temp" ]]; then
    # The switch happened but the search swap did not; finish it.
    dc run --rm --no-deps ops pnpm search:swap "$temp"
    rm -f -- "$JOURNAL"
  else
    rm -f -- "$JOURNAL"
  fi
}

# Fetch the bundle piped to stdin into the object database. The first run
# initializes the repository from the bundle itself.
import_bundle() {
  local sha=$1 bundle
  bundle="$STATE/bundle.$$"
  cat > "$bundle"
  if [[ ! -d "$REPO" ]]; then
    git init --quiet "$REPO"
  fi
  if ! git -C "$REPO" fetch --quiet "$bundle" "$sha"; then
    rm -f -- "$bundle"
    echo "The transferred bundle does not contain $sha." >&2
    exit 1
  fi
  rm -f -- "$bundle"
}

# Releases are worktrees of the object database, so materialization is a
# checkout, not a copy. A directory without a valid marker is debris from an
# interrupted run and is removed before re-adding.
materialize() {
  local sha=$1 release
  release="$RELEASES/$sha"
  if release_ready "$release"; then
    cat > /dev/null
    echo "Reusing validated release $sha (app $BLOG_RELEASE)."
    return 0
  fi
  import_bundle "$sha"
  git -C "$REPO" worktree remove --force "$release" 2>/dev/null || rm -rf -- "$release"
  git -C "$REPO" worktree prune
  if ! git -C "$REPO" worktree add --quiet --detach "$release" "$sha"; then
    rm -rf -- "$release"
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
    git -C "$REPO" worktree remove --force "$release" 2>/dev/null || rm -rf -- "$release"
    echo 'Content release check failed. The live site was not touched.' >&2
    exit 1
  fi
  write_ready "$release"
}

prepare_search() {
  local sha=$1 output temp
  output=$(dc run --rm --no-deps -e "CONTENT_DIR=/content/$sha/posts" ops pnpm search:prepare)
  temp=$(printf '%s\n' "$output" | sed -n 's/^PREPARED //p' | tail -n1)
  if [[ ! "$temp" =~ ^blog_articles_build_[a-f0-9]{16}$ ]]; then
    echo "Search preparation did not report an index. Output: $output" >&2
    rm -rf -- "$RELEASES/$sha"
    exit 1
  fi
  index_name=$temp
}

switch_release() {
  local sha=$1 old
  old=$(current_release)
  if [[ "$old" == "$sha" ]]; then return 0; fi
  if [[ -n "$old" ]]; then
    ln -sfn -- "$old" "$RELEASES/previous.tmp.$$"
    mv -Tf -- "$RELEASES/previous.tmp.$$" "$RELEASES/previous"
  fi
  ln -sfn -- "$sha" "$RELEASES/current.tmp.$$"
  mv -Tf -- "$RELEASES/current.tmp.$$" "$RELEASES/current"
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

# Content and search move as one release. Swapping back the index restores the
# previous documents because they sit in the temporary index after the swap.
rollback_release() {
  local old new temp swapped
  old=$(journal_read old)
  new=$(journal_read new)
  temp=$(journal_read temp)
  swapped=$(journal_read swapped)
  rm -f -- "$JOURNAL"
  if [[ -n "$old" && -n "$new" && "$old" != "$new" ]]; then
    if [[ -n "$temp" && "$swapped" == 1 ]]; then
      dc run --rm --no-deps ops pnpm search:swap "$temp" || true
    fi
    switch_release "$old"
    refresh_web || true
    echo "Content rolled back to $old." >&2
  fi
}

record_state() {
  printf '%s\n' "$(current_release)" > "$STATE/current-content"
  printf '%s\n' "$(previous_release)" > "$STATE/previous-content"
  if [[ -f "$JOURNAL" ]]; then rm -f -- "$JOURNAL"; fi
}

prune_releases() {
  local keep_current keep_previous dir name
  keep_current=$(current_release)
  keep_previous=$(previous_release)
  local -a others=()
  for dir in "$RELEASES"/*/; do
    [[ -d "$dir" ]] || continue
    name=$(basename -- "$dir")
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
    git -C "$REPO" worktree remove --force "$d" 2>/dev/null || rm -rf -- "$d"
  done
  [[ -d "$REPO" ]] && git -C "$REPO" worktree prune
}

# Cache entries are keyed by application revision; superseded revisions can
# never be read again and are dropped. The cost of pruning too eagerly is a
# bounded recompile, so this runs on every content and application deploy.
prune_cache() {
  local dir name
  [[ -n "${CONTENT_CACHE_DIR:-}" && -d "$CONTENT_CACHE_DIR" ]] || return 0
  for dir in "$CONTENT_CACHE_DIR"/*/; do
    [[ -d "$dir" ]] || continue
    name=$(basename -- "$dir")
    [[ "$name" == "$BLOG_RELEASE" ]] || rm -rf -- "$dir"
  done
}

recover_interrupted

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
  prune_cache
  echo "Content release $target is valid under app $BLOG_RELEASE."
  exit 0
fi

sha=$1
materialize "$sha"
release_check "$sha"
prepare_search "$sha"

journal_write "$sha" "$index_name"
switch_release "$sha"
if ! refresh_web; then
  echo 'Web refresh failed. Rolling back the content switch.' >&2
  rollback_release
  exit 1
fi
swap_search
journal_update_swapped "$index_name"
if ! live_check "$sha"; then
  echo 'Live check failed. Rolling back content and search together.' >&2
  rollback_release
  exit 1
fi
record_state
prune_releases
prune_cache
echo "Content deployed: $sha (app $BLOG_RELEASE, index $index_name)."
