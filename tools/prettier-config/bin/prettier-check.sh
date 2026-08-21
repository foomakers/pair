#!/usr/bin/env sh
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PRETTIER_BIN="$SCRIPT_DIR/../node_modules/.bin/prettier"
# The hardcoded glob is the NO-ARGUMENT fallback only (story #414) — when a caller
# passes explicit paths (the git-derived, full-repo list from run-format.sh), the
# glob must not ALSO apply, or a passed-path invocation checks the whole workspace
# regardless of what was asked (verified during #414's refinement: passing paths
# changed nothing in the output before this fix). Captured before _ignore-args.sh
# runs, since that appends --ignore-path flags to "$@" and would make $# always > 0.
if [ $# -eq 0 ]; then
  _pc_glob="{**/*,*}.{ts,tsx,js,jsx,json,html}"
else
  _pc_glob=""
fi
# Ignore sources (shared .prettierignore + the repo's .gitignore files) are assembled
# once, in _ignore-args.sh, and appended to "$@" — see that file for the why (#394).
. "$SCRIPT_DIR/_ignore-args.sh"
if [ -n "$_pc_glob" ]; then
  "$PRETTIER_BIN" --list-different "$_pc_glob" --log-level log "$@"
else
  "$PRETTIER_BIN" --list-different --log-level log "$@"
fi
