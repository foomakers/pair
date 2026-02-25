#!/usr/bin/env bash
source "$(dirname "$0")/../lib/utils.sh"

OFFLINE_SAFE=true
ensure_tmp_dir

TEST_NAME="KB Validate Scenarios"
echo "=== Running $TEST_NAME ==="

KB_SOURCE_PATH="${KB_SOURCE_PATH:-$(realpath "$(dirname "$0")/../../../packages/knowledge-hub/dataset")}"

if [ ! -d "$KB_SOURCE_PATH/.pair" ]; then
  log_fail "KB source path missing .pair directory: $KB_SOURCE_PATH"
  exit 1
fi

# Test 1: Source layout structure validation (skip link checking with --ignore-config
# to avoid failures from pre-existing broken links in the real dataset)
log_info "Test 1: Validate source layout structure (real dataset)"
TEST_DIR=$(setup_workspace "kb-validate-source")
cd "$TEST_DIR"
run_pair kb-validate --path "$KB_SOURCE_PATH" --layout source --ignore-config
assert_success || exit 1

# Test 2: Target layout validation after install
log_info "Test 2: Validate target layout after install"
TEST_DIR=$(setup_workspace "kb-validate-target")
cd "$TEST_DIR"
run_pair install --source "$KB_SOURCE_PATH"
assert_success || exit 1
run_pair kb-validate --layout target --ignore-config
assert_success || exit 1

# Test 3: Skip registries flag
log_info "Test 3: Validate with --skip-registries"
TEST_DIR=$(setup_workspace "kb-validate-skip")
cd "$TEST_DIR"
run_pair kb-validate --path "$KB_SOURCE_PATH" --layout source --skip-registries adoption --ignore-config
assert_success || exit 1

# Test 4: Ignore config flag
log_info "Test 4: Validate with --ignore-config"
TEST_DIR=$(setup_workspace "kb-validate-ignore")
cd "$TEST_DIR"
run_pair kb-validate --path "$KB_SOURCE_PATH" --ignore-config
assert_success || exit 1

# Test 5: Validation failure on missing registry paths
log_info "Test 5: Validation detects missing registry paths"
BAD_DIR=$(setup_workspace "kb-validate-bad")
cd "$BAD_DIR"
mkdir -p .pair
cat > config.json <<EOF
{
  "asset_registries": {
    "skills": {
      "source": ".skills",
      "behavior": "mirror",
      "description": "Test",
      "targets": [
        {"path": ".claude/skills", "mode": "canonical"}
      ]
    }
  }
}
EOF
run_pair kb-validate
assert_failure || exit 1

echo "=== $TEST_NAME Completed ==="
