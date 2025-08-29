SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PRETTIER_BIN="$SCRIPT_DIR/../node_modules/.bin/prettier"
$PRETTIER_BIN --list-different "{**/*,*}.{ts,tsx,js,jsx,json,html}" --ignore-path $(dirname "$0")/../.prettierignore --log-level log  "$@"
