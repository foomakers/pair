#!/usr/bin/env bash
source "$(dirname "$0")/../lib/utils.sh"

OFFLINE_SAFE=true

TEST_NAME="External KB Scaffold (scaffold-kb)"
echo "=== Running $TEST_NAME ==="

# Works both under run-all.sh (TMP_DIR exported) and standalone
ensure_tmp_dir

# 1. Scaffold a pure KB repo -------------------------------------------------
KB_DIR=$(setup_workspace "scaffold-kb-test/acme-kb")
WORK_DIR=$(setup_workspace "scaffold-kb-test/work")
cd "$WORK_DIR"

log_info "Test 1: Scaffold a KB repo"
run_pair scaffold-kb "$KB_DIR"
assert_success || exit 1

assert_file "$KB_DIR/pair.config.json" || exit 1
assert_file "$KB_DIR/README.md" || exit 1
assert_file "$KB_DIR/.gitignore" || exit 1
assert_file "$KB_DIR/scripts/release.sh" || exit 1
assert_file "$KB_DIR/.github/workflows/release.yml" || exit 1
assert_file "$KB_DIR/.pair/knowledge/README.md" || exit 1
assert_file "$KB_DIR/.skills/example-skill/SKILL.md" || exit 1
assert_contains "$KB_DIR/.gitignore" "dist/" || exit 1
assert_contains "$KB_DIR/pair.config.json" '"acme-kb"' || exit 1

# A KB is knowledge, not a configured project
if [ -d "$KB_DIR/.pair/adoption" ]; then
  log_fail "Scaffold created .pair/adoption (a KB must not carry adoption files)"
  exit 1
fi
log_succ "No .pair/adoption in the scaffolded KB"

# 2. Idempotent re-scaffold --------------------------------------------------
log_info "Test 2: Re-scaffold is idempotent and preserves authored content"
echo "# my own guideline" > "$KB_DIR/.pair/knowledge/mine.md"
echo "# hand-authored" > "$KB_DIR/.pair/knowledge/README.md"
printf 'dist/\nmy-own-rule\n' > "$KB_DIR/.gitignore"
CONFIG_BEFORE=$(cat "$KB_DIR/pair.config.json")

run_pair scaffold-kb "$KB_DIR"
assert_success || exit 1

assert_file "$KB_DIR/.pair/knowledge/mine.md" || exit 1
assert_contains "$KB_DIR/.pair/knowledge/README.md" "hand-authored" || exit 1
assert_contains "$KB_DIR/.gitignore" "my-own-rule" || exit 1
if [ "$CONFIG_BEFORE" != "$(cat "$KB_DIR/pair.config.json")" ]; then
  log_fail "Re-scaffold rewrote an unchanged pair.config.json"
  exit 1
fi
log_succ "Re-scaffold left authored content and unchanged files alone"

log_info "Test 3: --force regenerates scaffold-owned files only"
run_pair scaffold-kb "$KB_DIR" --force
assert_success || exit 1
if grep -Fq "my-own-rule" "$KB_DIR/.gitignore"; then
  log_fail "--force did not regenerate .gitignore"
  exit 1
fi
assert_contains "$KB_DIR/.pair/knowledge/README.md" "hand-authored" || exit 1
log_succ "--force regenerated .gitignore and still kept KB content"

# 3. Generated release script packages the KB (degraded, no code host) -------
log_info "Test 4: Generated release script produces the ZIP (generic host)"
GENERIC_DIR=$(setup_workspace "scaffold-kb-test/generic-kb")
run_pair scaffold-kb "$GENERIC_DIR" --host generic --name generic-kb
assert_success || exit 1

if [ -f "$GENERIC_DIR/.github/workflows/release.yml" ]; then
  log_fail "Generic host generated a GitHub Actions workflow"
  exit 1
fi

cd "$GENERIC_DIR"
# PAIR_CLI points at the CLI under test, so the script never reaches the network
if ! PAIR_CLI="$TEST_BINARY" bash scripts/release.sh 1.0.0 > "$TMP_DIR/release-script.log" 2>&1; then
  log_fail "Generated release script failed"
  cat "$TMP_DIR/release-script.log"
  exit 1
fi
assert_file "$GENERIC_DIR/dist/generic-kb-1.0.0.zip" || exit 1
assert_contains "$TMP_DIR/release-script.log" "publish it however your org does" || exit 1
log_succ "Release script packaged the KB and documented the ZIP location"

# The GitHub-host script keeps publishing out of the CLI, in the script
assert_contains "$KB_DIR/scripts/release.sh" 'gh release create' || exit 1

# 4. Round-trip: a separate project installs the scaffolded KB ---------------
log_info "Test 5: A separate project installs the scaffolded KB"
CONSUMER_DIR=$(setup_workspace "scaffold-kb-test/consumer")
cd "$CONSUMER_DIR"
run_pair install --source "$KB_DIR" --offline
assert_success || exit 1
assert_file "$CONSUMER_DIR/.pair/knowledge/mine.md" || exit 1
if ! find "$CONSUMER_DIR/.claude/skills" -maxdepth 1 -name '*example-skill' | grep -q .; then
  log_fail "Scaffolded skill not installed under .claude/skills"
  ls -la "$CONSUMER_DIR/.claude/skills" 2>/dev/null || true
  exit 1
fi
log_succ "Scaffolded KB installed into a separate project via --source"

echo "=== $TEST_NAME Completed ==="
