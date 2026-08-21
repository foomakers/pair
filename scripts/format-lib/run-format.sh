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
# `xargs` itself collapses any invocation exit of 1-125 into its OWN exit 123 —
# conflating "violations found" with a great many unrelated failures. The
# derivation's own exit code (0/2) is captured BEFORE xargs ever runs, so that
# distinction survives intact; only 123 (from a batch reporting differences) maps
# to our 1, everything else xargs can return maps to our 2.
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
  123) exit 1 ;;
  *) exit 2 ;;
esac
