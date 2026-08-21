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
# `xargs` itself collapses any nonzero child exit into its OWN exit code, and GNU and BSD
# collapse differently (GNU maps every 1-125 child exit to its OWN 123; BSD maps ALL of
# them, including a wrapper's own "broken" exit like prettier's 2, to its OWN 1) — trusting
# xargs's own exit code was tried and found to LOSE the violations-vs-broken distinction on
# whichever platform's xargs you were not testing against (see git history on this file).
# So this script does not trust it: each invocation's REAL exit code is captured by the
# wrapped command itself (below) and recorded to `$_rf_codes`, xargs is always told the
# batch succeeded (so its own collapsing never runs), and the verdict is computed afterward
# from the recorded codes — identical on every platform because it never asks xargs to
# report anything.
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

# Explicitly guarded rather than left to `set -e`: an unguarded failed `mktemp` still aborts the
# script (that part `set -e` does catch), but with MKTEMP'S OWN exit status (typically 1) — and
# this script's documented contract reserves 1 for "violations found (or `pnpm format` applied
# fixes)", 2 for "broken". A full or read-only $TMPDIR would then report "run `pnpm format`" for
# an environment problem `pnpm format` cannot touch — the exact violations-vs-broken conflation
# the rest of this script exists to keep apart.
_rf_list="$(mktemp "${TMPDIR:-/tmp}/run-format.XXXXXX")" || {
  echo "run-format: cannot create a temporary file (checked TMPDIR=${TMPDIR:-/tmp})" >&2
  exit 2
}
_rf_codes="$(mktemp "${TMPDIR:-/tmp}/run-format-codes.XXXXXX")" || {
  echo "run-format: cannot create a temporary file (checked TMPDIR=${TMPDIR:-/tmp})" >&2
  rm -f "$_rf_list"
  exit 2
}

# Deliberately not `if ! git_tracked_paths ...; then` — `!` reports the NEGATED
# status, so `$?` inside that branch would always read 0 and the real failure
# code (2) would be lost. Testing the un-negated command keeps `$?` faithful in
# the `else` branch.
if git_tracked_paths "$@" >"$_rf_list"; then
  :
else
  _rf_status=$?
  rm -f "$_rf_list" "$_rf_codes"
  exit "$_rf_status"
fi

set +e
# `sh -c '…' _ "$@"` puts the real wrapper's REAL exit code in `$s`, appends it to
# `$RF_CODES` only when nonzero, then exits 0 unconditionally — so xargs's own exit
# code is always 0/1 for its OWN reasons (a missing binary, a signal), never for a
# collapsed child status, on either GNU or BSD. `RF_WRAPPER`/`RF_CODES` are exported
# rather than string-interpolated into the script text, so a path containing a quote
# or a `$` cannot break the embedded command.
export RF_WRAPPER="$_rf_wrapper"
export RF_CODES="$_rf_codes"
xargs -0 -n 200 sh -c '
  "$RF_WRAPPER" "$@"
  s=$?
  [ "$s" -eq 0 ] || echo "$s" >>"$RF_CODES"
  exit 0
' _ <"$_rf_list"
_rf_xargs_status=$?
set -e
rm -f "$_rf_list"

if [ "$_rf_xargs_status" -ne 0 ]; then
  # xargs itself failed for a reason that has nothing to do with any formatter
  # invocation's own exit code (a signal, `sh` not found, an arg-list-too-long the
  # `-n 200` batching did not prevent) — always broken, never "violations found".
  rm -f "$_rf_codes"
  exit 2
fi

if [ ! -s "$_rf_codes" ]; then
  rm -f "$_rf_codes"
  exit 0
fi

# The worst recorded code across every invocation wins: exactly 1 everywhere means
# "violations found (or `pnpm format` fixed some)"; anything higher anywhere means a
# wrapper died on its own terms (e.g. prettier's 2 on a parse error) and the verdict
# must say "broken", not "run `pnpm format`" — the exact distinction the ADL
# `2026-07-31-pre-push-gate-is-check-only.md` says this split exists to preserve, on
# BOTH platforms, since neither xargs implementation's own exit code is consulted here.
_rf_worst="$(sort -rn "$_rf_codes" | head -n 1)"
rm -f "$_rf_codes"
if [ "$_rf_worst" -eq 1 ]; then
  exit 1
else
  exit 2
fi
