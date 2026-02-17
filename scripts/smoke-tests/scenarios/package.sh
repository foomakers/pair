#!/usr/bin/env bash
source "$(dirname "$0")/../lib/utils.sh"

TEST_NAME="Package Command Scenarios"
echo "=== Running $TEST_NAME ==="

# We need a source content to package.
# We can use the 'install-basic' output if it exists, or create one.
SRC_DIR=$(setup_workspace "package-test/source")
mkdir -p "$SRC_DIR/.pair/knowledge"
echo "# Test Doc" > "$SRC_DIR/.pair/knowledge/test.md"
# Create a config that matches the actual KB structure
# Use only the knowledge registry which we created
cat > "$SRC_DIR/config.json" << 'EOF'
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

OUT_DIR=$(setup_workspace "package-test/out")
cd "$OUT_DIR"

# 1. Basic Package
log_info "Test 1: Basic Package"
# We reference the valid source directory we just created
run_pair package --source-dir "$SRC_DIR" --output pkg-default.zip
assert_success || exit 1
assert_file "pkg-default.zip"

# Verify zip content (simple check)
if unzip -l pkg-default.zip | grep -q "manifest.json"; then
  log_succ "Zip contains manifest.json"
else
  log_fail "Zip missing manifest.json"
  exit 1
fi

# 2. Package with Metadata
log_info "Test 2: Package with Metadata"
# Note: Using simple values without spaces to avoid shell word splitting issues
run_pair package \
  --source-dir "$SRC_DIR" \
  --output "$OUT_DIR/pkg-meta.zip" \
  --name "TestKB" \
  --pkg-version "2.0.0" \
  --author "SmokeTest"
assert_success || exit 1
assert_file "$OUT_DIR/pkg-meta.zip"

# Extract and check manifest
rm -rf "$OUT_DIR/extracted"
mkdir -p "$OUT_DIR/extracted"
unzip -q "$OUT_DIR/pkg-meta.zip" -d "$OUT_DIR/extracted"
assert_contains "$OUT_DIR/extracted/manifest.json" '"name": "TestKB"'
assert_contains "$OUT_DIR/extracted/manifest.json" '"version": "2.0.0"'

# 3. Package validation failure (empty/invalid source)
# Note: With skipBaseConfig, an empty directory with no config.json will have no registries
# which means validation passes (no registries to validate). This is expected behavior.
# For a true validation failure test, we'd need a config.json pointing to non-existent paths.
log_info "Test 3: Validation Failure (Invalid Source)"
INVALID_DIR=$(setup_workspace "package-test/invalid")
mkdir -p "$INVALID_DIR/.pair/knowledge"
echo "test" > "$INVALID_DIR/.pair/knowledge/test.md"
cat > "$INVALID_DIR/config.json" << 'EOF'
{
  "asset_registries": {
    "knowledge": {
      "source": ".pair/knowledge",
      "target_path": ".pair/knowledge",
      "behavior": "mirror",
      "description": "Test"
    },
    "missing": {
      "source": ".pair/missing",
      "target_path": ".pair/missing",
      "behavior": "mirror",
      "description": "Missing registry"
    }
  }
}
EOF
# Validation should fail because 'missing' registry source path does not exist
run_pair package --source-dir "$INVALID_DIR" --output pkg-fail.zip
assert_failure || exit 1
log_succ "Validation correctly failed for invalid source"

# 4. Package with --org flags
log_info "Test 4: Organizational Package"
run_pair package \
  --source-dir "$SRC_DIR" \
  --output "$OUT_DIR/pkg-org.zip" \
  --org --org-name "AcmeCorp" --team "Platform" \
  --compliance "SOC2,ISO27001" --distribution "private"
assert_success || exit 1
assert_file "$OUT_DIR/pkg-org.zip"

# Extract and verify org metadata in manifest
rm -rf "$OUT_DIR/extracted-org"
mkdir -p "$OUT_DIR/extracted-org"
unzip -q "$OUT_DIR/pkg-org.zip" -d "$OUT_DIR/extracted-org"
assert_contains "$OUT_DIR/extracted-org/manifest.json" '"name": "AcmeCorp"'
assert_contains "$OUT_DIR/extracted-org/manifest.json" '"distribution": "private"'
assert_contains "$OUT_DIR/extracted-org/manifest.json" '"SOC2"'
log_succ "Organizational package created with org metadata"

# 5. kb-info on org package
log_info "Test 5: kb-info on Organizational Package"
run_pair kb-info "$OUT_DIR/pkg-org.zip"
assert_success || exit 1
assert_output_contains "AcmeCorp"
log_succ "kb-info displays org metadata"

# 6. kb-info --json on org package
log_info "Test 6: kb-info --json on Organizational Package"
run_pair kb-info "$OUT_DIR/pkg-org.zip" --json
assert_success || exit 1
assert_output_contains '"organization"'
log_succ "kb-info JSON output includes organization"

echo "=== $TEST_NAME Completed ==="
