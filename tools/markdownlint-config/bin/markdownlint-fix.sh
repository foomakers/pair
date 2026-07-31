SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
MARKDOWNLINT_BIN="$SCRIPT_DIR/../node_modules/.bin/markdownlint"
# Same ignore sources as markdownlint-check.sh — check and fix MUST see the same
# file set, or the gate reports a file the fixer refuses to touch (#394).
IGNORE_FILE="$SCRIPT_DIR/../.markdownlintignore"
GIT_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || true)"
if [ -n "$GIT_ROOT" ] && [ -f "$GIT_ROOT/.gitignore" ]; then
  COMBINED_IGNORE="$(mktemp "${TMPDIR:-/tmp}/markdownlintignore.XXXXXX")"
  trap 'rm -f "$COMBINED_IGNORE"' EXIT
  {
    cat "$IGNORE_FILE"
    echo
    cat "$GIT_ROOT/.gitignore"
    if [ -f ".gitignore" ] && [ "$(pwd)" != "$GIT_ROOT" ]; then
      echo
      cat ".gitignore"
    fi
  } > "$COMBINED_IGNORE"
  IGNORE_FILE="$COMBINED_IGNORE"
fi
# Accept optional path args; default to **/*.md when none provided
if [ $# -gt 0 ]; then
  $MARKDOWNLINT_BIN --config "$SCRIPT_DIR/../.markdownlint.jsonc" --ignore-path "$IGNORE_FILE" --fix --dot "$@"
else
  $MARKDOWNLINT_BIN --config "$SCRIPT_DIR/../.markdownlint.jsonc" --ignore-path "$IGNORE_FILE" --fix --dot "**/*.md"
fi
