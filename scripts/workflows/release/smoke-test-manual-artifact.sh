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

echo "Version check passed. Now testing 'pair install' against the sample project."

# Prepare sample project copy
SAMPLE_SRC="docs/getting-started/sample-project"
if [ ! -d "$SAMPLE_SRC" ]; then
  echo "Error: sample project not found at $SAMPLE_SRC"
  exit 1
fi

SAMPLE_TMP="$TMPDIR/sample-project"
cp -a "$SAMPLE_SRC" "$SAMPLE_TMP"

# For smoke testing, copy the local KB dataset directly into the sample project's .pair directory
# This allows testing the install functionality without needing a published release
REPO_ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
KB_DATASET_LOCAL="$REPO_ROOT/packages/knowledge-hub/dataset"
if [ -d "$KB_DATASET_LOCAL" ]; then
  echo "Copying local KB dataset into sample project for smoke test..."
  mkdir -p "$SAMPLE_TMP/.pair"
  cp -a "$KB_DATASET_LOCAL" "$SAMPLE_TMP/.pair/"
  echo "✓ Local KB dataset ready for install test"
fi

# Copy the extracted manual package under the sample project in a pair-cli folder
echo "Copying manual package to sample project under pair-cli folder..."
cp -a "$ART_DIR" "$SAMPLE_TMP/pair-cli"

cleanup() {
  local rc=$?
  # write cleanup log (only if persisting logs was requested)
  if [ "$PERSIST_LOGS" = "1" ]; then
    echo "[cleanup] rc=$rc FORCE_CLEANUP=$FORCE_CLEANUP PAIR_DIAG=${PAIR_DIAG:-}" | tee -a "$LOGFILE"
    echo "TMPDIR_EXISTS=$( [ -d \"$TMPDIR\" ] && echo yes || echo no )" | tee -a "$LOGFILE"
    echo "Listing TMPDIR contents (first 50 lines):" >> "$LOGFILE"
    ls -la "$TMPDIR" 2>/dev/null | head -n 50 >> "$LOGFILE" || true
  else
    echo "[cleanup] rc=$rc FORCE_CLEANUP=$FORCE_CLEANUP PAIR_DIAG=${PAIR_DIAG:-}"
    echo "TMPDIR_EXISTS=$( [ -d \"$TMPDIR\" ] && echo yes || echo no )"
  fi

  if [ "$FORCE_CLEANUP" = "1" ]; then
    if [ "$PERSIST_LOGS" = "1" ]; then
      echo "FORCE_CLEANUP=1: removing debug folders: $TMPDIR" | tee -a "$LOGFILE"
    else
      echo "FORCE_CLEANUP=1: removing debug folders: $TMPDIR"
    fi
    rm -rf "$TMPDIR" || true
  else
    # Default: keep tmpdir so debugging artifacts are preserved. Use --cleanup to remove.
    if [ "${PAIR_DIAG:-}" = "1" ]; then
      if [ "$PERSIST_LOGS" = "1" ]; then
        echo "PAIR_DIAG=1: keeping debug folders: $TMPDIR" | tee -a "$LOGFILE"
      else
        echo "PAIR_DIAG=1: keeping debug folders: $TMPDIR"
      fi
    else
      if [ "$PERSIST_LOGS" = "1" ]; then
        echo "Keeping debug folders: $TMPDIR (pass --cleanup or -c to remove)" | tee -a "$LOGFILE"
      else
        echo "Keeping debug folders: $TMPDIR (pass --cleanup or -c to remove)"
      fi
    fi
  fi
  exit $rc
}
trap cleanup EXIT

echo "Running install from inside the sample project directory (no absolute path)"
pushd "$SAMPLE_TMP" >/dev/null

# Use the binary from the pair-cli folder in the sample project
PAIR_CLI_DIR="./pair-cli"
# Build the install command - use local KB if available, else use --no-kb
KB_SOURCE=""
if [ -d ".pair/dataset" ]; then
  # Use absolute path for KB dataset
  ABS_KB_PATH="$(cd .pair/dataset && pwd)"
  KB_SOURCE="--url $ABS_KB_PATH"
else
  KB_SOURCE="--no-kb"
fi

if [[ -x "$PAIR_CLI_DIR/pair-cli" ]]; then
  echo "Executing: ./pair-cli/pair-cli install $KB_SOURCE"
  ./pair-cli/pair-cli install $KB_SOURCE
elif [[ -x "$PAIR_CLI_DIR/bin/pair-cli" ]]; then
  echo "Executing: ./pair-cli/bin/pair-cli install $KB_SOURCE"
  ./pair-cli/bin/pair-cli install $KB_SOURCE
elif [[ -f "$PAIR_CLI_DIR/bundle-cli/index.js" ]]; then
  echo "Executing: node ./pair-cli/bundle-cli/index.js install $KB_SOURCE"
  node ./pair-cli/bundle-cli/index.js install $KB_SOURCE
else
  echo "Error: no runnable binary found in $PAIR_CLI_DIR"
  echo "Checked paths:"
  echo "  - $PAIR_CLI_DIR/pair-cli"
  echo "  - $PAIR_CLI_DIR/bin/pair-cli"
  echo "  - $PAIR_CLI_DIR/bundle-cli/index.js"
  exit 1
fi

RET=$?
popd >/dev/null

echo "pair install exit code: $RET"

# Basic verification: check for .pair folder and knowledge base contents
if [ -d "$SAMPLE_TMP/.pair" ]; then
  echo "pair install appears to have created $SAMPLE_TMP/.pair"
  
  # Verify knowledge base contents
  echo "Verifying knowledge base installation..."
  KB_ITEMS=(".pair/knowledge" ".pair/adoption")
  MISSING_ITEMS=()
  
  for item in "${KB_ITEMS[@]}"; do
    if [ ! -d "$SAMPLE_TMP/$item" ]; then
      MISSING_ITEMS+=("$item")
    fi
  done
  
  if [ ${#MISSING_ITEMS[@]} -eq 0 ]; then
    echo "✓ Knowledge base installed successfully - all expected directories found"
  else
    echo "Warning: Some knowledge base directories are missing:"
    for missing in "${MISSING_ITEMS[@]}"; do
      echo "  - $missing"
    done
  fi
else
  echo "Warning: $SAMPLE_TMP/.pair not found after pair install."
  echo "Listing sample project contents for debugging:"
  ls -la "$SAMPLE_TMP" || true
fi

if [ $RET -ne 0 ]; then
  echo "Error: pair install failed with exit code $RET"
  exit $RET
fi

echo "Manual artifact smoke-test completed successfully."
