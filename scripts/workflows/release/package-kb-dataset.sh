#!/usr/bin/env bash
set -euo pipefail

# KB Dataset Packaging Script
# Creates ZIP from knowledge-hub dataset with manifest and checksum

CLEAN=false
VERSION=""

while [[ $# -gt 0 ]]; do
  case $1 in
    --clean)
      CLEAN=true
      shift
      ;;
    -*)
      echo "❌ Unknown option: $1"
      echo "Usage: $0 [--clean] <version>"
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
  rm -rf release/knowledge-base-*.zip release/knowledge-base-*.zip.sha256
  echo "✅ Clean complete"
  exit 0
fi

if [[ -z "$VERSION" ]]; then
  echo "❌ Error: Version parameter required"
  echo "Usage: $0 [--clean] <version>"
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
  rm -f release/knowledge-base-*.zip release/knowledge-base-*.zip.sha256
fi

mkdir -p "$RELEASE_DIR"

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
