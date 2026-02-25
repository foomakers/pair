#!/bin/bash
set -euo pipefail

# Script: smoke-test-npm-artifact.sh
# Purpose: Smoke-test npm TGZ artifact by extracting the tarball, adding it as a
# local dependency to a copy of the sample project, running `npm install`, and
# executing `npm run pair:install` to exercise the installed package.
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
  echo "Error: parameter is required (version or path to tgz)"
  echo "Usage: $0 <version|path/to/pair-cli-<ver>.tgz>"
  exit 1
fi

if [ -f "$INPUT" ] && [[ "$INPUT" == *.tgz ]]; then
  TGZ="$INPUT"
  SUM="${TGZ}.sha256"
else
  # Accept versions with or without leading v/V
  VERSION="$INPUT"
  VERSION="${VERSION#v}"
  VERSION="${VERSION#V}"
  TGZ="release/pair-cli-${VERSION}.tgz"
  SUM="release/pair-cli-${VERSION}.tgz.sha256"
fi

if [ ! -f "$TGZ" ]; then
  echo "Error: artifact $TGZ not found"
  exit 1
fi

if [ -f "$SUM" ]; then
  echo "Verifying checksum for $TGZ..."
  if command -v sha256sum >/dev/null 2>&1; then
    calc=$(sha256sum "$TGZ" | awk '{print $1}')
  else
    calc=$(shasum -a 256 "$TGZ" | awk '{print $1}')
  fi
  expected=$(cat "$SUM" | tr -d '\n' | tr -d '\r')
  if [ "$calc" != "$expected" ]; then
    echo "Error: checksum mismatch (expected $expected, got $calc)"
    exit 1
  fi
  echo "Checksum verification passed."
else
  echo "No checksum file found for $TGZ, continuing without verification."
fi

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
  LOGFILE="$LOGDIR/npm-$(date +%s).log"
  echo "[smoke-test-npm] TMPDIR=$TMPDIR FORCE_CLEANUP=$FORCE_CLEANUP PAIR_DIAG=${PAIR_DIAG:-}" | tee -a "$LOGFILE"
  echo "ARTIFACT=$TGZ" >> "$LOGFILE"
  echo "" >> "$LOGFILE"
  echo "Environment snapshot:" >> "$LOGFILE"
  env | sort >> "$LOGFILE" || true
  echo "" >> "$LOGFILE"
  echo "----" >> "$LOGFILE"
  echo "" >> "$LOGFILE"
else
  echo "[smoke-test-npm] TMPDIR=$TMPDIR FORCE_CLEANUP=$FORCE_CLEANUP PAIR_DIAG=${PAIR_DIAG:-}"
fi

# Prepare sample project copy
SAMPLE_SRC="scripts/workflows/release/fixtures/sample-project"
if [ ! -d "$SAMPLE_SRC" ]; then
  echo "Error: sample project not found at $SAMPLE_SRC"
  exit 1
fi

SAMPLE_TMP="$TMPDIR/sample-project"
cp -a "$SAMPLE_SRC" "$SAMPLE_TMP"

cleanup() {
  local rc=$?
  if [ "$FORCE_CLEANUP" = "1" ]; then
    echo "FORCE_CLEANUP=1: removing debug folders: $TMPDIR"
    rm -rf "$TMPDIR" || true
  else
    # Default: keep tmpdir so debugging artifacts are preserved. Use --cleanup to remove.
    if [ "${PAIR_DIAG:-}" = "1" ]; then
      echo "PAIR_DIAG=1: keeping debug folders: $TMPDIR"
    else
      echo "Keeping debug folders: $TMPDIR (pass --cleanup or -c to remove)"
    fi
  fi
  exit $rc
}
trap cleanup EXIT
# Resolve TGZ to absolute path so it can be read regardless of cwd
if command -v realpath >/dev/null 2>&1; then
  TGZ_ABS=$(realpath "$TGZ")
else
  # fallback: compute absolute path
  TGZ_DIR=$(dirname "$TGZ")
  TGZ_FILE=$(basename "$TGZ")
  pushd "$TGZ_DIR" >/dev/null
  TGZ_ABS="$PWD/$TGZ_FILE"
  popd >/dev/null
fi

pushd "$SAMPLE_TMP" >/dev/null

echo "Installing local tgz into sample project: npm install '$TGZ_ABS'"
# Extract the tgz to avoid npm interpreting the path as a git specifier
PKG_DIR="$TMPDIR/pkg"
mkdir -p "$PKG_DIR"
tar -xzf "$TGZ_ABS" -C "$PKG_DIR"
EXTRACTED="$PKG_DIR/package"
if [ ! -d "$EXTRACTED" ]; then
  echo "Error: extracted package directory not found at $EXTRACTED"
  ls -la "$PKG_DIR"
  exit 1
fi

echo "Installing dependencies for extracted package ($EXTRACTED)"
pushd "$EXTRACTED" >/dev/null
npm install --no-audit --no-fund
popd >/dev/null

echo "Installing extracted package into sample project"
npm install --no-audit --no-fund "$EXTRACTED"

echo "Dereferencing symlinks in installed package..."
echo "Checking node_modules/@foomakers* contents:"

rm $TMPDIR/sample-project/node_modules/@foomakers/pair-cli
cp -r $TMPDIR/pkg/package $TMPDIR/sample-project/node_modules/@foomakers/pair-cli

# Determine KB source for install (dataset no longer embedded in bundle)
KB_SOURCE_PATH="$REPO_ROOT/packages/knowledge-hub/dataset"
if [ ! -d "$KB_SOURCE_PATH" ]; then
  echo "Error: KB dataset not found at $KB_SOURCE_PATH"
  exit 1
fi

PAIR_BIN="$SAMPLE_TMP/node_modules/.bin/pair"

# ---- Test A: Install with explicit --source (current behavior) ----
echo "Test A: pair install --source $KB_SOURCE_PATH"
if [ -x "$PAIR_BIN" ]; then
  "$PAIR_BIN" install --source "$KB_SOURCE_PATH"
else
  npx pair-cli install --source "$KB_SOURCE_PATH"
fi
echo "Test A passed: npm-based pair install with --source succeeded"

# ---- Test B: Install with default resolution (no --source, no --offline) ----
# This exercises the auto-download fallback that real npm users get.
# Run in a separate directory so the existing install doesn't interfere.
DEFAULT_TEST_DIR="$TMPDIR/default-resolution-test"
mkdir -p "$DEFAULT_TEST_DIR"
echo "Test B: pair install (default resolution — no --source, no --offline)"
pushd "$DEFAULT_TEST_DIR" >/dev/null
if [ -x "$PAIR_BIN" ]; then
  if "$PAIR_BIN" install 2>&1; then
    echo "Test B passed: default resolution install succeeded"
    if [ ! -d ".pair" ]; then
      echo "Warning: Test B — .pair directory not created despite exit 0"
    fi
  else
    echo "Warning: Test B — default resolution failed (may require published GitHub release)"
    echo "  This is expected during pre-release CI but should pass in post-release validation"
  fi
else
  echo "Warning: Test B skipped — PAIR_BIN not executable at $PAIR_BIN"
fi
popd >/dev/null

# ------------------------------------------------------------------------------------------------
# NEW SMOKE TEST SUITE INTEGRATION
# ------------------------------------------------------------------------------------------------
echo "Invoking standardized smoke test suite..."

REPO_ROOT="$(cd "$REPO_ROOT" && pwd)" # Ensure absolute path
RUNNER_SCRIPT="$REPO_ROOT/scripts/smoke-tests/run-all.sh"

if [ ! -x "$RUNNER_SCRIPT" ]; then
  chmod +x "$RUNNER_SCRIPT"
fi

# Locate the installed binary in node_modules
# It should be at node_modules/.bin/pair (symlink)
INSTALLED_BIN="$SAMPLE_TMP/node_modules/.bin/pair"

if [ ! -x "$INSTALLED_BIN" ]; then
  echo "Warning: Installed binary not found at $INSTALLED_BIN. Skipping suite."
else
  # Determine KB source path for offline tests
  KB_SOURCE_PATH="$REPO_ROOT/packages/knowledge-hub/dataset"
  if [ ! -d "$KB_SOURCE_PATH" ]; then
    echo "Warning: Local KB source not found at $KB_SOURCE_PATH. Offline tests may fail."
    KB_SOURCE_PATH=""
  fi

  # Build arguments for run-all.sh
  ARGS=(--binary "$INSTALLED_BIN")
  if [ -n "$KB_SOURCE_PATH" ]; then
    ARGS+=(--kb-source "$KB_SOURCE_PATH")
  fi
  if [ "$FORCE_CLEANUP" = "1" ]; then
    ARGS+=(--cleanup)
  fi

  echo "Running: $RUNNER_SCRIPT ${ARGS[*]}"
  "$RUNNER_SCRIPT" "${ARGS[@]}"
  
  SUITE_RET=$?
  if [ $SUITE_RET -ne 0 ]; then
    echo "Standardized smoke-test suite failed with exit code $SUITE_RET"
    exit $SUITE_RET
  fi
fi

popd >/dev/null

echo "NPM artifact smoke-test completed successfully."
