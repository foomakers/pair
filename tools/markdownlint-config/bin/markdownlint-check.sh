#!/usr/bin/env sh
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
MARKDOWNLINT_BIN="$SCRIPT_DIR/../node_modules/.bin/markdownlint"
# Ignore sources (shared .markdownlintignore + the repo's .gitignore files, the root
# one re-anchored to the cwd) are assembled once, in _ignore-file.sh, which sets
# IGNORE_FILE — see that file for the why (#394).
. "$SCRIPT_DIR/_ignore-file.sh"
# Accept optional path args; default to **/*.md when none provided
[ $# -gt 0 ] || set -- "**/*.md"
"$MARKDOWNLINT_BIN" --config "$SCRIPT_DIR/../.markdownlint.jsonc" --ignore-path "$IGNORE_FILE" --dot "$@"
