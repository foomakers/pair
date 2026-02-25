#!/usr/bin/env bash
source "$(dirname "$0")/../lib/utils.sh"

# Tag: this scenario is offline-safe (no network required)
OFFLINE_SAFE=true

TEST_NAME="Source Resolution Scenarios"
echo "=== Running $TEST_NAME ==="

# Setup: create a valid KB directory source
MOCK_KB=$(setup_workspace "mock-kb-source-resolution")
mkdir -p "$MOCK_KB/.pair/knowledge"
mkdir -p "$MOCK_KB/.pair/adoption"
mkdir -p "$MOCK_KB/.github"
mkdir -p "$MOCK_KB/.skills/capability/stub"
echo "# AGENTS" > "$MOCK_KB/AGENTS.md"
echo '{"version":"0.0.0"}' > "$MOCK_KB/manifest.json"
echo "# Mock Knowledge" > "$MOCK_KB/.pair/knowledge/index.md"
echo "# Mock Adoption" > "$MOCK_KB/.pair/adoption/index.md"
echo "# Mock GitHub" > "$MOCK_KB/.github/README.md"
echo "# /stub" > "$MOCK_KB/.skills/capability/stub/SKILL.md"

# -------------------------------------------------------------------
# Test 1: Install from local directory (absolute path)
# -------------------------------------------------------------------
log_info "Test 1: Install from local directory (absolute path)"
TEST_DIR=$(setup_workspace "source-res-dir-abs")
cd "$TEST_DIR"
run_pair install --source "$MOCK_KB"
assert_success || exit 1
assert_dir ".pair"
log_succ "Install from absolute directory succeeded"

# -------------------------------------------------------------------
# Test 2: Install with --offline --source (local dir)
# -------------------------------------------------------------------
log_info "Test 2: Install with --offline --source (local directory)"
TEST_DIR=$(setup_workspace "source-res-offline")
cd "$TEST_DIR"
run_pair install --source "$MOCK_KB" --offline
assert_success || exit 1
assert_dir ".pair"
log_succ "Offline install from local directory succeeded"

# -------------------------------------------------------------------
# Test 3: Update from local directory
# -------------------------------------------------------------------
log_info "Test 3: Update from local directory"
TEST_DIR=$(setup_workspace "source-res-update")
cd "$TEST_DIR"
# First install
run_pair install --source "$MOCK_KB"
assert_success || exit 1
# Then update
run_pair update --source "$MOCK_KB"
assert_success || exit 1
assert_dir ".pair"
log_succ "Update from local directory succeeded"

# -------------------------------------------------------------------
# Test 4: Error - install with non-existent path
# -------------------------------------------------------------------
log_info "Test 4: Error on non-existent source path"
TEST_DIR=$(setup_workspace "source-res-noexist")
cd "$TEST_DIR"
run_pair install --source "/nonexistent/path/to/kb"
assert_failure || exit 1
log_succ "Non-existent path correctly rejected"

# -------------------------------------------------------------------
# Test 5: Error - --offline without --source
# -------------------------------------------------------------------
log_info "Test 5: Error on --offline without --source"
TEST_DIR=$(setup_workspace "source-res-offline-nosrc")
cd "$TEST_DIR"
run_pair install --offline
assert_failure || exit 1
log_succ "Offline without source correctly rejected"

# -------------------------------------------------------------------
# Test 6: Install to custom target from local dir
# -------------------------------------------------------------------
log_info "Test 6: Install to custom target from local directory"
TEST_DIR=$(setup_workspace "source-res-custom-target")
cd "$TEST_DIR"
run_pair install ./my-docs --source "$MOCK_KB"
assert_success || exit 1
assert_dir "my-docs/.pair"
log_succ "Install to custom target from local dir succeeded"

echo "=== $TEST_NAME Completed ==="
