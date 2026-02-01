#!/usr/bin/env bash

# Common utilities for smoke tests

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Global Variables
# TEST_BINARY: Path to the pair executable (must be set by runner)
# KB_SOURCE_PATH: Path to the KB content to use as source (must be set by runner)
# IS_OFFLINE: "true" or "false"

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_succ() { echo -e "${GREEN}[PASS]${NC} $1"; }
log_fail() { echo -e "${RED}[FAIL]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }

# Setup a clean test workspace
setup_workspace() {
  local name=$1
  local workspace_dir="$TMP_DIR/$name"
  # Ensure a fresh workspace for each test run to avoid collisions
  rm -rf "$workspace_dir"
  mkdir -p "$workspace_dir"
  echo "$workspace_dir"
}

# Run the PAIR command
# Usages:
#   run_pair install ...
#   run_pair package ...
run_pair() {
  local cmd_output_file="$TMP_DIR/last_cmd_output.log"
  local cmd_status=0

  # If TEST_BINARY not set, attempt to ensure packaged CLI exists for standalone scenario runs
  if [ -z "${TEST_BINARY:-}" ]; then
    log_info "TEST_BINARY not set; attempting packaging preflight"
    ensure_packaged_cli || true
  fi

  # Normalize TEST_BINARY to an absolute CLI path when possible so tests that expect
  # a local `apps/pair-cli/dist/cli.js` file still work. If TEST_BINARY looks like
  # "node /abs/path/to/pair-cli", extract the path; if it's an executable path,
  # use it directly.
  local BIN_PATH=""
  if [[ "$TEST_BINARY" == node\ * ]]; then
    BIN_PATH="${TEST_BINARY#node }"
  else
    BIN_PATH="$TEST_BINARY"
  fi

  # If the binary path exists as a file, create a workspace-local symlink so relative
  # requires like "apps/pair-cli/dist/cli.js" resolve in the test workspace.
  if [ -n "$BIN_PATH" ] && [ -f "$BIN_PATH" ]; then
    mkdir -p "$PWD/apps/pair-cli/dist"
    ln -sf "$BIN_PATH" "$PWD/apps/pair-cli/dist/cli.js"
  fi

  # Build command - TEST_BINARY is already set with proper path
  local cmd="$TEST_BINARY $@"

  if [ -n "${DEBUG:-}" ]; then
    echo "DEBUG: Executing $cmd"
  fi

  # Execute using eval to properly handle commands with spaces in TEST_BINARY
  eval "$cmd" > "$cmd_output_file" 2>&1 || cmd_status=$?

  # Log output on failure or if verbose
  if [ $cmd_status -ne 0 ]; then
    cat "$cmd_output_file"
  fi

  return $cmd_status
}

# Assert command success
assert_success() {
  if [ $? -eq 0 ]; then
    log_succ "Command succeeded"
  else
    log_fail "Command failed (exit code $?)"
    return 1
  fi
}

# Assert command failure
assert_failure() {
  if [ $? -ne 0 ]; then
    log_succ "Command failed as expected"
  else
    log_fail "Command succeeded but should have failed"
    return 1
  fi
}

# Assert file exists
assert_file() {
  if [ -f "$1" ]; then
    log_succ "File exists: $1"
  else
    log_fail "File missing: $1"
    ls -la "$(dirname "$1")" 2>/dev/null || true
    return 1
  fi
}

# Assert directory exists
assert_dir() {
  if [ -d "$1" ]; then
    log_succ "Directory exists: $1"
  else
    log_fail "Directory missing: $1"
    ls -la "$(dirname "$1")" 2>/dev/null || true
    return 1
  fi
}

# Assert file content contains string
assert_contains() {
  local file="$1"
  local string="$2"
  if grep -Fq "$string" "$file"; then
    log_succ "File contains '$string'"
  else
    log_fail "File '$file' does not contain '$string'"
    echo "--- File Content ---"
    cat "$file"
    echo "--------------------"
    return 1
  fi
}

# Assert last command output contains string
assert_output_contains() {
  local string="$1"
  local file="$TMP_DIR/last_cmd_output.log"
  if grep -Fq "$string" "$file"; then
    log_succ "Output contains '$string'"
  else
    log_fail "Output does not contain '$string'"
    echo "--- Last Output ---"
    cat "$file"
    echo "-------------------"
    return 1
  fi
}

# Ensure a TMP_DIR is available when scenarios are run standalone
ensure_tmp_dir() {
  if [ -z "${TMP_DIR:-}" ]; then
    # Derive REPO_ROOT relative to this library file, not the calling script.
    REPO_ROOT="${REPO_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)}"
    DATETIME=$(date +"%Y%m%d.%H%M%S")
    RANDOM_HASH=$(openssl rand -hex 4 2>/dev/null || cat /dev/urandom | tr -dc 'a-f0-9' | head -c 8)
    TMP_DIR_NAME="smoke-tests.${DATETIME}.${RANDOM_HASH}"
    mkdir -p "$REPO_ROOT/.tmp"
    TMP_DIR="$REPO_ROOT/.tmp/${TMP_DIR_NAME}"
    mkdir -p "$TMP_DIR"
    export TMP_DIR
    echo "Created TMP_DIR: $TMP_DIR"
  fi
}

# Ensure a packaged CLI artifact exists for the run and export TEST_BINARY accordingly.
# This allows running individual scenarios directly: they will invoke the packaging
# preflight (00-create-install-package.sh) if $TMP_DIR/packaged-cli is not present.
ensure_packaged_cli() {
  ensure_tmp_dir
  PACKAGED_CLI_FILE="$TMP_DIR/packaged-cli"
  PACKAGING_SCRIPT="$REPO_ROOT/scripts/smoke-tests/scenarios/00-create-install-package.sh"

  if [ -f "$PACKAGED_CLI_FILE" ]; then
    export TEST_BINARY="$(cat "$PACKAGED_CLI_FILE")"
    log_info "Using packaged CLI from $PACKAGED_CLI_FILE"
    return 0
  fi

  if [ -x "$PACKAGING_SCRIPT" ]; then
    log_info "Packaged CLI missing; running packaging preflight: $PACKAGING_SCRIPT"
    if "$PACKAGING_SCRIPT"; then
      if [ -f "$PACKAGED_CLI_FILE" ]; then
        export TEST_BINARY="$(cat "$PACKAGED_CLI_FILE")"
        log_info "Packaging produced CLI at: $TEST_BINARY"
        return 0
      else
        log_warn "Packaging completed but did not produce $PACKAGED_CLI_FILE"
        return 1
      fi
    else
      log_warn "Packaging preflight failed; continuing without packaged CLI"
      return 1
    fi
  else
    log_warn "Packaging script not found or not executable: $PACKAGING_SCRIPT"
    return 1
  fi
}