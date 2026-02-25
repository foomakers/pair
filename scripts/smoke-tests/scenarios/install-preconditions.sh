#!/usr/bin/env bash
source "$(dirname "$0")/../lib/utils.sh"

OFFLINE_SAFE=true
TEST_NAME="Install/Update Preconditions (BUG 4)"
echo "=== Running $TEST_NAME ==="

# Setup Source
SOURCE_PATH="$KB_SOURCE_PATH"

if [ -z "$SOURCE_PATH" ]; then
  MOCK_SOURCE=$(setup_workspace "mock-kb-precond")
  mkdir -p "$MOCK_SOURCE/.pair"
  mkdir -p "$MOCK_SOURCE/.github"
  echo "# Mock KB" > "$MOCK_SOURCE/.pair/README.md"
  echo "# Mock GitHub" > "$MOCK_SOURCE/.github/README.md"
  echo "# Agents" > "$MOCK_SOURCE/AGENTS.md"
  SOURCE_PATH="$MOCK_SOURCE"
  log_info "Using generated mock KB source at $SOURCE_PATH"
fi

CMD_ARGS="--source $SOURCE_PATH --offline"

# ─── Test 1: Second install must fail ───────────────────────────────
log_info "Test 1: Second install on already-installed project must fail"

TEST_DIR=$(setup_workspace "precond-double-install")
cd "$TEST_DIR"

# First install — must succeed
run_pair install $CMD_ARGS
assert_success || exit 1
log_succ "First install succeeded"

# Second install — BUG: currently succeeds, should fail
run_pair install $CMD_ARGS
assert_failure || exit 1
log_succ "Second install correctly rejected"

# ─── Test 2: Update without prior install must fail ─────────────────
log_info "Test 2: Update on fresh project (never installed) must fail"

TEST_DIR=$(setup_workspace "precond-update-fresh")
cd "$TEST_DIR"

# Update without prior install — BUG: currently succeeds, should fail
run_pair update $CMD_ARGS
assert_failure || exit 1
log_succ "Update on fresh project correctly rejected"

# ─── Test 3: Correct flow (install then update) must succeed ────────
log_info "Test 3: Install then update (correct flow) must succeed"

TEST_DIR=$(setup_workspace "precond-correct-flow")
cd "$TEST_DIR"

run_pair install $CMD_ARGS
assert_success || exit 1
log_succ "Install succeeded"

run_pair update $CMD_ARGS
assert_success || exit 1
log_succ "Update after install succeeded"

echo "=== $TEST_NAME Completed ==="
