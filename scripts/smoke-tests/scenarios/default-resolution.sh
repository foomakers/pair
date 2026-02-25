#!/usr/bin/env bash
source "$(dirname "$0")/../lib/utils.sh"

# Tag: this scenario requires network (tests auto-download fallback)
OFFLINE_SAFE=false

TEST_NAME="Default Resolution Scenarios"
echo "=== Running $TEST_NAME ==="

# -------------------------------------------------------------------
# Test 1: Install with default resolution (no --source, no --offline)
# This exercises resolveDatasetRoot('default') with httpClient,
# which should fall back to auto-download when bundle-cli/dataset absent.
# -------------------------------------------------------------------
log_info "Test 1: Install with default resolution (no --source, no --offline)"
# Clear KB cache to force a fresh download from GitHub releases
rm -rf "$HOME/.pair/kb" 2>/dev/null || true
TEST_DIR=$(setup_workspace "default-resolution-basic")
cd "$TEST_DIR"
run_pair install
if [ $? -eq 0 ]; then
  assert_dir ".pair"
  log_succ "Default resolution install succeeded"
else
  log_fail "Default resolution install failed (requires network + published release)"
  exit 1
fi

# -------------------------------------------------------------------
# Test 2: Update with default resolution
# -------------------------------------------------------------------
log_info "Test 2: Update with default resolution (no --source, no --offline)"
TEST_DIR=$(setup_workspace "default-resolution-update")
cd "$TEST_DIR"
# Pre-seed with a local install so update has something to work with
if [ -n "$KB_SOURCE_PATH" ]; then
  run_pair install --source "$KB_SOURCE_PATH" --offline
  assert_success || exit 1
  # Clear KB cache to force a fresh download
  rm -rf "$HOME/.pair/kb" 2>/dev/null || true
  # Now try update without --source
  run_pair update
  if [ $? -eq 0 ]; then
    assert_dir ".pair"
    log_succ "Default resolution update succeeded"
  else
    log_fail "Default resolution update failed (requires network + published release)"
    exit 1
  fi
else
  log_warn "Skipping Test 2: no KB_SOURCE_PATH for pre-seed"
fi

echo "=== $TEST_NAME Completed ==="
