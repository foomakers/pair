#!/usr/bin/env bash
# #572 r3-g1 — run-card.sh Test 4b-3: --watch without --parallel runs the loop at --parallel 1 (#576).
# Usage: run-card-watch-default.sh [regress]
#   (none):  the built CLI — 4b-3 passes
#   regress: the CLI behind a shim refusing --watch without --parallel — 4b-3 must fail
# Skips the packaging preflight (built dist/cli.js). Hermetic: run-card.sh stubs gh and the engine.
set -u
REPO_ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
FAKE="$(mktemp -d)"
trap 'rm -rf "$FAKE"' EXIT
OUT="$FAKE/out.log"
BIN="node $REPO_ROOT/apps/pair-cli/dist/cli.js"
if [ "${1:-}" = regress ]; then
  cat >"$FAKE/pair" <<SH
#!/bin/sh
case " \$* " in *" --watch "*) case " \$* " in *" --parallel "*) ;; *) echo "--watch requires --parallel"; exit 1;; esac;; esac
exec $BIN "\$@"
SH
  chmod +x "$FAKE/pair"
  BIN="$FAKE/pair"
fi
REPO_ROOT="$REPO_ROOT" TEST_BINARY="$BIN" bash "$REPO_ROOT/scripts/smoke-tests/scenarios/run-card.sh" >"$OUT" 2>&1
grep -Fq "Output contains 'Requested: --parallel 1'" "$OUT" || { echo "4b-3 did not pass"; grep -F "[FAIL]" "$OUT"; exit 1; }
grep -F "[FAIL]" "$OUT" && { echo "run-card.sh has failures"; exit 1; }
echo "ok: 4b-3 passes, run-card.sh has no [FAIL]"
