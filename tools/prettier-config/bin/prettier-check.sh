#!/usr/bin/env sh
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PRETTIER_BIN="$SCRIPT_DIR/../node_modules/.bin/prettier"
# Ignore sources (shared .prettierignore + the repo's .gitignore files) are assembled
# once, in _ignore-args.sh, and appended to "$@" — see that file for the why (#394).
. "$SCRIPT_DIR/_ignore-args.sh"
"$PRETTIER_BIN" --list-different "{**/*,*}.{ts,tsx,js,jsx,json,html}" --log-level log "$@"
