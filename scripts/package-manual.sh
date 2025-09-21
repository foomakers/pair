#!/usr/bin/env bash
set -euo pipefail

# scripts/package-manual.sh
# Minimal packaging scaffold for manual-install artifacts (issue #19)
# Usage:
#   ./scripts/package-manual.sh [--dry-run] [--clean] <version>
#
# This script produces a bundled, self-contained JS artifact (ncc) inside the
# release directory. It is intended to be run in CI for producing reproducible
# bundle-based manual releases. The --clean option remains to remove release/.
#
# NOTE: This is a scaffold. It intentionally does not modify git or create commits.
# Review and approve before committing to the repo.

DRY_RUN=false
CLEAN=false
VERSION=""

# Parse args simply to support --dry-run and --clean and a version parameter
for a in "$@"; do
  case "$a" in
    --dry-run)
      DRY_RUN=true
      ;;
    --clean)
      CLEAN=true
      ;;
    --help|-h)
      echo "Usage: $0 [--dry-run] [--clean] <version>"
      exit 0
      ;;
    *)
      if [ -z "$VERSION" ]; then
        VERSION="$a"
      fi
      ;;
  esac
done

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

if [ "$CLEAN" = true ] && [ -z "$VERSION" ]; then
  echo "Cleaning release/ (no version provided)..."
  if [ "$DRY_RUN" = true ]; then
    echo "[dry-run] would remove $ROOT_DIR/release"
    exit 0
  fi
  rm -rf "$ROOT_DIR/release"
  echo "Clean complete."
  exit 0
fi

if [ -z "$VERSION" ]; then
  echo "Error: version required. Usage: $0 [--dry-run] [--clean] <version> or set VERSION env var"
  exit 1
fi

PKG_DIR="$ROOT_DIR/apps/pair-cli"
RELEASE_DIR="$ROOT_DIR/release/pair-cli-manual-$VERSION"

echo "Packaging pair-cli manual artifact for version=$VERSION"

# Preflight checks: ensure required commands exist
missing_tools=()
require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    missing_tools+=("$1")
  fi
}

# tools we expect: node, pnpm, npx, zip, and either sha256sum or shasum
require_cmd node
require_cmd pnpm
require_cmd npx
require_cmd zip
if ! command -v sha256sum >/dev/null 2>&1 && ! command -v shasum >/dev/null 2>&1; then
  missing_tools+=("sha256sum|shasum")
fi

if [ ${#missing_tools[@]} -gt 0 ]; then
  echo "Error: missing required tools: ${missing_tools[*]}"
  echo "Please install the missing tools or run this script in CI where they are available."
  exit 1
fi

if [ "$DRY_RUN" = true ]; then
  echo "[dry-run] preflight checks passed: node, pnpm, npx, zip, sha256 tool available"
fi

if [ ! -d "$PKG_DIR" ]; then
  echo "Error: expected package directory $PKG_DIR not found"
  exit 1
fi

if [ ! -d "$PKG_DIR/dist" ]; then
  echo "Error: expected build outputs at $PKG_DIR/dist not found. Run: pnpm -w build"
  exit 1
fi

rm -rf "$RELEASE_DIR"
if [ "$DRY_RUN" = true ]; then
  echo "[dry-run] would prepare release directory: $RELEASE_DIR"
else
  mkdir -p "$RELEASE_DIR"
fi

echo "Copying metadata..."
if [ "$DRY_RUN" = true ]; then
  echo "[dry-run] would copy package.json, README.md, config.json and LICENSE into $RELEASE_DIR if present"
else
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
fi

# Copy getting-started documentation for end users
if [ -d "$ROOT_DIR/docs/getting-started" ]; then
  echo "Copying getting-started documentation for end users..."
  if [ "$DRY_RUN" = true ]; then
    echo "[dry-run] would copy docs/getting-started to $RELEASE_DIR/docs/"
  else
    mkdir -p "$RELEASE_DIR/docs"
    cp -R "$ROOT_DIR/docs/getting-started" "$RELEASE_DIR/docs/"
  fi
fi

# Modify README.md for manual release (fix quickstart link path since docs are now included)
if [ -f "$RELEASE_DIR/README.md" ] && [ "$DRY_RUN" = false ]; then
  echo "Fixing quickstart link path in README.md for manual release..."
  # Use a small Node script for portable in-place replacement (works on macOS & Linux)
  node -e "const fs=require('fs');const p='$RELEASE_DIR/README.md';let s=fs.readFileSync(p,'utf8');s=s.replace(/\.\.\/\.\.\/docs\/getting-started\/01-quickstart\.md/g,'docs/getting-started/01-quickstart.md');fs.writeFileSync(p,s);" || {
    echo "Warning: README path rewrite failed; leaving original README.md in place"
  }
fi

# Create a clean package.json for the bundled artifact
if [ -f "$RELEASE_DIR/package.json" ]; then
  echo "Creating clean package.json for bundled artifact..."
  if [ "$DRY_RUN" = true ]; then
    echo "[dry-run] would create minimal package.json with version $VERSION in $RELEASE_DIR"
  else
    # Use a here-doc to avoid complex quoting issues when embedding JS in shell
    (cd "$RELEASE_DIR" && NODE_VERSION="$VERSION" node <<'NODE'
const fs = require('fs');
const original = JSON.parse(fs.readFileSync('package.json', 'utf8'));

// Create minimal package.json for self-contained bundle
const cleanPkg = {
  name: original.name,
  version: process.env.NODE_VERSION,
  description: original.description,
  main: 'bundle-cli/index.js',
  types: 'bundle-cli/index.d.ts',
  bin: { 'pair-cli': './bin/pair-cli' },
  files: ['bundle-cli', 'bin', 'README.md', 'LICENSE', 'config.json', 'docs'],
  author: original.author,
  license: original.license || 'MIT'
};

fs.writeFileSync('package.json', JSON.stringify(cleanPkg, null, 2) + '\n');
NODE
    )
  fi
fi

# Note: package.json and config.json are needed in root for the bundled artifact

# Determine executable name (default: pair-cli)
EXE_NAME="pair-cli"

# Produce a bundled single-file JS artifact using ncc
echo "Creating ncc bundle inside artifact..."
# Ensure ncc is available via npx (will auto-install if needed)
if [ -f "$PKG_DIR/dist/cli.js" ]; then
  # Run ncc from the package directory so dependency resolution (pnpm workspace) works
  if [ "$DRY_RUN" = true ]; then
    echo "[dry-run] would run: (cd $PKG_DIR && npx @vercel/ncc build dist/cli.js -o $RELEASE_DIR/bundle-cli --source-map)"
  else
    (cd "$PKG_DIR" && npx @vercel/ncc build "dist/cli.js" -o "$RELEASE_DIR/bundle-cli" --source-map) || { echo "ncc bundling failed"; exit 1; }
  fi
  # Include dataset if present in the repo
  if [ -d "$ROOT_DIR/packages/knowledge-hub/dataset" ]; then
    if [ "$DRY_RUN" = true ]; then
      echo "[dry-run] would copy dataset to $RELEASE_DIR/bundle-cli/"
    else
      cp -R "$ROOT_DIR/packages/knowledge-hub/dataset" "$RELEASE_DIR/bundle-cli/" || { echo "Failed to copy dataset"; exit 1; }
    fi
  fi
  # Remove unnecessary package.json from bundle-cli (created by ncc)
  if [ "$DRY_RUN" = true ]; then
    echo "[dry-run] would remove $RELEASE_DIR/bundle-cli/package.json if present"
  else
    if [ -f "$RELEASE_DIR/bundle-cli/package.json" ]; then
      rm "$RELEASE_DIR/bundle-cli/package.json"
    fi
  fi
  # Generate TypeScript definitions from source
  echo "Generating TypeScript definitions..."
  if [ "$DRY_RUN" = true ]; then
    echo "[dry-run] would run: (cd $PKG_DIR && npx dts-bundle-generator --external-inlines @pair/content-ops @pair/knowledge-hub --external-types commander chalk dotenv fs-extra markdown-it --project tsconfig.json -o $RELEASE_DIR/bundle-cli/index.d.ts src/cli.ts)"
  else
    (cd "$PKG_DIR" && npx dts-bundle-generator \
      --external-inlines @pair/content-ops @pair/knowledge-hub \
      --external-types commander chalk dotenv fs-extra markdown-it \
      --project tsconfig.json \
      -o "$RELEASE_DIR/bundle-cli/index.d.ts" \
      "src/cli.ts") || echo "Warning: dts-bundle-generator failed, skipping types"
  fi
else
  echo "Bundle requested but $PKG_DIR/dist/cli.js not found"
  exit 1
fi

# Create bin wrappers and a top-level executable that delegates to bin/ to avoid duplicating logic
if [ "$DRY_RUN" = true ]; then
  echo "[dry-run] would create bin wrappers under $RELEASE_DIR/bin"
else
  mkdir -p "$RELEASE_DIR/bin"
fi

# Create bin wrapper (calls node on bundle-cli/index.js)
BIN_WRAPPER="$RELEASE_DIR/bin/$EXE_NAME"
if [ "$DRY_RUN" = true ]; then
  echo "[dry-run] would create bin wrapper at $BIN_WRAPPER"
else
  cat > "$BIN_WRAPPER" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail

# Portable resolution of the script directory (works on macOS and Linux)
resolve_script_dir() {
  # http://mywiki.wooledge.org/BashFAQ/028
  local SOURCE="$1"
  while [ -L "$SOURCE" ]; do # resolve $SOURCE until the file is no longer a symlink
    local DIR
    DIR="$(cd -P "$(dirname "$SOURCE")" >/dev/null 2>&1 && pwd)"
    SOURCE="$(readlink "$SOURCE")"
    [[ $SOURCE != /* ]] && SOURCE="$DIR/$SOURCE"
  done
  cd -P "$(dirname "$SOURCE")" >/dev/null 2>&1 && pwd
}

SCRIPT_DIR="$(resolve_script_dir "${BASH_SOURCE[0]}")"
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
fi

# Create top-level wrapper that points directly to bundle
TOP_WRAPPER="$RELEASE_DIR/$EXE_NAME"
if [ "$DRY_RUN" = true ]; then
  echo "[dry-run] would create top-level wrapper at $TOP_WRAPPER"
else
  cat > "$TOP_WRAPPER" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail

# Portable resolution of the script directory (works on macOS and Linux)
resolve_script_dir() {
  local SOURCE="$1"
  while [ -L "$SOURCE" ]; do
    local DIR
    DIR="$(cd -P "$(dirname "$SOURCE")" >/dev/null 2>&1 && pwd)"
    SOURCE="$(readlink "$SOURCE")"
    [[ $SOURCE != /* ]] && SOURCE="$DIR/$SOURCE"
  done
  cd -P "$(dirname "$SOURCE")" >/dev/null 2>&1 && pwd
}

SCRIPT_DIR="$(resolve_script_dir "${BASH_SOURCE[0]}")"

# Run the bundled artifact directly
if [ -f "$SCRIPT_DIR/bundle-cli/index.js" ]; then
  exec node "$SCRIPT_DIR/bundle-cli/index.js" "$@"
else
  echo "Error: bundle-cli/index.js not found in $SCRIPT_DIR/bundle-cli/"
  exit 1
fi
EOF
  chmod +x "$TOP_WRAPPER"
fi

# Create a simple Windows shim (pair-cli.cmd) to call node on bundle-cli\index.js
WIN_SHIM="$RELEASE_DIR/$EXE_NAME.cmd"
if [ "$DRY_RUN" = true ]; then
  echo "[dry-run] would create Windows shim at $WIN_SHIM"
else
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
fi


ZIP_NAME="pair-cli-manual-$VERSION.zip"
if [ "$DRY_RUN" = true ]; then
  echo "[dry-run] would create zip: $ROOT_DIR/release/$ZIP_NAME and compute checksum"
else
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
fi
