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

# Test 6: Optional link patterns (US-188) — a KB validated on its own still links
# into the codebase that normally sits beside it. Same fixture three ways:
# no patterns → error, config/CLI patterns → warning, --strict → error again.
log_info "Test 6: Optional link patterns downgrade missing out-of-tree targets"
OPT_DIR=$(setup_workspace "kb-validate-optional-links")
cd "$OPT_DIR"
mkdir -p .pair/knowledge
cat > .pair/knowledge/index.md <<'EOF'
# Knowledge

See [the app code](../../apps/website/page.tsx).
EOF
cat > config.json <<EOF
{
  "asset_registries": {
    "knowledge": {
      "source": ".pair/knowledge",
      "behavior": "mirror",
      "description": "KB content",
      "targets": [
        {"path": ".pair/knowledge", "mode": "canonical"}
      ]
    }
  }
}
EOF

# 6a: baseline — the out-of-tree link is a hard error (backward compatible)
run_pair kb-validate
assert_failure || exit 1

# 6b: CLI flag downgrades it to a labelled warning
run_pair kb-validate --optional-link-patterns "../../apps/**"
assert_success || exit 1
assert_output_contains "optional link (pattern-matched)" || exit 1

# 6c: same pattern declared in config.json instead of on the command line
cat > config.json <<EOF
{
  "link_validation": {
    "optional_link_patterns": ["apps/**"]
  },
  "asset_registries": {
    "knowledge": {
      "source": ".pair/knowledge",
      "behavior": "mirror",
      "description": "KB content",
      "targets": [
        {"path": ".pair/knowledge", "mode": "canonical"}
      ]
    }
  }
}
EOF
run_pair kb-validate
assert_success || exit 1

# 6d: --strict overrides the configured pattern
run_pair kb-validate --strict
assert_failure || exit 1

echo "=== $TEST_NAME Completed ==="
