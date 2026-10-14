#!/usr/bin/env bash
# #543 r0-1 — run-card.sh Test 4b-5 must not depend on the host PATH.
# Usage: run-card-engine-missing.sh stub|none
#   stub: a (stub) `pi` is on PATH — 4b-5 must still pass (witness, RED at base)
#   none: PATH stripped of every dir holding `pi` — 4b-5 passes (control)
# Hermetic: the stub never runs a real engine.
set -u
MODE="${1:-stub}"
REPO_ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
FAKE="$(mktemp -d)"
trap 'rm -rf "$FAKE"' EXIT
OUT="$FAKE/out.log"
if [ "$MODE" = stub ]; then
  printf '#!/bin/sh\nexit 0\n' >"$FAKE/pi"
  chmod +x "$FAKE/pi"
  P="$FAKE:$PATH"
else
  P=""
  IFS=:
  for d in $PATH; do [ -e "$d/pi" ] || P="$P${P:+:}$d"; done
  unset IFS
fi
PATH="$P" REPO_ROOT="$REPO_ROOT" TEST_BINARY="node $REPO_ROOT/apps/pair-cli/dist/cli.js" \
  bash "$REPO_ROOT/scripts/smoke-tests/scenarios/run-card.sh" >"$OUT" 2>&1
grep -Fq "Output contains 'Engine 'pi' could not be located'" "$OUT" || { echo "4b-5 did not pass ($MODE)"; grep -F "[FAIL]" "$OUT"; exit 1; }
echo "ok: 4b-5 passes ($MODE)"
