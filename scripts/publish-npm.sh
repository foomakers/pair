#!/usr/bin/env bash
set -euo pipefail

# scripts/publish-npm.sh
# Publish a pair-cli TGZ to npmjs.org
# Usage: ./scripts/publish-npm.sh <tgz_path> [--dry-run]
#
# Requires NPM_TOKEN env var (CI) or active npm login (local).

REGISTRY="https://registry.npmjs.org/"
SCOPE="@foomakers"

TGZ_PATH=""
DRY_RUN=""

for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN="--dry-run" ;;
    *) TGZ_PATH="$arg" ;;
  esac
done

if [ -z "$TGZ_PATH" ]; then
  echo "Usage: $0 <tgz_path> [--dry-run]"
  echo "Example: $0 release/pair-cli-0.4.2.tgz"
  exit 1
fi

if [ ! -f "$TGZ_PATH" ]; then
  echo "Error: TGZ file not found: $TGZ_PATH"
  exit 1
fi

# Extract metadata from TGZ
TMPDIR=$(mktemp -d)
trap 'rm -rf "$TMPDIR"' EXIT

tar xzf "$TGZ_PATH" -C "$TMPDIR" --include='*/package.json' 2>/dev/null || \
  tar xzf "$TGZ_PATH" -C "$TMPDIR" 'package/package.json' 2>/dev/null || true

PKG_JSON=$(find "$TMPDIR" -name package.json -maxdepth 2 | head -n1)
if [ -z "$PKG_JSON" ]; then
  echo "Error: no package.json found inside $TGZ_PATH"
  exit 1
fi

PKG_NAME=$(node -e "console.log(JSON.parse(require('fs').readFileSync('$PKG_JSON','utf8')).name)")
PKG_VERSION=$(node -e "console.log(JSON.parse(require('fs').readFileSync('$PKG_JSON','utf8')).version)")
PKG_PRIVATE=$(node -e "console.log(JSON.parse(require('fs').readFileSync('$PKG_JSON','utf8')).private || false)")

echo "Package:  $PKG_NAME@$PKG_VERSION"
echo "Registry: $REGISTRY"
echo "TGZ:      $TGZ_PATH"
[ -n "$DRY_RUN" ] && echo "Mode:     DRY RUN"

# Validate metadata
if [ "$PKG_PRIVATE" = "true" ]; then
  echo "Error: package.private is true — cannot publish"
  exit 1
fi

if [[ "$PKG_NAME" != ${SCOPE}/* ]]; then
  echo "Error: package name must be scoped to $SCOPE. Found: $PKG_NAME"
  exit 1
fi

# Validate auth
if [ -n "${NPM_TOKEN:-}" ]; then
  echo "Auth:     NPM_TOKEN env var"
  npm config set "${SCOPE}:registry" "$REGISTRY"
  npm config set "//registry.npmjs.org/:_authToken" "$NPM_TOKEN"
elif npm whoami --registry "$REGISTRY" >/dev/null 2>&1; then
  echo "Auth:     npm login session"
else
  echo "Error: No NPM_TOKEN env var and not logged in to npm."
  echo "  CI:    set NPM_TOKEN secret"
  echo "  Local: run 'npm login --scope=$SCOPE'"
  exit 1
fi

# Publish
echo ""
echo "Publishing $PKG_NAME@$PKG_VERSION to $REGISTRY..."
if npm publish "$TGZ_PATH" --access public --registry "$REGISTRY" ${DRY_RUN:+"$DRY_RUN"}; then
  echo "Published successfully."
else
  EXIT_CODE=$?
  echo "Error: npm publish failed (exit $EXIT_CODE)"
  echo "  403/409 = version already exists"
  echo "  401     = token invalid or expired"
  exit $EXIT_CODE
fi

# Verify (skip for dry-run)
if [ -z "$DRY_RUN" ]; then
  echo ""
  echo "Verifying publication..."
  sleep 3
  if npm view "$PKG_NAME@$PKG_VERSION" version --registry "$REGISTRY" >/dev/null 2>&1; then
    PUBLISHED=$(npm view "$PKG_NAME@$PKG_VERSION" version --registry "$REGISTRY")
    echo "Verified: $PKG_NAME@$PUBLISHED is live on $REGISTRY"
  else
    echo "Warning: npm view did not find $PKG_NAME@$PKG_VERSION — may need a few seconds to propagate"
  fi
fi

echo ""
echo "Done."
