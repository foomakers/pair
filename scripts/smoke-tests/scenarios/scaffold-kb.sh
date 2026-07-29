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
# Exact name, no wildcard: `install` resolves the CONSUMER's config, so the KB's own
# `skills.prefix` (acme-kb) does NOT apply — the skill lands under the default `pair-`
# prefix. Pinned deliberately; foomakers/pair#397 tracks honouring the source KB's
# registry declaration, and this assertion is what will flip when it lands.
assert_dir "$CONSUMER_DIR/.claude/skills/pair-example-skill" || exit 1
log_succ "Scaffolded KB installed into a separate project via --source"

# 5. The published ZIP is a distinct install form — pin its behavior ----------
# AC3 documents the ZIP as a distribution artifact, so the form must be exercised.
# HOME is isolated because `install --source <zip>` currently extracts into the
# version-keyed cache slot ~/.pair/kb/<cliVersion>/ shared with the OFFICIAL KB
# (foomakers/pair#395): with a real HOME this would contaminate every other project
# on the machine. The assertions below pin exactly that behavior so the fix is visible.
log_info "Test 6: A separate project installs the published release ZIP (isolated HOME)"
ZIP_CONSUMER_DIR=$(setup_workspace "scaffold-kb-test/zip-consumer")
ISOLATED_HOME=$(setup_workspace "scaffold-kb-test/isolated-home")
GENERIC_ZIP="$GENERIC_DIR/dist/generic-kb-1.0.0.zip"
assert_file "$GENERIC_ZIP" || exit 1

cd "$ZIP_CONSUMER_DIR"
REAL_HOME="$HOME"
export HOME="$ISOLATED_HOME"
run_pair install --source "$GENERIC_ZIP" --offline
ZIP_INSTALL_STATUS=$?
export HOME="$REAL_HOME"

if [ "$ZIP_INSTALL_STATUS" -ne 0 ]; then
  log_fail "install --source <release ZIP> failed (exit $ZIP_INSTALL_STATUS)"
  exit 1
fi
assert_file "$ZIP_CONSUMER_DIR/.pair/knowledge/README.md" || exit 1
assert_dir "$ZIP_CONSUMER_DIR/.claude/skills/pair-example-skill" || exit 1
# Documented limitation, asserted rather than assumed: the external KB took over the
# official KB's cache slot. foomakers/pair#395 must make this assertion fail.
if ! grep -Fq '"generic-kb"' "$ISOLATED_HOME/.pair/kb/"*/manifest.json 2>/dev/null; then
  log_fail "Expected the external KB manifest in the shared cache slot (see foomakers/pair#395)"
  find "$ISOLATED_HOME/.pair" -maxdepth 3 2>/dev/null || true
  exit 1
fi
log_succ "Release ZIP installs (pinned: it occupies the official KB cache slot, #395)"

echo "=== $TEST_NAME Completed ==="
