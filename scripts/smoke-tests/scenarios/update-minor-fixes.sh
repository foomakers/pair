#!/usr/bin/env bash
# #550 AC3-5 — `update --persist-backup` keeps .pair/backups, `update-link --dry-run` changes nothing,
# `kb-info` names a corrupt ZIP (#549). Hermetic: local dataset, offline.
OFFLINE_SAFE=true

source "$(dirname "$0")/../lib/utils.sh"

TEST_NAME="update --persist-backup, update-link --dry-run, kb-info corrupt ZIP"
echo "=== Running $TEST_NAME ==="
ensure_packaged_cli || log_warn "Proceeding without packaged CLI"

SOURCE_PATH="${KB_SOURCE_PATH:-$REPO_ROOT/packages/knowledge-hub/dataset}"
WS=$(setup_workspace "update-minor-fixes")
mkdir -p "$WS/project"
cd "$WS/project" || exit 1

run_pair install --source "$SOURCE_PATH" --offline
assert_success || exit 1

log_info "AC3: update --persist-backup keeps .pair/backups (none without the flag)"
run_pair update --source "$SOURCE_PATH" --offline
assert_success || exit 1
[ -z "$(ls -A .pair/backups 2>/dev/null)" ] || { log_fail "backup kept without --persist-backup"; exit 1; }
run_pair update --source "$SOURCE_PATH" --offline --persist-backup
assert_success || exit 1
[ -n "$(ls -A .pair/backups 2>/dev/null)" ] || { log_fail ".pair/backups empty after --persist-backup"; exit 1; }
log_succ "Backup retained"

log_info "AC4: update-link --dry-run exits 0, prints, changes nothing"
BEFORE=$(find . -type f -not -path './apps/*' -exec cksum {} + | sort)
run_pair update-link --dry-run
assert_success || exit 1
assert_output_contains "No changes" || exit 1
AFTER=$(find . -type f -not -path './apps/*' -exec cksum {} + | sort)
[ "$BEFORE" = "$AFTER" ] || { log_fail "update-link --dry-run modified files"; exit 1; }

log_info "AC5: kb-info on a corrupt ZIP exits 1 and names the path"
echo "not a zip" >"$WS/corrupt.zip"
rc=0
run_pair kb-info "$WS/corrupt.zip" || rc=$?
[ "$rc" = "1" ] || { log_fail "expected exit 1, got $rc"; exit 1; }
assert_output_contains "Invalid ZIP archive: $WS/corrupt.zip" || exit 1

echo "=== $TEST_NAME Passed ==="
