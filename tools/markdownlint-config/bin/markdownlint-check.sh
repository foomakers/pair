SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
MARKDOWNLINT_BIN="$SCRIPT_DIR/../node_modules/.bin/markdownlint"
# Ignore source: the shared ignore + the repo's own gitignore files (repo root,
# and the package being linted), so "gitignored => never checked" holds without
# enumerating generated dirs. markdownlint-cli accepts a SINGLE --ignore-path
# (unlike prettier), so the sources are concatenated into one temp file — it
# parses gitignore syntax, so the patterns carry over verbatim. Matters since
# #394: in check mode a generated .md would BLOCK every push.
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
  $MARKDOWNLINT_BIN --config "$SCRIPT_DIR/../.markdownlint.jsonc" --ignore-path "$IGNORE_FILE" --dot "$@"
else
  $MARKDOWNLINT_BIN --config "$SCRIPT_DIR/../.markdownlint.jsonc" --ignore-path "$IGNORE_FILE" --dot "**/*.md"
fi
