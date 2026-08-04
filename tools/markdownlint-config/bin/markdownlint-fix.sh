#!/usr/bin/env sh
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
MARKDOWNLINT_BIN="$SCRIPT_DIR/../node_modules/.bin/markdownlint"
# Same ignore sources as markdownlint-check.sh, from the same file — check and fix
# MUST see the same file set, or the gate reports a file the fixer refuses to touch (#394).
. "$SCRIPT_DIR/_ignore-file.sh"
# Accept optional path args; default to **/*.md when none provided
[ $# -gt 0 ] || set -- "**/*.md"
"$MARKDOWNLINT_BIN" --config "$SCRIPT_DIR/../.markdownlint.jsonc" --ignore-path "$IGNORE_FILE" --fix --dot "$@"
