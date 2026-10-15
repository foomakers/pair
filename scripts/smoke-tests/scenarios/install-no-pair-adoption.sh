#!/usr/bin/env bash
# #550 AC1 — a fresh install from the dataset ships no pair-project adoption (#549: automation.md,
# decision-log entries, `mirrors:regenerate`). Hermetic: local dataset, offline.
OFFLINE_SAFE=true

source "$(dirname "$0")/../lib/utils.sh"

TEST_NAME="fresh install ships no pair-project adoption"
echo "=== Running $TEST_NAME ==="
ensure_packaged_cli || log_warn "Proceeding without packaged CLI"

SOURCE_PATH="${KB_SOURCE_PATH:-$REPO_ROOT/packages/knowledge-hub/dataset}"
WS=$(setup_workspace "install-no-pair-adoption")
cd "$WS" || exit 1

run_pair install --source "$SOURCE_PATH" --offline
assert_success || exit 1
assert_dir ".pair/adoption" || exit 1
assert_no_file ".pair/adoption/tech/automation.md" || exit 1
# decision-log/ may ship as an empty placeholder (.keep) — never with entries
if [ -n "$(find .pair/adoption/decision-log -type f ! -name .keep 2>/dev/null)" ]; then
  log_fail "decision-log entries leaked into .pair/adoption"
  exit 1
fi
log_succ "decision-log has no entries"

if grep -rFl "mirrors:regenerate" .pair/adoption; then
  log_fail "pair-project 'mirrors:regenerate' leaked into .pair/adoption"
  exit 1
fi
log_succ "No 'mirrors:regenerate' in .pair/adoption"

echo "=== $TEST_NAME Passed ==="
