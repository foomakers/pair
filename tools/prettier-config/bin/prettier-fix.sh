#!/usr/bin/env sh
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PRETTIER_BIN="$SCRIPT_DIR/../node_modules/.bin/prettier"
# Same ignore sources as prettier-check.sh, from the same file — check and fix MUST
# see the same file set, or the gate reports a file the formatter refuses to touch (#394).
. "$SCRIPT_DIR/_ignore-args.sh"
"$PRETTIER_BIN" "{**/*,*}.{ts,tsx,js,jsx,json,html}" --write --log-level log "$@"
