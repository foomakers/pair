SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PRETTIER_BIN="$SCRIPT_DIR/../node_modules/.bin/prettier"
$PRETTIER_BIN "{**/*,*}.{ts,tsx,js,jsx,json,html}" --write --ignore-path $(dirname "$0")/../.prettierignore --log-level log  "$@"
