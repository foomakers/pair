#!/usr/bin/env bash
set -euo pipefail

# scripts/workflows/release/create-registry-tgz.sh
# Create registry TGZ from manual release ZIP artifact
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$SCRIPT_DIR"
while [ ! -f "$REPO_ROOT/package.json" ] && [ "$REPO_ROOT" != "/" ]; do
  REPO_ROOT="$(dirname "$REPO_ROOT")"
done

VERSION=""
ZIP_PATH=""

# Parse arguments: allow either (<version> <zip_path>) or ( <zip_path> ) where zip is a file path

VERSION=""
ZIP_PATH=""

# Parse arguments
if [ $# -lt 2 ]; then
  echo "Usage: $0 <version> <zip_path>"
  echo "Example: $0 v1.0.0 release/pair-cli-manual-v1.0.0.zip"
  exit 1
fi

VERSION="$1"
ZIP_PATH="$2"

# Remove 'v' prefix if present (for consistency)
VERSION="${VERSION#v}"

echo "Creating registry TGZ for version $VERSION from $ZIP_PATH"

# Validate inputs
if [ ! -f "$ZIP_PATH" ]; then
  echo "Error: ZIP file not found: $ZIP_PATH"
  exit 1
fi

# Create temporary directory
TMPDIR=$(mktemp -d)
echo "Using temporary directory: $TMPDIR"

# Extract ZIP
echo "Extracting $ZIP_PATH to $TMPDIR..."
unzip -q "$ZIP_PATH" -d "$TMPDIR"

# Find the extracted artifact directory (look for any pair-cli-manual-* directory)
ART_DIR=""
for dir in "$TMPDIR"/*/; do
  dir=${dir%*/}  # Remove trailing slash
  dir_name=$(basename "$dir")
  if [[ "$dir_name" == pair-cli-manual-* ]]; then
    ART_DIR="$dir"
    echo "Found artifact directory: $ART_DIR (original version in ZIP: ${dir_name#pair-cli-manual-})"
    break
  fi
done

if [ -z "$ART_DIR" ]; then
  echo "Error: Could not find any pair-cli-manual-* directory in extracted ZIP"
  echo "Contents of $TMPDIR:"
  ls -la "$TMPDIR"
  exit 1
fi

# Ensure no node_modules are present for npm pack
echo "Removing any node_modules from artifact..."
rm -rf "$ART_DIR/node_modules" || true

# Make sure package.json exists in the artifact
if [ ! -f "$ART_DIR/package.json" ]; then
  echo "Warning: package.json not present in artifact; copying from apps/pair-cli/package.json"
  cp "$REPO_ROOT/apps/pair-cli/package.json" "$ART_DIR/" || {
    echo "Error: Could not copy package.json from $REPO_ROOT/apps/pair-cli/package.json"
    exit 1
  }
fi

# Store repo root for later moves (find directory containing package.json)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$SCRIPT_DIR"
while [ ! -f "$REPO_ROOT/package.json" ] && [ "$REPO_ROOT" != "/" ]; do
  REPO_ROOT="$(dirname "$REPO_ROOT")"
done

if [ ! -f "$REPO_ROOT/package.json" ]; then
  echo "Error: Could not find repository root (package.json not found)"
  exit 1
fi

# Change to artifact directory for npm operations
cd "$ART_DIR"

# Ensure the package.json inside the extracted artifact is scoped for GitHub Packages
echo "Patching package.json for GitHub Packages registry and setting package name/version..."
# Use a small Node script to robustly patch or create package.json; ensure name is @foomakers/pair-cli and version matches the normalized VERSION
VERSION_ENV="$VERSION" VERSION="$VERSION" node <<'NODE'
const fs = require('fs');
const p = './package.json';
const version = process.env.VERSION_ENV || process.env.VERSION || '0.0.0';
if (fs.existsSync(p)) {
  const o = JSON.parse(fs.readFileSync(p, 'utf8'));
  o.name = '@foomakers/pair-cli';
  o.version = version;
  // ensure package is publishable
  o.private = !!o.private ? o.private : false;
  o.publishConfig = o.publishConfig || {};
  o.publishConfig.registry = 'https://npm.pkg.github.com/';
  fs.writeFileSync(p, JSON.stringify(o, null, 2));
  console.log('Patched package.json for registry publish:', o.name, o.version);
} else {
  const o = {
    name: '@foomakers/pair-cli',
    version: version,
    main: 'bundle-cli/index.js',
    bin: { 'pair-cli': './bin/pair-cli' },
    files: ['bundle-cli', 'bin', 'README.md', 'config.json', 'LICENSE', 'docs'],
    private: false,
    publishConfig: { registry: 'https://npm.pkg.github.com/' }
  };
  fs.writeFileSync(p, JSON.stringify(o, null, 2));
  console.log('Created package.json for registry publish:', o.name, o.version);
}
NODE

# npm pack will produce a tarball; normalize its name to pair-cli-<version>.tgz
echo "Running npm pack..."
TAR_OUT=$(npm pack --pack-destination . | tail -n1 | tr -d '\r' ) || true

# If npm pack didn't print filename, fallback to matching pattern
if [ -z "$TAR_OUT" ]; then
  TAR_OUT=$(ls *.tgz 2>/dev/null | head -n1 || true)
fi

if [ -z "$TAR_OUT" ]; then
  echo "Error: npm pack did not produce a .tgz file"
  echo "Contents of $(pwd):"
  ls -la
  exit 1
fi

echo "npm pack produced: $TAR_OUT"

# Rename to normalized name
NORMALIZED_NAME="pair-cli-${VERSION}.tgz"
if [ "$TAR_OUT" != "$NORMALIZED_NAME" ]; then
  mv "$TAR_OUT" "$NORMALIZED_NAME"
  TAR_OUT="$NORMALIZED_NAME"
fi

echo "Normalized tarball name: $TAR_OUT"

# Compute sha256 checksum
echo "Computing SHA256 checksum..."
if command -v sha256sum >/dev/null 2>&1; then
  sha256sum "$TAR_OUT" | awk '{print $1}' > "${TAR_OUT}.sha256"
else
  shasum -a 256 "$TAR_OUT" | awk '{print $1}' > "${TAR_OUT}.sha256"
fi

echo "Generated checksum file: ${TAR_OUT}.sha256"


# Export minimal package metadata for publish-time validation
echo "Extracting package metadata..."
# Write metadata to a name without the .tgz suffix so other scripts expect pair-cli-<version>.meta.json
META_NAME="pair-cli-${VERSION}.meta.json"
node -e "const fs=require('fs');const p=JSON.parse(fs.readFileSync('package.json','utf8'));fs.writeFileSync('${META_NAME}', JSON.stringify({name:p.name,private:p.private,version:p.version,publishConfig:p.publishConfig||null}))"

# Move outputs to repo release/ folder
echo "Moving artifacts to release/ directory..."
mkdir -p "$REPO_ROOT/release"
mv "$TAR_OUT" "$REPO_ROOT/release/"
mv "${TAR_OUT}.sha256" "$REPO_ROOT/release/"
mv "$META_NAME" "$REPO_ROOT/release/"

echo "Registry TGZ creation completed successfully!"
echo "Generated files in $REPO_ROOT/release/:"
echo "  - $TAR_OUT"
echo "  - ${TAR_OUT}.sha256"
echo "  - ${META_NAME}"

# Cleanup
rm -rf "$TMPDIR"