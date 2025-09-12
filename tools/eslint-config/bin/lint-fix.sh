WORKSPACE_ROOT="$(pwd)"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ESLINT_BIN="$SCRIPT_DIR/../node_modules/.bin/eslint"
$ESLINT_BIN "$WORKSPACE_ROOT/." --config "$SCRIPT_DIR/../eslint.config.cjs" --fix
