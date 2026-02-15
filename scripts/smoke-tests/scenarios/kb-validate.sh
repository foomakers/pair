#!/usr/bin/env bash
source "$(dirname "$0")/../lib/utils.sh"

OFFLINE_SAFE=true

TEST_NAME="KB Validate Scenarios"
echo "=== Running $TEST_NAME ==="

# Test 1: Source layout validation on real dataset
log_info "Test 1: Validate source layout (real dataset)"
KB_SOURCE_PATH="${KB_SOURCE_PATH:-$(realpath "$(dirname "$0")/../../../packages/knowledge-hub/dataset")}"

if [ ! -d "$KB_SOURCE_PATH/.pair" ]; then
  log_error "KB source path missing .pair directory: $KB_SOURCE_PATH"
  exit 1
fi

run_pair kb validate --path "$KB_SOURCE_PATH" --layout source
assert_success || exit 1

# Test 2: Target layout validation after install
log_info "Test 2: Validate target layout after install"
TEST_DIR=$(setup_workspace "kb-validate-target")
cd "$TEST_DIR"

# Install KB to workspace
KB_SOURCE_PATH="$KB_SOURCE_PATH" run_pair install
assert_success || exit 1

# Validate installed KB in target layout
run_pair kb validate --layout target
assert_success || exit 1

# Test 3: Skip registries flag
log_info "Test 3: Validate with --skip-registries"
run_pair kb validate --path "$KB_SOURCE_PATH" --layout source --skip-registries adoption
assert_success || exit 1

# Test 4: Ignore config flag
log_info "Test 4: Validate with --ignore-config"
run_pair kb validate --path "$KB_SOURCE_PATH" --ignore-config
assert_success || exit 1

# Test 5: Validation failure on missing registry paths
log_info "Test 5: Validation detects missing registry paths"
BAD_DIR=$(setup_workspace "kb-validate-bad")
cd "$BAD_DIR"

# Create minimal .pair with config but missing actual registry directories
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

# Validate should fail (structure validation detects missing source)
run_pair kb validate
assert_failure || exit 1

echo "=== $TEST_NAME Completed ==="
