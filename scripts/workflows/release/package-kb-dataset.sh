#!/usr/bin/env bash
set -euo pipefail

# KB Dataset Packaging Script
# Creates ZIP from knowledge-hub dataset using 'pair-cli package' command
# Ensures consistent packaging logic with manual KB packaging
# Includes link normalization and package verification

CLEAN=false
VERSION=""
VERIFY=true

while [[ $# -gt 0 ]]; do
  case $1 in
    --clean)
      CLEAN=true
      shift
      ;;
    --no-verify)
      VERIFY=false
      shift
      ;;
    -*)
      echo "❌ Unknown option: $1"
      echo "Usage: $0 [--clean] [--no-verify] <version>"
      exit 1
      ;;
    *)
      VERSION="$1"
      shift
      ;;
  esac
done

# Clean-only mode
if [[ "$CLEAN" == true ]] && [[ -z "$VERSION" ]]; then
  echo "🧹 Cleaning KB dataset release artifacts..."
  rm -f release/knowledge-base-*.zip release/knowledge-base-*.zip.sha256 2>/dev/null || true
  # Remove release/ directory if empty after cleanup
  if [[ -d release ]] && [[ -z "$(ls -A release 2>/dev/null)" ]]; then
    rmdir release
    echo "✅ Clean complete (release/ directory removed - was empty)"
  else
    echo "✅ Clean complete (release/ directory kept - contains other files)"
  fi
  exit 0
fi

if [[ -z "$VERSION" ]]; then
  echo "❌ Error: Version parameter required"
  echo "Usage: $0 [--clean] [--no-verify] <version>"
  exit 1
fi

# Configuration
DATASET_SOURCE="packages/knowledge-hub/dataset"
RELEASE_DIR="release"
OUTPUT_ZIP="${RELEASE_DIR}/knowledge-base-${VERSION}.zip"
CHECKSUM_FILE="${OUTPUT_ZIP}.sha256"

# Validate dataset exists
if [[ ! -d "$DATASET_SOURCE" ]]; then
  echo "❌ Error: Dataset directory not found: $DATASET_SOURCE"
  exit 1
fi

# Ensure release directory exists (use absolute path)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
cd "$PROJECT_ROOT"

# Clean release artifacts if requested
if [[ "$CLEAN" == true ]]; then
  echo "🧹 Cleaning previous KB dataset artifacts..."
  rm -f release/knowledge-base-*.zip release/knowledge-base-*.zip.sha256 2>/dev/null || true
  # Remove release/ directory if empty after cleanup (will be recreated by mkdir below)
  if [[ -d release ]] && [[ -z "$(ls -A release 2>/dev/null)" ]]; then
    rmdir release
  fi
fi

mkdir -p "$RELEASE_DIR"

# Note: Link normalization via 'pair-cli update-link' is not applicable to dataset source
# because update-link command works on installed KB content in .pair directory
# The dataset source links should already be in correct format (relative paths)

echo "📦 Packaging KB dataset v${VERSION}..."
echo "   Source: $DATASET_SOURCE"
echo "   Output: $OUTPUT_ZIP"

# Check dataset size
DATASET_SIZE=$(du -sh "$DATASET_SOURCE" | cut -f1)
DATASET_SIZE_MB=$(du -sm "$DATASET_SOURCE" | cut -f1)
echo "   Size: $DATASET_SIZE"

if [[ $DATASET_SIZE_MB -gt 50 ]]; then
  echo "⚠️  Warning: Dataset size exceeds 50MB threshold ($DATASET_SIZE)"
  echo "   Consider optimization for faster downloads"
fi

# Create temporary config.json for pair-cli package
echo "📝 Creating packaging config..."
TEMP_CONFIG=$(mktemp)
cat > "$TEMP_CONFIG" <<EOF
{
  "asset_registries": {
    "knowledge-base": {
      "source": ".",
      "behavior": "mirror",
      "target_path": ".",
      "description": "Knowledge base dataset v${VERSION}"
    }
  }
}
EOF

# Use pair-cli package command to create the ZIP
echo "🗜️  Creating ZIP archive with pair-cli package..."
PAIR_CLI="apps/pair-cli/dist/cli.js"

# Check if CLI is built
if [[ ! -f "$PAIR_CLI" ]]; then
  echo "⚠️  CLI not built, building now..."
  pnpm --filter @pair/pair-cli build
fi

# Execute from project root to ensure correct path resolution
node "$PROJECT_ROOT/$PAIR_CLI" package \
  -c "$TEMP_CONFIG" \
  --source-dir "$DATASET_SOURCE" \
  -o "$OUTPUT_ZIP" \
  --name "knowledge-base" \
  --pkg-version "$VERSION" \
  --description "Pair knowledge base dataset"

rm "$TEMP_CONFIG"

# Count files in created package
MANIFEST_FILES=$(unzip -l "$OUTPUT_ZIP" | grep -c "^\s*[0-9]" | tail -1)

# Generate checksum for ZIP
echo "🔒 Generating SHA256 checksum..."
shasum -a 256 "$OUTPUT_ZIP" | awk '{print $1}' > "$CHECKSUM_FILE"

ZIP_SIZE=$(du -sh "$OUTPUT_ZIP" | cut -f1)

echo "✅ KB dataset packaged successfully"
echo "   ZIP: $OUTPUT_ZIP ($ZIP_SIZE)"
echo "   Checksum: $CHECKSUM_FILE"
echo "   Manifest included with $MANIFEST_FILES files"

# Verification phase
if [[ "$VERIFY" == true ]]; then
  echo ""
  echo "🔍 Verifying package..."
  
  # Create temp directory for extraction
  VERIFY_DIR=$(mktemp -d)
  trap 'rm -rf "$VERIFY_DIR"' EXIT
  
  # Extract package
  echo "   Extracting to temporary directory..."
  unzip -q "$OUTPUT_ZIP" -d "$VERIFY_DIR"
  
  # Verify manifest exists
  if [[ ! -f "$VERIFY_DIR/manifest.json" ]]; then
    echo "❌ Error: manifest.json not found in package"
    exit 1
  fi
  echo "   ✓ manifest.json present"
  
  # Verify manifest has expected structure
  if ! grep -q '"version"' "$VERIFY_DIR/manifest.json" || \
     ! grep -q '"name"' "$VERIFY_DIR/manifest.json"; then
    echo "❌ Error: manifest.json missing required fields"
    exit 1
  fi
  echo "   ✓ manifest.json structure valid"
  
  # Count files in package (excluding manifest)
  EXTRACTED_COUNT=$(find "$VERIFY_DIR" -type f ! -name "manifest.json" | wc -l | tr -d ' ')
  echo "   ✓ Package contains $EXTRACTED_COUNT files (+ manifest)"
  
  echo ""
  echo "✅ Package verification complete - all checks passed"
fi

