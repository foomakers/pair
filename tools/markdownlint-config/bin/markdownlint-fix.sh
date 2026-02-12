SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
MARKDOWNLINT_BIN="$SCRIPT_DIR/../node_modules/.bin/markdownlint"
$MARKDOWNLINT_BIN --config "$SCRIPT_DIR/../.markdownlint.jsonc" --ignore-path "$SCRIPT_DIR/../.markdownlintignore" --fix "**/*.md" "$@"
