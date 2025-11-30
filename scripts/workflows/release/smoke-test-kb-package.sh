#!/usr/bin/env bash
set -euo pipefail

# KB Package Smoke Test Script
# Tests 'pair kb package' command on an installed repository
# Verifies package creation, manifest, and content integrity

REPO_ROOT="${1:-}"
CLEANUP=false
PERSIST_LOGS=false

# Parse additional flags
shift || true
for arg in "$@"; do
  case "$arg" in
    --cleanup|-c)
      CLEANUP=true
      ;;
    --persist-logs|-p)
      PERSIST_LOGS=true
      ;;
    *)
      echo "⚠️  Warning: unknown flag '$arg'"
      ;;
  esac
done

if [[ -z "$REPO_ROOT" ]]; then
  echo "❌ Error: Repository root path required"
  echo "Usage: $0 <repo-root> [--cleanup|-c] [--persist-logs|-p]"
  echo ""
  echo "The repository must have:"
  echo "  - .pair/ directory with installed KB content"
  echo "  - config.json with asset_registries configuration"
  echo "  - pair CLI installed (npm/manual/global)"
  exit 1
fi

# Validate repository structure
if [[ ! -d "$REPO_ROOT" ]]; then
  echo "❌ Error: Repository directory not found: $REPO_ROOT"
  exit 1
fi

if [[ ! -d "$REPO_ROOT/.pair" ]]; then
  echo "❌ Error: .pair/ directory not found in $REPO_ROOT"
  echo "   Please run 'pair install' first"
  exit 1
fi

if [[ ! -f "$REPO_ROOT/config.json" ]]; then
  echo "❌ Error: config.json not found in $REPO_ROOT"
  exit 1
fi

echo "📦 KB Package Smoke Test"
echo "   Repository: $REPO_ROOT"
echo ""

# Create temp directory for test artifacts
SCRIPT_ROOT="${GIT_WORK_TREE:-$(pwd)}"
if [ -n "${RUNNER_TEMP:-}" ] && [[ "$RUNNER_TEMP" != "$SCRIPT_ROOT"* ]]; then
  TMPDIR=$(mktemp -d "${RUNNER_TEMP}/kb-pkg-test.XXXX" 2>/dev/null || mktemp -d)
else
  mkdir -p "$SCRIPT_ROOT/.tmp"
  TMPDIR=$(mktemp -d "${SCRIPT_ROOT}/.tmp/kb-pkg-test.XXXX" 2>/dev/null || mktemp -d)
fi

if [[ "$PERSIST_LOGS" == true ]]; then
  LOGDIR="$SCRIPT_ROOT/.tmp/kb-package-logs"
  mkdir -p "$LOGDIR"
  LOGFILE="$LOGDIR/test-$(date +%s).log"
  echo "📝 Logging to: $LOGFILE"
  echo "Repository: $REPO_ROOT" > "$LOGFILE"
  echo "Timestamp: $(date -u +"%Y-%m-%dT%H:%M:%SZ")" >> "$LOGFILE"
  echo "" >> "$LOGFILE"
fi

cleanup() {
  local rc=$?
  if [[ "$CLEANUP" == true ]]; then
    echo "🧹 Cleaning up: $TMPDIR"
    rm -rf "$TMPDIR" || true
  else
    echo "📁 Test artifacts kept at: $TMPDIR"
    echo "   Use --cleanup to remove automatically"
  fi
  exit $rc
}
trap cleanup EXIT

# Detect pair CLI in the repository
echo "🔍 Detecting pair CLI installation..."

PAIR_CMD=""
if command -v pair >/dev/null 2>&1; then
  echo "   ✓ Found global pair CLI"
  PAIR_CMD="pair"
elif [[ -x "$REPO_ROOT/node_modules/.bin/pair" ]]; then
  echo "   ✓ Found npm-installed pair CLI"
  PAIR_CMD="$REPO_ROOT/node_modules/.bin/pair"
elif [[ -x "$REPO_ROOT/pair-cli/pair-cli" ]]; then
  echo "   ✓ Found manual pair CLI"
  PAIR_CMD="$REPO_ROOT/pair-cli/pair-cli"
elif [[ -x "$REPO_ROOT/pair-cli/bin/pair-cli" ]]; then
  echo "   ✓ Found manual pair CLI (bin/)"
  PAIR_CMD="$REPO_ROOT/pair-cli/bin/pair-cli"
elif [[ -f "$REPO_ROOT/pair-cli/bundle-cli/index.js" ]]; then
  echo "   ✓ Found manual pair CLI (bundle)"
  PAIR_CMD="node $REPO_ROOT/pair-cli/bundle-cli/index.js"
else
  echo "❌ Error: pair CLI not found"
  echo "   Checked:"
  echo "     - Global installation (pair command)"
  echo "     - npm installation (node_modules/.bin/pair)"
  echo "     - Manual installation (pair-cli/)"
  exit 1
fi

# Test 1: Run kb package command
echo ""
echo "🧪 Test 1: Running 'pair kb package'..."

PKG_OUTPUT="$TMPDIR/test-package.zip"
PKG_LOG="$TMPDIR/package.log"

pushd "$REPO_ROOT" >/dev/null

if $PAIR_CMD kb package --output "$PKG_OUTPUT" > "$PKG_LOG" 2>&1; then
  echo "   ✓ Command succeeded"
else
  PKG_RET=$?
  echo "❌ Command failed with exit code $PKG_RET"
  echo "   Log output:"
  cat "$PKG_LOG"
  exit $PKG_RET
fi

popd >/dev/null

# Test 2: Verify package was created
echo ""
echo "🧪 Test 2: Verifying package creation..."

if [[ ! -f "$PKG_OUTPUT" ]]; then
  echo "❌ Error: Package file not created at $PKG_OUTPUT"
  exit 1
fi

PKG_SIZE=$(du -h "$PKG_OUTPUT" | cut -f1)
PKG_SIZE_BYTES=$(stat -f%z "$PKG_OUTPUT" 2>/dev/null || stat -c%s "$PKG_OUTPUT" 2>/dev/null || echo "0")
echo "   ✓ Package created: $PKG_SIZE ($PKG_SIZE_BYTES bytes)"

if [[ $PKG_SIZE_BYTES -eq 0 ]]; then
  echo "❌ Error: Package is empty"
  exit 1
fi

if [[ $PKG_SIZE_BYTES -gt 104857600 ]]; then
  echo "⚠️  Warning: Package exceeds 100MB ($(($PKG_SIZE_BYTES / 1048576))MB)"
fi

# Test 3: Verify ZIP structure
echo ""
echo "🧪 Test 3: Verifying ZIP structure..."

EXTRACT_DIR="$TMPDIR/extracted"
mkdir -p "$EXTRACT_DIR"

if ! unzip -q "$PKG_OUTPUT" -d "$EXTRACT_DIR" 2>/dev/null; then
  echo "❌ Error: Failed to extract ZIP package"
  exit 1
fi

echo "   ✓ ZIP extracted successfully"

# Test 4: Verify manifest.json
echo ""
echo "🧪 Test 4: Verifying manifest.json..."

if [[ ! -f "$EXTRACT_DIR/manifest.json" ]]; then
  echo "❌ Error: manifest.json not found in package"
  ls -la "$EXTRACT_DIR"
  exit 1
fi

echo "   ✓ manifest.json present"

# Check manifest structure
MANIFEST_VALID=true
if ! grep -q '"name"' "$EXTRACT_DIR/manifest.json"; then
  echo "❌ Error: manifest.json missing 'name' field"
  MANIFEST_VALID=false
fi
if ! grep -q '"version"' "$EXTRACT_DIR/manifest.json"; then
  echo "❌ Error: manifest.json missing 'version' field"
  MANIFEST_VALID=false
fi
if ! grep -q '"created_at"' "$EXTRACT_DIR/manifest.json"; then
  echo "❌ Error: manifest.json missing 'created_at' field"
  MANIFEST_VALID=false
fi
if ! grep -q '"registries"' "$EXTRACT_DIR/manifest.json"; then
  echo "❌ Error: manifest.json missing 'registries' field"
  MANIFEST_VALID=false
fi

if [[ "$MANIFEST_VALID" == false ]]; then
  echo "   Manifest content:"
  cat "$EXTRACT_DIR/manifest.json"
  exit 1
fi

echo "   ✓ manifest.json structure valid"

# Test 5: Verify registries content
echo ""
echo "🧪 Test 5: Verifying registry content..."

# Read registries from config.json
REGISTRIES=$(grep -o '"asset_registries"[[:space:]]*:[[:space:]]*{[^}]*"[^"]*"[[:space:]]*:[[:space:]]*{[^}]*"source"[[:space:]]*:[[:space:]]*"[^"]*"' "$REPO_ROOT/config.json" | grep -o '"source"[[:space:]]*:[[:space:]]*"[^"]*"' | cut -d'"' -f4)

MISSING_REGISTRIES=()
for registry_source in $REGISTRIES; do
  # Remove leading ./ or .pair/ prefix for comparison
  CLEAN_SOURCE="${registry_source#./}"
  CLEAN_SOURCE="${CLEAN_SOURCE#.pair/}"
  
  # Check if exists in extracted package
  if [[ -d "$EXTRACT_DIR/$CLEAN_SOURCE" ]] || [[ -f "$EXTRACT_DIR/$CLEAN_SOURCE" ]]; then
    echo "   ✓ Registry found: $CLEAN_SOURCE"
  else
    MISSING_REGISTRIES+=("$CLEAN_SOURCE")
  fi
done

if [[ ${#MISSING_REGISTRIES[@]} -gt 0 ]]; then
  echo "❌ Error: Missing registries in package:"
  for missing in "${MISSING_REGISTRIES[@]}"; do
    echo "     - $missing"
  done
  echo "   Package contents:"
  ls -la "$EXTRACT_DIR"
  exit 1
fi

# Test 6: Count files
echo ""
echo "🧪 Test 6: Verifying file count..."

FILE_COUNT=$(find "$EXTRACT_DIR" -type f ! -name "manifest.json" | wc -l | tr -d ' ')
echo "   ✓ Package contains $FILE_COUNT files (+ manifest)"

if [[ $FILE_COUNT -eq 0 ]]; then
  echo "❌ Error: No files found in package (excluding manifest)"
  exit 1
fi

# Summary
echo ""
echo "✅ All smoke tests passed!"
echo ""
echo "Summary:"
echo "  Package: $PKG_OUTPUT"
echo "  Size: $PKG_SIZE ($PKG_SIZE_BYTES bytes)"
echo "  Files: $FILE_COUNT (+ manifest.json)"
echo "  Artifacts: $TMPDIR"

if [[ "$PERSIST_LOGS" == true ]]; then
  echo "" >> "$LOGFILE"
  echo "=== TEST RESULTS ===" >> "$LOGFILE"
  echo "Status: SUCCESS" >> "$LOGFILE"
  echo "Package: $PKG_OUTPUT" >> "$LOGFILE"
  echo "Size: $PKG_SIZE_BYTES bytes" >> "$LOGFILE"
  echo "Files: $FILE_COUNT" >> "$LOGFILE"
  echo "" >> "$LOGFILE"
  echo "Package output:" >> "$LOGFILE"
  cat "$PKG_LOG" >> "$LOGFILE"
fi
