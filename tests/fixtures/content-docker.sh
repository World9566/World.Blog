#!/usr/bin/env bash
# Docker boundary for content-deploy.test.ts. Git, worktrees, symlinks,
# journals, locks and the deployment entry point are real; only services are
# modeled so failures at precise transaction boundaries are deterministic.
set -euo pipefail
[[ ${1:-} == info ]] && exit 0
[[ ${1:-} == compose ]] || exit 2
selected=""
while (( $# )); do
  case "$1" in
    CONTENT_DIR=*) selected=${1#CONTENT_DIR=/content/}; selected=${selected%/posts} ;;
    ops) shift; break ;;
  esac
  shift
done
model="$TEST_ROOT/model"
releases="$TEST_ROOT/content/releases"
[[ -n "$selected" ]] || selected=$(readlink "$releases/current" 2>/dev/null || true)
fault=${TEST_FAULT:-}
case "$*" in
  'sh -c '*) exit 0 ;;
  'pnpm content:release-check')
    [[ "$fault" != validate && -d "$releases/$selected/posts" ]]
    ;;
  'pnpm search:prepare')
    n=$(cat "$model/count")
    n=$((n + 1))
    echo "$n" > "$model/count"
    printf -v index 'blog_articles_build_%016x' "$n"
    printf '%s' "$selected" > "$model/$index"
    echo "PREPARED $index"
    ;;
  'pnpm search:swap '*)
    index=$3
    test -f "$model/$index"
    mv "$model/live" "$model/swap"
    mv "$model/$index" "$model/live"
    mv "$model/swap" "$model/$index"
    # Simulate an acknowledged server-side swap whose client connection dies.
    [[ "$fault" != swap ]]
    ;;
  'pnpm search:discard '*) rm -f -- "$model/$3" ;;
  'pnpm search:sync')
    [[ "$fault" != recovery ]]
    printf '%s' "$selected" > "$model/live"
    ;;
  'pnpm content:check')
    # The old index must still exist at verification time.
    [[ -f "$model/blog_articles_build_$(printf '%016x' "$(cat "$model/count")")" ]]
    [[ "$fault" != live && "$fault" != recovery ]]
    [[ "$(cat "$model/live")" == "$selected" ]]
    ;;
  'node -e '*)
    if [[ "$fault" == refresh && ! -f "$model/refreshed" ]]; then
      touch "$model/refreshed"
      exit 1
    fi
    [[ -d "$releases/$selected/posts" ]]
    ;;
  *) echo "Unexpected test Docker command: $*" >&2; exit 2 ;;
esac
