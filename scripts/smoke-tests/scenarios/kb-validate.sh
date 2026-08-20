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

# Test 1: Source layout, real dataset, FULL validation (US-188 dogfood).
# This used to pass --ignore-config "to avoid pre-existing broken links": that flag
# consults no config, so no registry resolved, no file was collected and NOTHING was
# validated — the test could not fail. The dataset has no broken links today, so the
# real run is the assertion: structure + links + metadata on the shipped KB, and any
# link that legitimately points outside the KB tree is declared through
# link_validation.optional_link_patterns rather than switched off wholesale.
log_info "Test 1: Validate source layout, structure + links (real dataset)"
TEST_DIR=$(setup_workspace "kb-validate-source")
cd "$TEST_DIR"
run_pair kb-validate --path "$KB_SOURCE_PATH" --layout source
assert_success || exit 1
assert_output_contains "Link Validation:" || exit 1

# Test 2: Target layout validation after install
log_info "Test 2: Validate target layout after install"
TEST_DIR=$(setup_workspace "kb-validate-target")
cd "$TEST_DIR"
run_pair install --source "$KB_SOURCE_PATH"
assert_success || exit 1
run_pair kb-validate --layout target
assert_success || exit 1

# Test 3: Skip registries flag
log_info "Test 3: Validate with --skip-registries"
TEST_DIR=$(setup_workspace "kb-validate-skip")
cd "$TEST_DIR"
run_pair kb-validate --path "$KB_SOURCE_PATH" --layout source --skip-registries adoption
assert_success || exit 1

# Test 4: --ignore-config consults no config, so nothing is collected or validated:
# the run exits 0 without checking a single link (that is the flag's whole contract).
log_info "Test 4: Validate with --ignore-config"
TEST_DIR=$(setup_workspace "kb-validate-ignore")
cd "$TEST_DIR"
run_pair kb-validate --path "$KB_SOURCE_PATH" --ignore-config
assert_success || exit 1
# The green exit above is worthless on its own — no section means nothing was checked.
if grep -Fq "Link Validation:" "$TMP_DIR/last_cmd_output.log"; then
  log_fail "--ignore-config validated links: it must resolve no registry and collect no file"
  exit 1
fi
log_succ "--ignore-config emitted no Link Validation section (nothing collected)"
assert_output_contains "nothing validated" || exit 1

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
# into the codebase that normally sits beside it. Same fixture four ways:
# no patterns -> error, CLI pattern -> warning, config pattern -> warning, --strict -> error.
log_info "Test 6: Optional link patterns downgrade missing out-of-tree targets"
OPT_DIR=$(setup_workspace "kb-validate-optional-links")
cd "$OPT_DIR"

# The CLI merges its packaged base config, so every base registry must exist for
# STRUCTURE validation to pass — this test is about LINK validation, and an
# unrelated structure error would mask the behavior under test.
mkdir -p .pair/knowledge .pair/adoption .github .claude/skills .claude/workflows .claude/agents
touch AGENTS.md CLAUDE.md
cat > .pair/knowledge/index.md <<'EOF'
# Knowledge

See [the app code](../../apps/website/page.tsx).
EOF
echo '{}' > config.json

# 6a: baseline — the out-of-tree link is a hard error (backward compatible)
run_pair kb-validate
assert_failure || exit 1
assert_output_contains "Broken internal link: ../../apps/website/page.tsx" || exit 1

# 6b: the CLI flag downgrades it to a labelled warning
run_pair kb-validate --optional-link-patterns "../../apps/**"
assert_success || exit 1
assert_output_contains "optional link (pattern-matched)" || exit 1

# 6c: same rule declared in config.json instead of on the command line
cat > config.json <<'EOF'
{
  "link_validation": {
    "optional_link_patterns": ["apps/**"]
  }
}
EOF
run_pair kb-validate
assert_success || exit 1

# 6d: --strict overrides the configured pattern (zero tolerance preserved)
run_pair kb-validate --strict
assert_failure || exit 1

echo "=== $TEST_NAME Completed ==="
