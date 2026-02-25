#!/usr/bin/env bash
set -euo pipefail

# Smoke test: verify BOTH manual ZIP and npm TGZ contain no bundle-cli/dataset/.
# The dataset is distributed separately via knowledge-base-{VERSION}.zip and
# auto-downloaded on first use.

OFFLINE_SAFE=true

source "$(dirname "$0")/../lib/utils.sh"

TEST_NAME="No Dataset in Artifacts"
echo "=== Running $TEST_NAME ==="

if [ -z "${REPO_ROOT:-}" ]; then
  REPO_ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
fi
ensure_tmp_dir

PACKAGE_SCRIPT="$REPO_ROOT/scripts/workflows/release/package-manual.sh"

# Use a fixed version to avoid collisions
VERSION="no-dataset-check"
RELEASE_DIR="$REPO_ROOT/release/pair-cli-manual-$VERSION"
ZIP_PATH="$REPO_ROOT/release/pair-cli-manual-$VERSION.zip"

# Cleanup any previous run
rm -rf "$RELEASE_DIR" "$ZIP_PATH" "${ZIP_PATH}.sha256"

# ── Test 1: Manual ZIP has no dataset ─────────────────────────────────
log_info "Test 1: Verify manual ZIP has no bundle-cli/dataset/"

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

DATASET_COUNT=$(unzip -l "$ZIP_PATH" | grep -c "bundle-cli/dataset/" || true)
if [ "$DATASET_COUNT" -gt 0 ]; then
  log_fail "bundle-cli/dataset/ found in manual ZIP ($DATASET_COUNT entries)"
  rm -rf "$RELEASE_DIR" "$ZIP_PATH" "${ZIP_PATH}.sha256"
  exit 1
fi
log_succ "Manual ZIP: no dataset (0 entries)"

# Size check: ZIP < 1.5 MB
ZIP_SIZE=$(stat -f%z "$ZIP_PATH" 2>/dev/null || stat -c%s "$ZIP_PATH" 2>/dev/null)
MAX_ZIP=$((1536 * 1024))
if [ "$ZIP_SIZE" -gt "$MAX_ZIP" ]; then
  log_fail "Manual ZIP too large: $((ZIP_SIZE / 1024)) KB (max 1536 KB)"
  rm -rf "$RELEASE_DIR" "$ZIP_PATH" "${ZIP_PATH}.sha256"
  exit 1
fi
log_succ "Manual ZIP size OK: $((ZIP_SIZE / 1024)) KB"

rm -rf "$RELEASE_DIR" "$ZIP_PATH" "${ZIP_PATH}.sha256"

# ── Test 2: npm TGZ has no dataset ───────────────────────────────────
log_info "Test 2: Verify npm TGZ has no dataset/"

# Find the TGZ from env or release directory
TGZ_PATH="${RELEASE_TGZ:-}"
if [ -z "$TGZ_PATH" ]; then
  TGZ_PATH=$(find "$REPO_ROOT/release" -maxdepth 1 -name '*.tgz' 2>/dev/null | head -1 || true)
fi

if [ -z "$TGZ_PATH" ] || [ ! -f "$TGZ_PATH" ]; then
  log_warn "No TGZ found — skipping npm artifact check (set RELEASE_TGZ or place .tgz in release/)"
else
  TGZ_DATASET_COUNT=$(tar tf "$TGZ_PATH" | grep -c "dataset/" || true)
  if [ "$TGZ_DATASET_COUNT" -gt 0 ]; then
    log_fail "dataset/ found in TGZ ($TGZ_DATASET_COUNT entries)"
    exit 1
  fi
  log_succ "npm TGZ: no dataset (0 entries)"

  # Size check: TGZ < 1 MB
  TGZ_SIZE=$(stat -f%z "$TGZ_PATH" 2>/dev/null || stat -c%s "$TGZ_PATH" 2>/dev/null)
  MAX_TGZ=$((1024 * 1024))
  if [ "$TGZ_SIZE" -gt "$MAX_TGZ" ]; then
    log_fail "TGZ too large: $((TGZ_SIZE / 1024)) KB (max 1024 KB)"
    exit 1
  fi
  log_succ "npm TGZ size OK: $((TGZ_SIZE / 1024)) KB"
fi

echo "=== $TEST_NAME Completed ==="
