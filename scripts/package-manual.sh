#!/usr/bin/env bash
set -euo pipefail

# scripts/package-manual.sh
# Minimal packaging scaffold for manual-install artifacts (issue #19)
# Usage:
#   ./scripts/package-manual.sh <version>
#
# This script produces a bundled, self-contained JS artifact (ncc) inside the
# release directory. It is intended to be run in CI for producing reproducible
# bundle-based manual releases. The --clean option remains to remove release/.
#
# NOTE: This is a scaffold. It intentionally does not modify git or create commits.
# Review and approve before committing to the repo.

CLEAN=false
if [ "${1:-}" = "--clean" ] || [ "${2:-}" = "--clean" ]; then
  CLEAN=true
fi

VERSION="${1:-${VERSION:-}}"
if [ "$VERSION" = "--clean" ]; then
  VERSION="${2:-}"
  if [ -z "$VERSION" ]; then
    CLEAN=true
    VERSION=""
  fi
fi

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

if [ "$CLEAN" = true ] && [ -z "$VERSION" ]; then
  echo "Cleaning release/ (no version provided)..."
  rm -rf "$ROOT_DIR/release"
  echo "Clean complete."
  exit 0
fi

if [ -z "$VERSION" ]; then
  echo "Error: version required. Usage: $0 <version> or set VERSION env var (or use --clean)"
  exit 1
fi
PKG_DIR="$ROOT_DIR/apps/pair-cli"
RELEASE_DIR="$ROOT_DIR/release/pair-cli-manual-$VERSION"

echo "Packaging pair-cli manual artifact for version=$VERSION"

if [ ! -d "$PKG_DIR" ]; then
  echo "Error: expected package directory $PKG_DIR not found"
  exit 1
fi

if [ ! -d "$PKG_DIR/dist" ]; then
  echo "Error: expected build outputs at $PKG_DIR/dist not found. Run: pnpm -w build"
  exit 1
fi

rm -rf "$RELEASE_DIR"
mkdir -p "$RELEASE_DIR"

echo "Copying metadata..."
if [ -f "$PKG_DIR/package.json" ]; then
  cp "$PKG_DIR/package.json" "$RELEASE_DIR/"
fi
if [ -f "$PKG_DIR/README.md" ]; then
  cp "$PKG_DIR/README.md" "$RELEASE_DIR/"
fi
if [ -f "$PKG_DIR/config.json" ]; then
  cp "$PKG_DIR/config.json" "$RELEASE_DIR/"
fi
# Prefer package-level LICENSE if present, else fall back to repo root LICENSE
if [ -f "$PKG_DIR/LICENSE" ]; then
  cp "$PKG_DIR/LICENSE" "$RELEASE_DIR/"
elif [ -f "$ROOT_DIR/LICENSE" ]; then
  cp "$ROOT_DIR/LICENSE" "$RELEASE_DIR/"
fi

# Create a clean package.json for the bundled artifact
if [ -f "$RELEASE_DIR/package.json" ]; then
  echo "Creating clean package.json for bundled artifact..."
  (cd "$RELEASE_DIR" && node -e "
    const fs = require('fs');
    const original = JSON.parse(fs.readFileSync('package.json', 'utf8'));

    // Create minimal package.json for self-contained bundle
    const cleanPkg = {
      name: original.name,
      version: process.argv[1],
      description: original.description,
      main: 'bundle-cli/index.js',
      types: 'bundle-cli/index.d.ts',
      bin: { 'pair-cli': './bin/pair-cli' },
      files: ['bundle-cli', 'bin', 'README.md', 'LICENSE', 'config.json'],
      author: original.author,
      license: original.license || 'MIT'
    };

    fs.writeFileSync('package.json', JSON.stringify(cleanPkg, null, 2) + '\n');
  " "$VERSION")
fi

# Note: package.json and config.json are needed in root for the bundled artifact

# Determine executable name (default: pair-cli)
EXE_NAME="pair-cli"

# Produce a bundled single-file JS artifact using ncc
echo "Creating ncc bundle inside artifact..."
# Ensure ncc is available via npx (will auto-install if needed)
if [ -f "$PKG_DIR/dist/cli.js" ]; then
  # Run ncc from the package directory so dependency resolution (pnpm workspace) works
  (cd "$PKG_DIR" && npx @vercel/ncc build "dist/cli.js" -o "$RELEASE_DIR/bundle-cli" --source-map) || { echo "ncc bundling failed"; exit 1; }
  # Include dataset if present in the repo
  if [ -d "$ROOT_DIR/packages/knowledge-hub/dataset" ]; then
    cp -R "$ROOT_DIR/packages/knowledge-hub/dataset" "$RELEASE_DIR/bundle-cli/" || { echo "Failed to copy dataset"; exit 1; }
  fi
  # Remove unnecessary package.json from bundle-cli (created by ncc)
  if [ -f "$RELEASE_DIR/bundle-cli/package.json" ]; then
    rm "$RELEASE_DIR/bundle-cli/package.json"
  fi
  # Generate TypeScript definitions from source
  echo "Generating TypeScript definitions..."
  (cd "$PKG_DIR" && npx dts-bundle-generator \
    --external-inlines @pair/content-ops @pair/knowledge-hub \
    --external-types commander chalk dotenv fs-extra markdown-it \
    --project tsconfig.json \
    -o "$RELEASE_DIR/bundle-cli/index.d.ts" \
    "src/cli.ts") || echo "Warning: dts-bundle-generator failed, skipping types"
else
  echo "Bundle requested but $PKG_DIR/dist/cli.js not found"
  exit 1
fi

# Create bin wrappers and a top-level executable that delegates to bin/ to avoid duplicating logic
mkdir -p "$RELEASE_DIR/bin"

# Create bin wrapper (calls node on bundle-cli/index.js)
BIN_WRAPPER="$RELEASE_DIR/bin/$EXE_NAME"
cat > "$BIN_WRAPPER" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail

# Get the actual directory of this script, resolving symlinks
SCRIPT_DIR="$(cd "$(dirname "$(readlink -f "${BASH_SOURCE[0]}" || echo "${BASH_SOURCE[0]}")")" && pwd)"
PKG_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

# Run the bundled artifact directly
if [ -f "$PKG_DIR/bundle-cli/index.js" ]; then
  exec node "$PKG_DIR/bundle-cli/index.js" "$@"
else
  echo "Error: bundle-cli/index.js not found in $PKG_DIR/bundle-cli/"
  exit 1
fi
EOF
chmod +x "$BIN_WRAPPER"

# Create top-level wrapper that points directly to bundle
TOP_WRAPPER="$RELEASE_DIR/$EXE_NAME"
cat > "$TOP_WRAPPER" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail

# Get the actual directory of this script, resolving symlinks
SCRIPT_DIR="$(cd "$(dirname "$(readlink -f "${BASH_SOURCE[0]}" || echo "${BASH_SOURCE[0]}")")" && pwd)"

# Run the bundled artifact directly
if [ -f "$SCRIPT_DIR/bundle-cli/index.js" ]; then
  exec node "$SCRIPT_DIR/bundle-cli/index.js" "$@"
else
  echo "Error: bundle-cli/index.js not found in $SCRIPT_DIR/bundle-cli/"
  exit 1
fi
EOF
chmod +x "$TOP_WRAPPER"

# Create a simple Windows shim (pair-cli.cmd) to call node on bundle-cli\index.js
WIN_SHIM="$RELEASE_DIR/$EXE_NAME.cmd"
cat > "$WIN_SHIM" <<'EOF'
@echo off
set DIR=%~dp0
REM If node is not installed, inform the user
where node >nul 2>&1 || (
  echo Node.js not found. Please install Node.js from https://nodejs.org/ and re-run.
  exit /b 1
)

if exist "%~dp0bundle-cli\\index.js" (
  node "%DIR%bundle-cli\\index.js" %*
) else (
  echo Error: bundle-cli\index.js not found
  exit /b 1
)
EOF


ZIP_NAME="pair-cli-manual-$VERSION.zip"
mkdir -p "$ROOT_DIR/release"
pushd "$ROOT_DIR/release" > /dev/null
rm -f "$ZIP_NAME" "$ZIP_NAME.sha256"
echo "Creating zip: $ZIP_NAME (contents: pair-cli-manual-$VERSION/)"
zip -r "$ZIP_NAME" "pair-cli-manual-$VERSION" >/dev/null

if command -v sha256sum >/dev/null 2>&1; then
  sha256sum "$ZIP_NAME" | awk '{print $1}' > "$ZIP_NAME.sha256"
elif command -v shasum >/dev/null 2>&1; then
  shasum -a 256 "$ZIP_NAME" | awk '{print $1}' > "$ZIP_NAME.sha256"
else
  echo "Warning: no sha256 tool found, skipping checksum generation"
fi

echo "Produced: $(pwd)/$ZIP_NAME"
if [ -f "$ZIP_NAME.sha256" ]; then
  echo "Produced: $(pwd)/$ZIP_NAME.sha256"
fi
popd > /dev/null

echo "Packaging complete. Inspect $RELEASE_DIR and release/$ZIP_NAME before committing."
