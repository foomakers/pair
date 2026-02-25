#!/usr/bin/env bash
set -euo pipefail

# Smoke test: verify `pair update` without --source auto-downloads from GitHub releases.
# Requires network access and a published release matching the CLI version.

OFFLINE_SAFE=false

source "$(dirname "$0")/../lib/utils.sh"

TEST_NAME="Auto-Download Update (no --source)"
echo "=== Running $TEST_NAME ==="

ensure_tmp_dir

# ── Pre-seed with a local install ────────────────────────────────────
log_info "Pre-seeding workspace with local install"

TEST_DIR=$(setup_workspace "auto-download-update")
cd "$TEST_DIR"

if [ -z "${KB_SOURCE_PATH:-}" ]; then
  log_fail "KB_SOURCE_PATH required for pre-seeding. Set it to the local KB dataset path."
  exit 1
fi

run_pair install --source "$KB_SOURCE_PATH" --offline
if [ $? -ne 0 ]; then
  log_fail "Pre-seed install failed"
  exit 1
fi
assert_dir ".pair"
log_succ "Pre-seed install succeeded"

# ── Test: pair update without --source ───────────────────────────────
log_info "Test: pair update with default resolution (auto-download)"

# Clear KB cache to force a fresh download
rm -rf "$HOME/.pair/kb" 2>/dev/null || true

run_pair update
STATUS=$?

if [ $STATUS -eq 0 ]; then
  assert_dir ".pair"
  log_succ "Auto-download update succeeded"
else
  log_fail "Auto-download update failed (exit $STATUS). Requires network + published release."
  exit 1
fi

echo "=== $TEST_NAME Completed ==="
