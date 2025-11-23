#!/bin/bash
set -euo pipefail

# Script: create-github-release.sh
# Purpose: Create GitHub release and upload all release assets
# Parameters:
#   VERSION: The version to release (e.g., v1.0.0)
#   GH_TOKEN: GitHub token for authentication (optional, uses env if not provided)
#   --dry-run: Show what would be done without making changes
# Outputs:
#   Release URL or success status

DRY_RUN=false
VERSION=""
GH_TOKEN_ARG=""

while [[ $# -gt 0 ]]; do
  case $1 in
    --dry-run)
      DRY_RUN=true
      shift
      ;;
    -*)
      echo "Unknown option: $1"
      echo "Usage: $0 [--dry-run] <version> [gh_token]"
      exit 1
      ;;
    *)
      if [ -z "$VERSION" ]; then
        VERSION="$1"
      elif [ -z "$GH_TOKEN_ARG" ]; then
        GH_TOKEN_ARG="$1"
      else
        echo "Too many arguments"
        echo "Usage: $0 [--dry-run] <version> [gh_token]"
        exit 1
      fi
      shift
      ;;
  esac
done

if [ -z "$VERSION" ]; then
  echo "Error: VERSION parameter is required"
  echo "Usage: $0 [--dry-run] <version> [gh_token]"
  exit 1
fi

GH_TOKEN="${GH_TOKEN_ARG:-${GH_TOKEN:-}}"
if [ -z "$GH_TOKEN" ] && [ "$DRY_RUN" = false ]; then
  echo "Error: GH_TOKEN is required for actual release creation"
  echo "Use --dry-run to test without a token, or provide GH_TOKEN as second argument"
  exit 1
fi

# Export GH_TOKEN for gh CLI
export GH_TOKEN

if [ "$DRY_RUN" = true ]; then
  echo "DRY RUN MODE - No actual changes will be made"
fi

echo "Checking if release $VERSION already exists..."

# Normalize version (strip leading v or V) so we can look for artifacts produced
# either with or without a leading 'v'. e.g. both 'v1.2.3' and '1.2.3' are supported.
VERSION_NO_V="${VERSION#v}"
VERSION_NO_V="${VERSION_NO_V#V}"

if [ "$DRY_RUN" = false ] && gh release view "$VERSION" >/dev/null 2>&1; then
  echo "Release $VERSION already exists, skipping creation"
elif [ "$DRY_RUN" = true ]; then
  echo "[DRY RUN] Would check if release $VERSION exists"
else
  echo "Creating release $VERSION..."

  NOTES_FILE=$(mktemp)
  {
    echo '## Release Artifacts'
    echo ''
    echo 'This release includes two bundled artifacts:'
    echo ''
    echo '### 1. Pair CLI - Manual Installation'
    echo ''
    echo 'For manual installation in air-gapped or restricted environments.'
    echo ''
    echo '**Downloads:**'
    echo "- **ZIP Archive**: \`pair-cli-manual-${VERSION}.zip\`"
    echo "- **SHA256 Checksum**: \`pair-cli-manual-${VERSION}.zip.sha256\`"
    echo ''
    echo '**Installation Instructions:**'
    echo ''
    echo '1. Download the ZIP archive'
    echo "2. Verify the checksum: \`sha256sum pair-cli-manual-${VERSION}.zip\`"
    echo '3. Extract the archive'
    echo '4. Run the executable: \`./pair-cli --help\`'
    echo ''
    echo '**What'\''s Included:**'
    echo '- Self-contained Node.js bundle (no external dependencies required)'
    echo '- Cross-platform executables (Linux/macOS/Windows)'
    echo '- TypeScript definitions'
    echo '- Configuration files'
    echo '- Documentation and license'
    echo ''
    echo '### 2. Knowledge Base Dataset'
    echo ''
    echo 'Complete knowledge base dataset for AI agent context.'
    echo ''
    echo '**Downloads:**'
    echo "- **ZIP Archive**: \`knowledge-base-${VERSION}.zip\`"
    echo "- **SHA256 Checksum**: \`knowledge-base-${VERSION}.zip.sha256\`"
    echo ''
    echo '**Contents:**'
    echo '- Project documentation and guides'
    echo '- AI agent configuration files'
    echo '- Technical architecture decisions'
    echo '- Code design guidelines'
    echo '- Manifest with file inventory and checksums'
    echo ''
    echo 'For more details, see [RELEASE.md](docs/RELEASE.md) and [CLI README](apps/pair-cli/README.md).'
  } > "$NOTES_FILE"

  if [ "$DRY_RUN" = true ]; then
    echo "[DRY RUN] Would create release $VERSION with notes from $NOTES_FILE"
  else
    gh release create "$VERSION" --title "Release $VERSION" --notes-file "$NOTES_FILE"
    echo "Release $VERSION created successfully."
  fi
fi

echo "Uploading release assets..."

# Helper: try to find an asset in release/ using normalized version first, then raw.
# Usage: find_asset <base-name> <ext>
# Returns path if found, empty otherwise.
find_asset() {
  local base="$1"
  local ext="$2"
  local cand1="release/${base}-${VERSION_NO_V}${ext}"
  local cand2="release/${base}-${VERSION}${ext}"
  if [ -f "$cand1" ]; then
    echo "$cand1"
    return 0
  fi
  if [ -f "$cand2" ]; then
    echo "$cand2"
    return 0
  fi
  # Not found
  echo ""
  return 1
}

# Helper: upload an asset if found (tries normalized then raw). Prints clear diagnostics.
upload_asset() {
  local base="$1"
  local ext="$2"
  local file
  file=$(find_asset "$base" "$ext") || true
  if [ -n "$file" ]; then
    if [ "$DRY_RUN" = true ]; then
      echo "[DRY RUN] Would upload: $file"
    else
      echo "Uploading: $file"
      gh release upload "$VERSION" "$file" --clobber
    fi
    return 0
  else
    # show both candidate names for easier debugging
    echo "Warning: Asset not found. Tried: release/${base}-${VERSION_NO_V}${ext} and release/${base}-${VERSION}${ext}"
    return 1
  fi
}

# Upload ZIP archive and checksum (try normalized then raw)
upload_asset "pair-cli-manual" ".zip" || true
upload_asset "pair-cli-manual" ".zip.sha256" || true

# Upload TGZ archive, checksum and metadata (try normalized then raw)
upload_asset "pair-cli" ".tgz" || true
upload_asset "pair-cli" ".tgz.sha256" || true
upload_asset "pair-cli" ".meta.json" || true

# Upload knowledge base dataset and checksum
upload_asset "knowledge-base" ".zip" || true
upload_asset "knowledge-base" ".zip.sha256" || true

if [ "$DRY_RUN" = true ]; then
  echo "[DRY RUN] All assets would be uploaded successfully."
  echo "[DRY RUN] Release URL would be: https://github.com/foomakers/pair/releases/tag/$VERSION"
else
  echo "All assets uploaded successfully."
  # Get release URL
  RELEASE_URL=$(gh release view "$VERSION" --json url --jq .url)
  echo "Release URL: $RELEASE_URL"
fi