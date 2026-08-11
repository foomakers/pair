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

# --- Runner outcome vocabulary (story #400) ---------------------------------
# A listed scenario has THREE possible states before it is ever executed. The
# runner used to know two answers — passed, or FAILED — so a scenario that could
# not run at all (`coverage-gate.sh`, committed mode 644) reported `Permission
# denied` -> FAIL, indistinguishable from a real assertion failure. It sat dead
# for weeks. Deciding the state up front is what keeps "cannot run" from ever
# being reported as "ran and failed" again.
#
# These read the FILESYSTEM, which is the right question at run time. The
# COMMITTED mode is a different question, guarded at the commit level by
# packages/dev-tools/src/quality-gates/smoke-scenario-modes.ts (`git ls-files -s`).

# file_mode <path> — octal mode, portably (GNU stat, then BSD stat).
# Prints nothing for a path that does not exist, instead of a stat error.
file_mode() {
  [ -e "$1" ] || return 0
  stat -c '%a' "$1" 2>/dev/null || stat -f '%OLp' "$1" 2>/dev/null
}

# scenario_state <path> — RUNNABLE | MISSING | NOT_EXECUTABLE
scenario_state() {
  local script="$1"
  if [ ! -f "$script" ]; then
    echo "MISSING"
  elif [ ! -x "$script" ]; then
    echo "NOT_EXECUTABLE"
  else
    echo "RUNNABLE"
  fi
}

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
  local cmd_status=0

  # If TEST_BINARY not set, attempt to ensure packaged CLI exists for standalone scenario runs
  if [ -z "${TEST_BINARY:-}" ]; then
    log_info "TEST_BINARY not set; attempting packaging preflight"
    ensure_packaged_cli || true
  fi

  # Evaluate cmd_output_file AFTER ensure_packaged_cli so TMP_DIR is set
  ensure_tmp_dir
  local cmd_output_file="$TMP_DIR/last_cmd_output.log"

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
  # GUARD: never create this symlink inside the actual repo tree — only in test workspaces.
  if [ -n "$BIN_PATH" ] && [ -f "$BIN_PATH" ] && [[ "$PWD" == "${TMP_DIR}"* ]]; then
    mkdir -p "$PWD/apps/pair-cli/dist"
    ln -sf "$BIN_PATH" "$PWD/apps/pair-cli/dist/cli.js"
  fi

  # Clear INIT_CWD so the CLI uses process.cwd() (the test workspace),
  # not the pnpm invoker's CWD leaked from `pnpm smoke-tests`.
  unset INIT_CWD

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

# Assert file does NOT exist. The absence half of assert_file: an option whose whole
# job is to leave something out (registry `exclude`) can only be checked negatively.
assert_no_file() {
  if [ ! -e "$1" ]; then
    log_succ "File absent as expected: $1"
  else
    log_fail "File present but should be absent: $1"
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

# Assert a KNOWN-DEFECTIVE behavior is STILL present, naming the tracking issue on both
# outcomes. Usage:
#
#   assert_pinned_bug "<issue-ref>" "<what is pinned>" <command...>
#
# <command...> must SUCCEED while the bug exists (wrap anything non-trivial in a scenario
# function). A pinned assertion is meant to flip: when the fix lands, the failure reads
# "the pinned bug appears FIXED — update this assertion" instead of looking like an
# unexplained smoke regression, so nobody has to reverse-engineer the red run.
#
# Reach (since #400): the CI-safe list (lib/ci-tests.sh) runs on every pull request, in the
# `smoke` job of ci.yml. A pinned assertion inside one of those scenarios is a CI guarantee —
# a pinned bug fixed upstream turns the PR red with the message below, instead of waiting for
# someone to run the suite by hand. In a scenario listed in CI_EXCLUDED it remains a manual
# gate, which is why exclusions carry a recorded reason.
assert_pinned_bug() {
  local issue="$1"
  local description="$2"
  shift 2

  if "$@"; then
    log_warn "Pinned bug still present ($issue): $description"
    return 0
  fi

  log_fail "PINNED BUG APPEARS FIXED ($issue): $description"
  log_fail "  -> good news: update this assertion (and its scenario comment) to the fixed behavior."
  return 1
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