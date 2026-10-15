#!/usr/bin/env bash
# #550 r0-1 — package-roundtrip.sh must detect a corrupted round-trip (amended AC2).
# Usage: package-roundtrip-mutation.sh link|claude|extra-file|none
#   link:       one link target in the packaged zip is retargeted to ANOTHER EXISTING file
#               (kb-verify still passes) — scenario must FAIL (witness, RED at base)
#   claude:     one existing line of the reinstalled CLAUDE.md is altered — scenario must FAIL (witness)
#   extra-file: the zip carries one extra file — scenario must FAIL (control, already caught)
#   none:       no corruption — scenario must PASS with the real, declared divergence (control)
# Hermetic: a wrapper CLI delegates to the repo build, mutating the zip / installed tree.
set -u
MODE="${1:-link}"
REPO_ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
FAKE="$(mktemp -d)"
trap 'rm -rf "$FAKE"' EXIT
cat >"$FAKE/pair" <<'WRAP'
#!/usr/bin/env bash
node "$REAL_CLI" "$@" || exit $?
case "$1" in
package)
  [ "$MODE" = link ] || [ "$MODE" = extra-file ] || exit 0
  while [ $# -gt 1 ]; do [ "$1" = --output ] && Z="$2"; shift; done
  X="$(mktemp -d)"
  (cd "$X" && unzip -q "$Z")
  if [ "$MODE" = link ]; then
    F="$X/.pair/knowledge/how-to/01-how-to-create-PRD.md"
    sed 's#](../assets/PRD_template.md)#](../assets/PRD_example.md)#' "$F" >"$F.new" && mv "$F.new" "$F"
  else
    echo extra >"$X/.pair/knowledge/EXTRA.md"
  fi
  # re-seal: manifest.contentChecksum = sha256 over non-manifest files sorted by entry name
  node -e '
    const fs = require("fs"), path = require("path"), h = require("crypto").createHash("sha256")
    const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e =>
      e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)])
    const root = process.argv[1]
    walk(root).map(f => path.relative(root, f)).filter(f => f !== "manifest.json")
      .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)).forEach(f => h.update(fs.readFileSync(path.join(root, f))))
    const m = path.join(root, "manifest.json"), j = JSON.parse(fs.readFileSync(m, "utf8"))
    j.contentChecksum = h.digest("hex")
    fs.writeFileSync(m, JSON.stringify(j, null, 2))
  ' "$X"
  rm -f "$Z"
  (cd "$X" && zip -qr "$Z" .)
  rm -rf "$X"
  ;;
install)
  if [ "$MODE" = claude ] && [[ "$*" == *.zip* ]]; then
    sed 's/Quick Start Process/Quick Start Procezz/' CLAUDE.md >CLAUDE.md.new && mv CLAUDE.md.new CLAUDE.md
  fi
  ;;
esac
WRAP
chmod +x "$FAKE/pair"
OUT="$FAKE/out.log"
mkdir "$FAKE/tmp"
echo "$FAKE/pair" >"$FAKE/tmp/packaged-cli"
TMP_DIR="$FAKE/tmp" REAL_CLI="$REPO_ROOT/apps/pair-cli/dist/cli.js" MODE="$MODE" TEST_BINARY="$FAKE/pair" REPO_ROOT="$REPO_ROOT" \
  bash "$REPO_ROOT/scripts/smoke-tests/scenarios/package-roundtrip.sh" >"$OUT" 2>&1
RC=$?
if [ "$MODE" = none ]; then
  [ $RC -eq 0 ] || { echo "scenario failed on a clean round-trip"; tail -5 "$OUT"; exit 1; }
  echo "ok: scenario passes (none)"
else
  [ $RC -ne 0 ] || { echo "scenario passed despite corruption ($MODE)"; exit 1; }
  echo "ok: scenario fails on corruption ($MODE)"
fi
