#!/usr/bin/env sh
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PRETTIER_BIN="$SCRIPT_DIR/../node_modules/.bin/prettier"
# The hardcoded glob is the NO-ARGUMENT fallback only (story #414) — same reasoning
# as prettier-check.sh; captured before _ignore-args.sh appends to "$@".
if [ $# -eq 0 ]; then
  _pc_glob="{**/*,*}.{ts,tsx,js,jsx,json,html}"
else
  _pc_glob=""
fi
# Same ignore sources as prettier-check.sh, from the same file — check and fix MUST
# see the same file set, or the gate reports a file the formatter refuses to touch (#394).
. "$SCRIPT_DIR/_ignore-args.sh"
if [ -n "$_pc_glob" ]; then
  "$PRETTIER_BIN" "$_pc_glob" --write --log-level log "$@"
else
  "$PRETTIER_BIN" --write --log-level log "$@"
fi
