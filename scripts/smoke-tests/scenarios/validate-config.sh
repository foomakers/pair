#!/usr/bin/env bash
source "$(dirname "$0")/../lib/utils.sh"

TEST_NAME="Validate Config Scenarios"
echo "=== Running $TEST_NAME ==="

TEST_DIR=$(setup_workspace "validate-config")
cd "$TEST_DIR"

# 1. Valid Config
log_info "Test 1: Valid Configuration"
cat > config.json <<EOF
{
  "asset_registries": {
    "knowledge": {
      "source": ".pair/knowledge",
      "target_path": ".pair/knowledge",
      "behavior": "mirror",
      "description": "Knowledge base and documentation"
    }
  }
}
EOF
run_pair validate-config
assert_success || exit 1

# 2. Invalid Config (Missing required field)
log_info "Test 2: Invalid Configuration (Schema)"
cat > invalid-config.json <<EOF
{
  "asset_registries": {
    "knowledge": {
      "source": ".pair/knowledge",
      "target_path": ".pair/knowledge"
    }
  }
}
EOF
# Missing behavior and description - should fail validation
run_pair validate-config --config invalid-config.json
assert_failure || exit 1
assert_output_contains "validation"

# 3. Invalid Config (Invalid Enum)
log_info "Test 3: Invalid Configuration (Enum)"
cat > invalid-enum.json <<EOF
{
  "asset_registries": {
    "knowledge": {
      "source": ".pair/knowledge",
      "target_path": ".pair/knowledge",
      "behavior": "destroy",
      "description": "Test"
    }
  }
}
EOF
run_pair validate-config --config invalid-enum.json
assert_failure || exit 1

echo "=== $TEST_NAME Completed ==="
