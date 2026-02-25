#!/usr/bin/env bash
set -euo pipefail

# Smoke test: verify the release bundle produced by package-manual.sh does not contain
# the KB dataset in bundle-cli/.
#
# The dataset is distributed as a separate artifact (knowledge-base-{VERSION}.zip)
# and auto-downloaded on first use. Embedding it in the CLI bundle would waste ~5 MB,
# mask the auto-download path, and duplicate content already available in the release.

OFFLINE_SAFE=true

source "$(dirname "$0")/../lib/utils.sh"

TEST_NAME="Bundle Content Validation (no embedded dataset)"
echo "=== Running $TEST_NAME ==="

if [ -z "${REPO_ROOT:-}" ]; then
  REPO_ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
fi
ensure_tmp_dir

PACKAGE_SCRIPT="$REPO_ROOT/scripts/workflows/release/package-manual.sh"

# Use a fixed version to avoid collisions with the main packaged artifact
VERSION="bundle-content-check"
RELEASE_DIR="$REPO_ROOT/release/pair-cli-manual-$VERSION"
ZIP_PATH="$REPO_ROOT/release/pair-cli-manual-$VERSION.zip"

# Cleanup any previous run
rm -rf "$RELEASE_DIR" "$ZIP_PATH" "${ZIP_PATH}.sha256"

# ── Test 1: Build release package ─────────────────────────────────────
log_info "Test 1: Build release package"

if ! "$PACKAGE_SCRIPT" "$VERSION"; then
  log_fail "package-manual.sh failed"
  rm -rf "$RELEASE_DIR" "$ZIP_PATH" "${ZIP_PATH}.sha256"
  exit 1
fi

if [ ! -f "$ZIP_PATH" ]; then
  log_fail "Expected ZIP not found: $ZIP_PATH"
  rm -rf "$RELEASE_DIR"
  exit 1
fi
log_succ "Package created: $ZIP_PATH"

# ── Test 2: No dataset in bundle ───────────────────────────────────────
log_info "Test 2: Verify bundle-cli/dataset/ is NOT in the ZIP"

DATASET_COUNT=$(unzip -l "$ZIP_PATH" | grep -c "bundle-cli/dataset/" || true)

if [ "$DATASET_COUNT" -gt 0 ]; then
  log_fail "bundle-cli/dataset/ found in ZIP ($DATASET_COUNT entries). Dataset must NOT be in the release bundle."
  unzip -l "$ZIP_PATH" | grep "bundle-cli/dataset/" | head -10
  rm -rf "$RELEASE_DIR" "$ZIP_PATH" "${ZIP_PATH}.sha256"
  exit 1
fi
log_succ "No dataset directory in bundle (0 entries)"

# ── Test 3: Essential files present ────────────────────────────────────
log_info "Test 3: Verify essential bundle files are present"

ESSENTIAL=(
  "bundle-cli/index.js"
  "bin/pair-cli"
  "pair-cli"
  "pair-cli.cmd"
  "package.json"
  "config.json"
)

MISSING=0
for f in "${ESSENTIAL[@]}"; do
  if ! unzip -l "$ZIP_PATH" | grep "pair-cli-manual-$VERSION/$f" > /dev/null 2>&1; then
    log_fail "Missing essential file: $f"
    MISSING=$((MISSING + 1))
  fi
done

if [ "$MISSING" -gt 0 ]; then
  rm -rf "$RELEASE_DIR" "$ZIP_PATH" "${ZIP_PATH}.sha256"
  exit 1
fi
log_succ "All ${#ESSENTIAL[@]} essential files present"

# ── Test 4: Bundle size reasonable ─────────────────────────────────────
log_info "Test 4: Verify bundle size is reasonable without dataset"

# Portable stat: macOS uses -f%z, Linux uses -c%s
ZIP_SIZE=$(stat -f%z "$ZIP_PATH" 2>/dev/null || stat -c%s "$ZIP_PATH" 2>/dev/null)
MAX_BYTES=$((1536 * 1024))  # 1.5 MB — without dataset the bundle is ~1 MB

if [ "$ZIP_SIZE" -gt "$MAX_BYTES" ]; then
  SIZE_MB=$(echo "scale=1; $ZIP_SIZE / 1048576" | bc 2>/dev/null || echo "$((ZIP_SIZE / 1048576))")
  log_fail "Bundle too large: ${SIZE_MB} MB (max 1.5 MB). Dataset may be accidentally included."
  rm -rf "$RELEASE_DIR" "$ZIP_PATH" "${ZIP_PATH}.sha256"
  exit 1
fi
log_succ "Bundle size OK: $((ZIP_SIZE / 1024)) KB (limit 1536 KB)"

# ── Cleanup ────────────────────────────────────────────────────────────
rm -rf "$RELEASE_DIR" "$ZIP_PATH" "${ZIP_PATH}.sha256"

echo "=== $TEST_NAME Completed ==="
