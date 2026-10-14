#!/usr/bin/env bash
# #543 T-8 — `pair tokens` and `pair kb-cache` run for real in a scratch project with an
# isolated HOME (the cache lives under ~/.pair/kb). Hermetic: no network.
OFFLINE_SAFE=true

source "$(dirname "$0")/../lib/utils.sh"

TEST_NAME="tokens and kb-cache"
echo "=== Running $TEST_NAME ==="
ensure_packaged_cli || log_warn "Proceeding without packaged CLI"

WS=$(setup_workspace "inspect-commands")
mkdir -p "$WS/home" "$WS/proj/.pair/adoption"
echo "hello world" >"$WS/proj/.pair/adoption/a.md"
export HOME="$WS/home"
cd "$WS/proj" || exit 1

log_info "tokens --json counts the adoption file"
run_pair tokens --json
assert_success || exit 1
assert_output_contains '"name": "adoption"' || exit 1
assert_output_contains '"words": 2' || exit 1

log_info "kb-cache list/prune on an empty cache"
run_pair kb-cache list --json
assert_success || exit 1
assert_output_contains '"entries": []' || exit 1
run_pair kb-cache prune --dry-run
assert_success || exit 1
assert_output_contains "0 entries, 0 B would be freed." || exit 1

echo "=== $TEST_NAME Passed ==="
