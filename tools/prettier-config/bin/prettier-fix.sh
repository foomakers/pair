SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PRETTIER_BIN="$SCRIPT_DIR/../node_modules/.bin/prettier"
# Same ignore sources as prettier-check.sh — check and fix MUST see the same file
# set, or the gate reports a file the formatter refuses to touch (#394).
IGNORE_ARGS="--ignore-path $SCRIPT_DIR/../.prettierignore"
GIT_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || true)"
if [ -n "$GIT_ROOT" ] && [ -f "$GIT_ROOT/.gitignore" ]; then
  IGNORE_ARGS="$IGNORE_ARGS --ignore-path $GIT_ROOT/.gitignore"
fi
if [ -f ".gitignore" ] && [ "$(pwd)" != "$GIT_ROOT" ]; then
  IGNORE_ARGS="$IGNORE_ARGS --ignore-path .gitignore"
fi
$PRETTIER_BIN "{**/*,*}.{ts,tsx,js,jsx,json,html}" --write $IGNORE_ARGS --log-level log  "$@"
