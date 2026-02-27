#!/bin/bash
set -euo pipefail

# Script: smoke-test-manual-artifact.sh
# Purpose: Smoke-test manual ZIP artifact by verifying checksum, running --version,
# and exercising `pair install` against the sample project using the extracted binary.
# Parameters:
#   VERSION: The version to test (e.g., v1.0.0)

INPUT="${1:-}"
# Optional flags after the first parameter:
#   --cleanup | -c       : force removal of temp folders at the end
#   --persist-logs | -p   : persist debug logs to ./.tmp/smoke-logs
FORCE_CLEANUP=0
PERSIST_LOGS=0
for arg in "${@:2}"; do
  case "$arg" in
    --cleanup|-c) FORCE_CLEANUP=1 ;;
    --persist-logs|-p) PERSIST_LOGS=1 ;;
    *) echo "Warning: unknown flag '$arg'" ;;
  esac
done
if [ -z "$INPUT" ]; then
  echo "Error: parameter is required (version or path to zip)"
  echo "Usage: $0 <version|path/to/pair-cli-manual-<ver>.zip>"
  exit 1
fi

# If input is a file path to a zip, use it; else treat as version
if [ -f "$INPUT" ] && [[ "$INPUT" == *.zip ]]; then
  ZIP="$INPUT"
  # try to infer checksum file next to it
  SUM="${ZIP}.sha256"
else
  # Normalize version input (accept leading v/V)
  VERSION="$INPUT"
  VERSION="${VERSION#v}"
  VERSION="${VERSION#V}"
  ZIP="release/pair-cli-manual-${VERSION}.zip"
  SUM="release/pair-cli-manual-${VERSION}.zip.sha256"
fi

if [ ! -f "$ZIP" ]; then
  echo "Error: artifact $ZIP not found"
  exit 1
fi

if [ ! -f "$SUM" ]; then
  echo "Warning: checksum $SUM not found; continuing without checksum verification"
else
  echo "Verifying checksum for $ZIP..."

# Verify checksum (use sha256sum if present, else shasum)
if command -v sha256sum >/dev/null 2>&1; then
  calc=$(sha256sum "$ZIP" | awk '{print $1}')
else
  calc=$(shasum -a 256 "$ZIP" | awk '{print $1}')
fi

expected=$(cat "$SUM" | tr -d '\n' | tr -d '\r')
  if [ "$calc" != "$expected" ]; then
    echo "Error: checksum mismatch (expected $expected, got $calc)"
    exit 1
  fi

  echo "Checksum verification passed."
fi

echo "Extracting artifact for smoke testing..."

# Use GitHub Actions runner temp when available (RUNNER_TEMP). Fall back to repo-local tmp for local runs.
REPO_ROOT="${GIT_WORK_TREE:-${PWD}}"
# Prefer RUNNER_TEMP only if it's outside the repository workspace; otherwise create .tmp under the repo
if [ -n "${RUNNER_TEMP:-}" ] && [[ "$RUNNER_TEMP" != "$REPO_ROOT"* ]]; then
  TMPDIR=$(mktemp -d "${RUNNER_TEMP}/tmp.smoke.XXXX" 2>/dev/null || mktemp -d)
else
  mkdir -p "$REPO_ROOT/.tmp"
  TMPDIR=$(mktemp -d "${REPO_ROOT}/.tmp/smoke.XXXX" 2>/dev/null || mktemp -d)
fi
if [ "$PERSIST_LOGS" = "1" ]; then
  LOGDIR="$REPO_ROOT/.tmp/smoke-logs"
  mkdir -p "$LOGDIR"
  LOGFILE="$LOGDIR/manual-$(date +%s).log"
  echo "[smoke-test-manual] TMPDIR=$TMPDIR FORCE_CLEANUP=$FORCE_CLEANUP PAIR_DIAG=${PAIR_DIAG:-}" | tee -a "$LOGFILE"
  echo "ARTIFACT=$ZIP" >> "$LOGFILE"
  echo "" >> "$LOGFILE"
  echo "Environment snapshot:" >> "$LOGFILE"
  env | sort >> "$LOGFILE" || true
  echo "" >> "$LOGFILE"
  echo "----" >> "$LOGFILE"
  echo "" >> "$LOGFILE"
else
  echo "[smoke-test-manual] TMPDIR=$TMPDIR FORCE_CLEANUP=$FORCE_CLEANUP PAIR_DIAG=${PAIR_DIAG:-}"
fi

# Cleanup handler: remove TMPDIR when requested via --cleanup, otherwise keep artifacts for debugging
cleanup() {
  local rc=$?
  if [ "$FORCE_CLEANUP" = "1" ]; then
    echo "🧹 Cleaning up: $TMPDIR"
    rm -rf "$TMPDIR" || true
  else
    echo "📁 Artifacts and logs kept at: $TMPDIR"
  fi
  exit $rc
}
trap cleanup EXIT

unzip -q "$ZIP" -d "$TMPDIR"

# Find the artifact directory (should be pair-cli-manual-* but handle version mismatches)
ART_DIR=$(find "$TMPDIR" -maxdepth 1 -type d -name "pair-cli-manual-*" | head -n1)
if [ -z "$ART_DIR" ]; then
  echo "Error: extracted artifact directory not found"
  ls -la "$TMPDIR"
  exit 1
fi

echo "Found artifact directory: $(basename "$ART_DIR")"

echo "Testing binary execution (version)..."

# Try running top-level wrapper first, else call node directly. Fail if none succeed.
RAN=0
BIN_PATH=""
if [ -x "$ART_DIR/pair-cli" ]; then
  echo "Testing $ART_DIR/pair-cli --version"
  "$ART_DIR/pair-cli" --version
  BIN_PATH="$ART_DIR/pair-cli"
  RAN=1
elif [ -x "$ART_DIR/bin/pair-cli" ]; then
  echo "Testing $ART_DIR/bin/pair-cli --version"
  "$ART_DIR/bin/pair-cli" --version
  BIN_PATH="$ART_DIR/bin/pair-cli"
  RAN=1
elif [ -f "$ART_DIR/bundle-cli/index.js" ]; then
  echo "Testing $ART_DIR/bundle-cli/index.js --version"
  node "$ART_DIR/bundle-cli/index.js" --version
  BIN_PATH="node $ART_DIR/bundle-cli/index.js"
  RAN=1
fi

if [ "$RAN" -ne 1 ]; then
  echo "Error: no runnable binary found in artifact to smoke-test"
  echo "Checked paths:"
  echo "  - $ART_DIR/pair-cli"
  echo "  - $ART_DIR/bin/pair-cli"
  echo "  - $ART_DIR/bundle-cli/index.js"
  exit 1
fi


# ------------------------------------------------------------------------------------------------
# NEW SMOKE TEST SUITE INTEGRATION
# ------------------------------------------------------------------------------------------------
echo "Invoking standardized smoke test suite..."

# Locate `run-all.sh`
MYSCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$MYSCRIPT_DIR/../../.." && pwd)"
RUNNER_SCRIPT="$REPO_ROOT/scripts/smoke-tests/run-all.sh"

if [ ! -x "$RUNNER_SCRIPT" ]; then
  chmod +x "$RUNNER_SCRIPT"
fi

# Determine KB source path for offline tests
KB_SOURCE_PATH="$REPO_ROOT/packages/knowledge-hub/dataset"
if [ ! -d "$KB_SOURCE_PATH" ]; then
  echo "Warning: Local KB source not found at $KB_SOURCE_PATH. Offline tests may fail."
  KB_SOURCE_PATH=""
fi

# Build arguments for run-all.sh
ARGS=(--binary "$BIN_PATH" --ci --offline-only)
if [ -n "$KB_SOURCE_PATH" ]; then
  ARGS+=(--kb-source "$KB_SOURCE_PATH")
fi
if [ "$FORCE_CLEANUP" = "1" ]; then
  ARGS+=(--cleanup)
fi

echo "Running: $RUNNER_SCRIPT ${ARGS[*]}"
"$RUNNER_SCRIPT" "${ARGS[@]}"

RET=$?
echo "Standardized smoke-test suite exit code: $RET"

# Let EXIT trap run cleanup and exit with the suite return code
exit $RET

