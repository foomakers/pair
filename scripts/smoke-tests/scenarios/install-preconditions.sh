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
  mkdir -p "$MOCK_SOURCE/.pair/knowledge" "$MOCK_SOURCE/.pair/adoption"
  echo "# KB" > "$MOCK_SOURCE/.pair/knowledge/README.md"
  echo "# Adoption" > "$MOCK_SOURCE/.pair/adoption/README.md"
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

# Repo with the user's own agent files (US-552)
own_repo() {
  echo "own agents" > AGENTS.md
  echo "own claude" > CLAUDE.md
  mkdir -p .claude
  echo '{"own":true}' > .claude/settings.json
  echo "code" > app.js
}
assert_own_untouched() {
  [ "$(cat AGENTS.md)" = "own agents" ] && [ "$(cat CLAUDE.md)" = "own claude" ] \
    && [ "$(cat .claude/settings.json)" = '{"own":true}' ] || { log_fail "own files changed"; return 1; }
  log_succ "Own files byte-identical"
}

# ─── Test 4: own AGENTS.md/CLAUDE.md, no flags → refused, nothing written ──
log_info "Test 4: install on a repo with own agent files is refused"

TEST_DIR=$(setup_workspace "precond-own-files-refused")
cd "$TEST_DIR"
own_repo
run_pair install $CMD_ARGS
assert_failure || exit 1
assert_output_contains "already exists" || exit 1
assert_own_untouched || exit 1
assert_no_file "$TEST_DIR/.pair" || exit 1

# ─── Test 5: --skip-registries agents keeps own files, installs the rest ──
log_info "Test 5: --skip-registries agents installs around own files"

TEST_DIR=$(setup_workspace "precond-own-files-skip")
cd "$TEST_DIR"
own_repo
run_pair install $CMD_ARGS --skip-registries agents
assert_success || exit 1
assert_own_untouched || exit 1
assert_dir "$TEST_DIR/.pair" || exit 1

run_pair install $CMD_ARGS --skip-registries nope
assert_failure || exit 1
assert_output_contains "agents" || exit 1

# ─── Test 6: lone own CLAUDE.md is never overwritten silently ──────
log_info "Test 6: lone own CLAUDE.md refused, kept with --skip-registries agents"

TEST_DIR=$(setup_workspace "precond-lone-claude")
cd "$TEST_DIR"
echo "own claude" > CLAUDE.md
mkdir -p .claude && echo "own" > .claude/own.md
run_pair install $CMD_ARGS
assert_failure || exit 1
assert_no_file "$TEST_DIR/.pair" || exit 1
assert_no_file "$TEST_DIR/AGENTS.md" || exit 1

run_pair install $CMD_ARGS --skip-registries agents
assert_success || exit 1
[ "$(cat CLAUDE.md)" = "own claude" ] || { log_fail "CLAUDE.md changed"; exit 1; }
log_succ "CLAUDE.md untouched"

# ─── Test 7: keep choice persisted, honoured by update (O1) ─────────
log_info "Test 7: install(keep) -> pair.config.json -> update keeps own files"

TEST_DIR=$(setup_workspace "precond-keep-persisted")
cd "$TEST_DIR"
own_repo
run_pair install $CMD_ARGS --skip-registries agents
assert_success || exit 1
grep -q '"skipRegistries"' pair.config.json && grep -q '"agents"' pair.config.json \
  || { log_fail "skipRegistries not persisted"; exit 1; }
run_pair update $CMD_ARGS
assert_success || exit 1
assert_output_contains "skipping agents (from pair.config.json)" || exit 1
assert_own_untouched || exit 1

# ─── Test 8: removing the exclusion opts back in ───────────────────
log_info "Test 8: remove agents from skipRegistries -> update installs pair's files"

echo '{"skipRegistries": []}' > pair.config.json
run_pair update $CMD_ARGS
assert_success || exit 1
[ "$(cat AGENTS.md)" != "own agents" ] || { log_fail "AGENTS.md not updated after opt-in"; exit 1; }
log_succ "Opt-in installed pair's AGENTS.md"

echo "=== $TEST_NAME Completed ==="
