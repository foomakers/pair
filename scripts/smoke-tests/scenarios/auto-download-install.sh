#!/usr/bin/env bash
set -euo pipefail

# Smoke test: verify `pair install` without --source auto-downloads from GitHub releases.
# Requires network access and a published release matching the CLI version.

OFFLINE_SAFE=false

source "$(dirname "$0")/../lib/utils.sh"

TEST_NAME="Auto-Download Install (no --source)"
echo "=== Running $TEST_NAME ==="

ensure_tmp_dir

# ── Test: pair install without --source ──────────────────────────────
log_info "Test: pair install with default resolution (auto-download)"

TEST_DIR=$(setup_workspace "auto-download-install")
cd "$TEST_DIR"

# Clear any KB cache to force a fresh download
rm -rf "$HOME/.pair/kb" 2>/dev/null || true

run_pair install
STATUS=$?

if [ $STATUS -eq 0 ]; then
  assert_dir ".pair"
  log_succ "Auto-download install succeeded"
else
  log_fail "Auto-download install failed (exit $STATUS). Requires network + published release."
  exit 1
fi

echo "=== $TEST_NAME Completed ==="
