#!/usr/bin/env bash
set -euo pipefail

# KB Dataset Packaging Script
# Creates ZIP from knowledge-hub dataset with manifest and checksum
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
MANIFEST_FILE="manifest.json"
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

# Normalize links before packaging
echo "🔗 Normalizing markdown links to relative paths..."
PAIR_CLI="node apps/pair-cli/dist/cli.js"

# Check if CLI is built
if [[ ! -f "apps/pair-cli/dist/cli.js" ]]; then
  echo "⚠️  CLI not built, building now..."
  pnpm --filter @pair/pair-cli build
fi

# Run update-link on dataset to normalize all links to relative
echo "   Running: $PAIR_CLI update-link --relative on dataset..."
LINK_LOG=$(mktemp)
if (cd "$DATASET_SOURCE" && $PROJECT_ROOT/$PAIR_CLI update-link --relative > "$LINK_LOG" 2>&1); then
  LINKS_UPDATED=$(grep -c "Updated" "$LINK_LOG" 2>/dev/null || echo "0")
  echo "   ✓ Links normalized: $LINKS_UPDATED files updated"
else
  echo "⚠️  Warning: Link normalization failed (continuing anyway)"
  cat "$LINK_LOG"
fi
rm -f "$LINK_LOG"

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

# Generate manifest.json
echo "📝 Generating manifest.json..."
TEMP_MANIFEST=$(mktemp)
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

# Start JSON
echo "{" > "$TEMP_MANIFEST"
echo "  \"version\": \"${VERSION}\"," >> "$TEMP_MANIFEST"
echo "  \"timestamp\": \"${TIMESTAMP}\"," >> "$TEMP_MANIFEST"
echo "  \"files\": [" >> "$TEMP_MANIFEST"

# Scan files and compute checksums
FIRST_FILE=true
while IFS= read -r -d '' file; do
  RELATIVE_PATH="${file#$DATASET_SOURCE/}"
  CHECKSUM=$(shasum -a 256 "$file" | awk '{print $1}')
  
  if [[ "$FIRST_FILE" == "true" ]]; then
    FIRST_FILE=false
  else
    echo "," >> "$TEMP_MANIFEST"
  fi
  
  echo -n "    {\"path\": \"$RELATIVE_PATH\", \"sha256\": \"$CHECKSUM\"}" >> "$TEMP_MANIFEST"
done < <(find "$DATASET_SOURCE" -type f -print0 | sort -z)

echo "" >> "$TEMP_MANIFEST"
echo "  ]" >> "$TEMP_MANIFEST"
echo "}" >> "$TEMP_MANIFEST"

# Copy manifest to dataset temporarily
cp "$TEMP_MANIFEST" "$DATASET_SOURCE/$MANIFEST_FILE"

# Create ZIP with preserved structure
echo "🗜️  Creating ZIP archive..."
(cd "$DATASET_SOURCE" && zip -r "$PROJECT_ROOT/$OUTPUT_ZIP" . -q)

# Count files before cleanup
MANIFEST_FILES=$(grep -c '"path"' "$TEMP_MANIFEST" 2>/dev/null || echo "0")

# Remove temporary manifest from dataset
rm "$DATASET_SOURCE/$MANIFEST_FILE"
rm "$TEMP_MANIFEST"

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
     ! grep -q '"timestamp"' "$VERIFY_DIR/manifest.json" || \
     ! grep -q '"files"' "$VERIFY_DIR/manifest.json"; then
    echo "❌ Error: manifest.json missing required fields"
    exit 1
  fi
  echo "   ✓ manifest.json structure valid"
  
  # Count files in package (excluding manifest)
  EXTRACTED_COUNT=$(find "$VERIFY_DIR" -type f ! -name "manifest.json" | wc -l | tr -d ' ')
  echo "   ✓ Package contains $EXTRACTED_COUNT files (+ manifest)"
  
  # Test kb package command on extracted dataset
  echo ""
  echo "🧪 Testing 'pair kb package' on extracted dataset..."
  
  # Create temporary project structure
  TEST_PROJECT="$VERIFY_DIR/test-project"
  mkdir -p "$TEST_PROJECT/.pair"
  
  # Copy extracted dataset to .pair directory
  cp -r "$VERIFY_DIR"/* "$TEST_PROJECT/.pair/" 2>/dev/null || true
  rm -f "$TEST_PROJECT/.pair/manifest.json" # Remove manifest from .pair
  
  # Create minimal config.json for the test
  cat > "$TEST_PROJECT/config.json" <<EOF
{
  "asset_registries": {
    "knowledge": {
      "source": ".pair/knowledge",
      "behavior": "mirror",
      "target_path": ".pair/knowledge",
      "description": "Knowledge base content"
    },
    "adoption": {
      "source": ".pair/adoption",
      "behavior": "mirror",
      "target_path": ".pair/adoption",
      "description": "Adoption content"
    }
  }
}
EOF
  
  # Run pair kb package
  PKG_OUTPUT="$TEST_PROJECT/test-package.zip"
  if (cd "$TEST_PROJECT" && $PROJECT_ROOT/$PAIR_CLI kb package --output "$PKG_OUTPUT" > /dev/null 2>&1); then
    echo "   ✓ kb package command succeeded"
    
    # Verify package was created
    if [[ ! -f "$PKG_OUTPUT" ]]; then
      echo "❌ Error: package not created"
      exit 1
    fi
    
    PKG_SIZE=$(du -h "$PKG_OUTPUT" | cut -f1)
    echo "   ✓ Package created: $PKG_SIZE"
    
    # Verify package contains manifest
    if unzip -l "$PKG_OUTPUT" | grep -q "manifest.json"; then
      echo "   ✓ Package contains manifest.json"
    else
      echo "❌ Error: Package missing manifest.json"
      exit 1
    fi
    
    echo ""
    echo "✅ Package verification complete - all checks passed"
  else
    echo "❌ Error: kb package command failed"
    echo "   This may indicate issues with the dataset structure"
    exit 1
  fi
fi

