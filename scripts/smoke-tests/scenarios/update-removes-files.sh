#!/usr/bin/env bash
# #543 AC3 + AC6 — `update` removes a file the newer KB no longer ships (mirror registry), keeps
# `.pair/adoption` edits (add registry); corrupt ZIP / registry-less source fail loudly.
# Hermetic: local packages only, no network.
OFFLINE_SAFE=true

source "$(dirname "$0")/../lib/utils.sh"

TEST_NAME="update removes dropped files; error paths exit non-zero"
echo "=== Running $TEST_NAME ==="
ensure_packaged_cli || log_warn "Proceeding without packaged CLI"

WS=$(setup_workspace "update-removes")
DEV="$WS/dev"
CLIENT="$WS/client"
mkdir -p "$DEV/.pair/knowledge" "$DEV/.pair/adoption" "$CLIENT"

cat >"$DEV/config.json" <<'JSON'
{
  "asset_registries": {
    "knowledge": { "source": ".pair/knowledge", "target_path": ".pair/knowledge", "behavior": "mirror", "description": "KB" },
    "adoption": { "source": ".pair/adoption", "target_path": ".pair/adoption", "behavior": "add", "description": "Adoption" }
  }
}
JSON
echo "keep" >"$DEV/.pair/knowledge/keep.md"
echo "dropped" >"$DEV/.pair/knowledge/dropped.md"
echo "seed" >"$DEV/.pair/adoption/seed.md"

log_info "Package v1 (keep.md + dropped.md), install into client"
cd "$DEV" || exit 1
run_pair package --source-dir "$DEV" --output "$WS/kb-v1.zip" --pkg-version 1.0.0
assert_success || exit 1
cd "$CLIENT" || exit 1
run_pair install --no-kb --offline --source "$WS/kb-v1.zip"
assert_success || exit 1
assert_file ".pair/knowledge/dropped.md" || exit 1

echo "my adoption edit" >.pair/adoption/seed.md

log_info "Package v2 without dropped.md, update client"
rm "$DEV/.pair/knowledge/dropped.md"
echo "keep v2" >"$DEV/.pair/knowledge/keep.md"
cd "$DEV" || exit 1
run_pair package --source-dir "$DEV" --output "$WS/kb-v2.zip" --pkg-version 2.0.0
assert_success || exit 1
cd "$CLIENT" || exit 1
run_pair update --no-kb --offline --source "$WS/kb-v2.zip"
assert_success || exit 1
assert_contains ".pair/knowledge/keep.md" "keep v2" || exit 1
assert_no_file ".pair/knowledge/dropped.md" || exit 1
assert_contains ".pair/adoption/seed.md" "my adoption edit" || exit 1

log_info "Corrupt ZIP: kb-verify and kb-info exit non-zero"
echo "not a zip" >"$WS/corrupt.zip"
if run_pair kb-verify "$WS/corrupt.zip"; then log_fail "kb-verify accepted a corrupt ZIP"; exit 1; fi
if run_pair kb-info "$WS/corrupt.zip"; then log_fail "kb-info accepted a corrupt ZIP"; exit 1; fi

log_info "install --source with no registries: exit 1"
mkdir -p "$WS/empty-src" "$WS/fresh"
echo x >"$WS/empty-src/a.md"
cd "$WS/fresh" || exit 1
rc=0
run_pair install --no-kb --offline --source "$WS/empty-src" || rc=$?
[ "$rc" = "1" ] || { log_fail "expected exit 1, got $rc"; exit 1; }

echo "=== $TEST_NAME Passed ==="
