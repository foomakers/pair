SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PRETTIER_BIN="$SCRIPT_DIR/../node_modules/.bin/prettier"
# Ignore sources: the shared ignore + the repo's own gitignore files (repo root,
# and the package being checked). prettier 3.6 accepts --ignore-path repeatedly,
# so "gitignored => never formatted" holds without enumerating generated dirs in
# .prettierignore. Since #394 the gate runs prettier in CHECK mode, where a
# generated artifact would BLOCK every push instead of being silently rewritten.
IGNORE_ARGS="--ignore-path $SCRIPT_DIR/../.prettierignore"
GIT_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || true)"
if [ -n "$GIT_ROOT" ] && [ -f "$GIT_ROOT/.gitignore" ]; then
  IGNORE_ARGS="$IGNORE_ARGS --ignore-path $GIT_ROOT/.gitignore"
fi
if [ -f ".gitignore" ] && [ "$(pwd)" != "$GIT_ROOT" ]; then
  IGNORE_ARGS="$IGNORE_ARGS --ignore-path .gitignore"
fi
$PRETTIER_BIN --list-different "{**/*,*}.{ts,tsx,js,jsx,json,html}" $IGNORE_ARGS --log-level log  "$@"
