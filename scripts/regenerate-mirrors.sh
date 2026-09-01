#!/usr/bin/env sh
# shellcheck shell=sh
#
# scripts/regenerate-mirrors.sh — realign the generated mirrors with the LOCAL dataset.
#
# This is the remedy the mirror-equality guards name (story #419). It is NOT
# `pair update`: that command resolves and installs the PUBLISHED knowledge base,
# so the fix would depend on what has been released rather than on what is in the
# working tree. Here the source is always `packages/knowledge-hub/dataset` of the
# repo you are standing in, and `--offline` makes the "no published version" part
# structural rather than a promise.
#
# A thin wrapper, deliberately: the regeneration itself is the CLI's existing
# local-source path (`pair update --source <dir>`), the same one the
# `source-resolution` smoke scenario exercises. No generation logic lives here.
#
# There is no check mode. The mirror-equality guards (`pnpm skills:conformance`)
# are the checker; this is the only writer.
#
# The two scopes are NOT symmetric, and pretending otherwise hides real drift: the
# guards check the DATASET-SOURCED mirrors (a file with no counterpart in
# `packages/knowledge-hub/dataset` is compared to nothing), while this command
# additionally rewrites skill references across the whole installed tree. Observed:
# commit 6655439d regenerated adr-021, adr-022, adr-023 and
# collaborative-workflow.context.md — four files that exist only in the target tree —
# after they had sat drifted on a green `main`. So in that region drift accumulates
# undetected until whichever run of this writer comes next, and lands there.
#
# Two roots, and they are not the same thing:
#   TOOLCHAIN_ROOT — where this script and the CLI that does the work live.
#   TARGET_ROOT    — the git working tree being realigned (derived from the cwd).
# They coincide in normal use. They differ under test, which is what makes the
# happy path exercisable against a throwaway fixture instead of the real repo —
# the same split `scripts/format-lib/run-format.sh` already uses.
#
# Consequence, and it is intended: the toolchain must be installed in the tree being
# realigned. A freshly created linked worktree (`git worktree add`, the shape pair's own
# automation uses) has no `node_modules/`, so this exits 1 with "run `pnpm install`
# first" — and `/pair-capability-publish-pr` HALTs on that before creating the PR. That
# tree cannot pass the quality gate one step later either, so the outcome is the same
# either way; refusing here just names the cause with the shorter message.
#
# Exit codes:
#   0 — the mirrors match the local dataset (regenerated, or already in sync)
#   1 — broken: no git working tree, no dataset, no toolchain, or the CLI failed.
#       Never a silent success over a no-op: if nothing could be written, this says so.
set -eu

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
TOOLCHAIN_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

if ! TARGET_ROOT="$(git rev-parse --show-toplevel 2>/dev/null)"; then
  echo "regenerate-mirrors: not inside a git working tree — \`git rev-parse --show-toplevel\`" >&2
  echo "  failed from $(pwd), so there is no repo whose mirrors could be realigned." >&2
  exit 1
fi

DATASET="$TARGET_ROOT/packages/knowledge-hub/dataset"
if [ ! -d "$DATASET" ]; then
  echo "regenerate-mirrors: no dataset at packages/knowledge-hub/dataset (looked in $DATASET)." >&2
  echo "  That directory IS the regeneration source; nothing was written." >&2
  exit 1
fi

TURBO="$TOOLCHAIN_ROOT/node_modules/.bin/turbo"
if [ ! -x "$TURBO" ]; then
  echo "regenerate-mirrors: $TURBO is missing — run \`pnpm install\` first." >&2
  exit 1
fi

# The CLI is TypeScript and its workspace dependency (`@pair/content-ops`) resolves to
# built output, so a compile is not optional — running a stale `dist/` would regenerate
# with yesterday's transform and produce a mirror the guards still reject. turbo caches
# it, so the cost is a cache hit on every run after the first.
BUILD_LOG="$(mktemp "${TMPDIR:-/tmp}/regenerate-mirrors.XXXXXX")" || {
  echo "regenerate-mirrors: cannot create a temporary file (checked TMPDIR=${TMPDIR:-/tmp})." >&2
  exit 1
}
# The explicit `rm`s below cover the paths this script controls; the trap covers the one
# it does not — Ctrl-C or a SIGTERM between `mktemp` and the `rm`, which would otherwise
# leak a file into TMPDIR on every interrupted run. It cannot cover the final `exec`
# (which replaces this process), which is why the success path still removes the log
# itself before reaching it.
trap 'rm -f "$BUILD_LOG"' EXIT HUP INT TERM
if ! (cd "$TOOLCHAIN_ROOT" && "$TURBO" run build --filter=@pair/pair-cli...) >"$BUILD_LOG" 2>&1; then
  cat "$BUILD_LOG" >&2
  rm -f "$BUILD_LOG"
  echo "regenerate-mirrors: could not build the pair CLI — nothing was regenerated." >&2
  exit 1
fi
rm -f "$BUILD_LOG"

CLI="$TOOLCHAIN_ROOT/apps/pair-cli/dist/cli.js"
if [ ! -f "$CLI" ]; then
  echo "regenerate-mirrors: the build reported success but $CLI does not exist." >&2
  exit 1
fi

# `INIT_CWD` is what the CLI reads as its install target, and it OUTRANKS both the
# positional target and the cwd. pnpm sets it to wherever the developer typed the
# command, which for `pnpm -w mirrors:regenerate` from a subdirectory is the
# subdirectory — so it is pinned here instead of inherited.
cd "$TARGET_ROOT"
export INIT_CWD="$TARGET_ROOT"
exec node "$CLI" update --source "$DATASET" --offline
