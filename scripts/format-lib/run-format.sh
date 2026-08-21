#!/usr/bin/env sh
# shellcheck shell=sh
#
# scripts/format-lib/run-format.sh <check|fix> <prettier|markdownlint> <ext> [<ext> ...]
#
# Composes git-tracked-paths.sh's derivation with the per-tool wrapper, invoked
# ONCE from the repo root — the single pass that replaces the turbo-scoped,
# per-workspace `prettier:check`/`mdlint:check` (story #414). One derivation, two
# modes (check/fix), and both tools share this same composition, so a divergence
# between them is impossible by construction.
#
# Exit codes:
#   0 — no formatting violations
#   1 — violations found (or `pnpm format` applied fixes to at least one file)
#   2 — broken: derivation failed (missing git, empty set — see
#       git-tracked-paths.sh) or the formatter could not even be invoked
#
# `xargs` itself collapses any nonzero child exit into its OWN exit code, and the
# two implementations collapse differently: GNU xargs (Linux — CI, Claude Code
# Web) maps every 1-125 child exit to its OWN 123. BSD xargs (macOS's system
# xargs) does NOT propagate the child's exit code — verified empirically, a
# child exiting 1 and a child exiting 2 both make BSD xargs itself exit 1. So
# `123` (GNU) and `1` (BSD) both need to map to our `1`, and on BOTH platforms
# that mapping is imprecise, not just on macOS: on macOS, a wrapper that dies
# with its own "broken" exit (e.g. prettier's exit 2 on a parse error) is
# indistinguishable, through BSD xargs, from "violations found"; on GNU xargs,
# its OWN documented exit `1` ("some other error occurred" — distinct from the
# `123` child-violation case) collapses into the same `1 | 123)` arm below, so
# a genuine xargs-level failure on Linux/CI is also read as "violations found"
# rather than "broken". The derivation's own exit code (0/2, captured BEFORE
# xargs ever runs) is not affected by either case — only a failure that
# reaches xargs itself is.
set -eu

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
# shellcheck source=./git-tracked-paths.sh
. "$SCRIPT_DIR/git-tracked-paths.sh"

if [ $# -lt 2 ]; then
  echo "run-format: usage: run-format.sh <check|fix> <prettier|markdownlint> <ext> [<ext> ...]" >&2
  exit 2
fi

_rf_mode="$1"
_rf_tool="$2"
shift 2

case "$_rf_tool" in
  prettier) _rf_wrapper="$REPO_ROOT/tools/prettier-config/bin/prettier-$_rf_mode.sh" ;;
  markdownlint) _rf_wrapper="$REPO_ROOT/tools/markdownlint-config/bin/markdownlint-$_rf_mode.sh" ;;
  *)
    echo "run-format: unknown tool '$_rf_tool' (expected prettier or markdownlint)" >&2
    exit 2
    ;;
esac

_rf_list="$(mktemp "${TMPDIR:-/tmp}/run-format.XXXXXX")"

# Deliberately not `if ! git_tracked_paths ...; then` — `!` reports the NEGATED
# status, so `$?` inside that branch would always read 0 and the real failure
# code (2) would be lost. Testing the un-negated command keeps `$?` faithful in
# the `else` branch.
if git_tracked_paths "$@" >"$_rf_list"; then
  :
else
  _rf_status=$?
  rm -f "$_rf_list"
  exit "$_rf_status"
fi

set +e
xargs -0 -n 200 "$_rf_wrapper" <"$_rf_list"
_rf_xargs_status=$?
set -e
rm -f "$_rf_list"

case "$_rf_xargs_status" in
  0) exit 0 ;;
  # GNU xargs (Linux — CI, Claude Code Web) collapses any 1-125 child exit into its
  # OWN 123, but also returns its OWN 1 on an xargs-level "some other error" unrelated
  # to the child. BSD xargs (macOS's system xargs) returns 1 for ANY child failure — it
  # does not propagate the child's real exit code. Accepting both keeps "violations
  # found" (our 1) correct for the common case on both platforms; the known imprecision
  # this leaves on EACH platform (macOS: a wrapper's own "broken" exit also reads as our
  # 1; GNU: xargs's own internal-error 1 also reads as our 1) is documented in the
  # header above. The derivation's broken/empty-set branch above returns before xargs
  # ever runs, so it is unaffected either way.
  1 | 123) exit 1 ;;
  *) exit 2 ;;
esac
