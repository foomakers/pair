#!/usr/bin/env bash
set -euo pipefail

# Smoke test (preliminary): create the manual release-style CLI artifact using the
# standard packaging script and expose it for other smoke tests in the run.
# This script writes the packaged CLI path to "$TMP_DIR/packaged-cli".

source "$(dirname "$0")/../lib/utils.sh"

TEST_NAME="Create Installation Package (preliminary)"
echo "=== Running $TEST_NAME ==="

# Use runner-provided TMP_DIR and REPO_ROOT when available
if [ -z "${REPO_ROOT:-}" ]; then
  REPO_ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
fi
if [ -z "${TMP_DIR:-}" ]; then
  TMP_DIR="$REPO_ROOT/.tmp/smoke-test-$(date +%s)"
  mkdir -p "$TMP_DIR"
fi

# Use the real CLI version so auto-download from GitHub releases works.
# Fall back to a timestamp-based version only if package.json is missing.
if [ -z "${VERSION:-}" ]; then
  REAL_VERSION=$(node -e "console.log(require('$REPO_ROOT/apps/pair-cli/package.json').version)" 2>/dev/null || echo "")
  VERSION="${REAL_VERSION:-vmanual-smoke-$(date +%s)}"
fi
PACKAGE_SCRIPT="$REPO_ROOT/scripts/workflows/release/package-manual.sh"

# The runner already executes this script as its packaging preflight, BEFORE the
# scenario loop, and then again as CI_TESTS[0]. Packaging twice costs real minutes
# on a job whose duration is a governed number (AC6, #400), so the second pass
# asserts the artifact instead of rebuilding it.
PACKAGED_CLI_FILE="$TMP_DIR/packaged-cli"
if [ -f "$PACKAGED_CLI_FILE" ]; then
  EXISTING="$(cat "$PACKAGED_CLI_FILE")"
  log_info "Packaged CLI already produced by the preflight: $EXISTING"
  if [ ! -x "$EXISTING" ]; then
    log_fail "packaged-cli marker points at a path that is not an executable file: $EXISTING"
    exit 1
  fi
  log_succ "$TEST_NAME (artifact reused, packaged once per run)"
  exit 0
fi

log_info "Preflight: running package script in --dry-run mode for version $VERSION"

# A dry-run failure is a MISSING TOOL on a developer machine — worth skipping —
# and a broken build in CI, where "skip" would publish `✅ PASS` for a run in
# which nothing was packaged and nothing was asserted. That silently-green no-op
# is exactly the family #400 exists to remove, so in CI it is fatal.
if ! "$PACKAGE_SCRIPT" --dry-run "$VERSION"; then
  if [ "${IS_CI:-false}" = "true" ] || [ "${CI:-}" = "true" ]; then
    log_fail "package-manual.sh --dry-run failed in CI — the CLI could not be packaged, so nothing below ran"
    exit 1
  fi
  log_warn "package-manual.sh --dry-run failed (missing tools or env). Skipping package creation."
  exit 0
fi

log_info "Packaging real artifact for version $VERSION"
if ! "$PACKAGE_SCRIPT" "$VERSION"; then
  log_fail "package-manual.sh failed"
  exit 1
fi

VERSION_NORMALIZED="${VERSION#v}"
ZIP="$REPO_ROOT/release/pair-cli-manual-$VERSION_NORMALIZED.zip"

assert_file "$ZIP"

# Extract into the run's TMP_DIR so all scenarios can find the packaged CLI
EXTRACT_DIR="$TMP_DIR/package-artifact"
rm -rf "$EXTRACT_DIR" && mkdir -p "$EXTRACT_DIR"

if ! command -v unzip >/dev/null 2>&1; then
  log_fail "unzip command not found; cannot extract artifact"
  exit 1
fi

unzip -q "$ZIP" -d "$EXTRACT_DIR" || { log_fail "Failed to unzip $ZIP"; exit 1; }
ARTIFACT_DIR="$EXTRACT_DIR/pair-cli-manual-$VERSION_NORMALIZED"

if [ ! -d "$ARTIFACT_DIR" ]; then
  log_fail "Expected extracted artifact directory missing: $ARTIFACT_DIR"
  exit 1
fi

# Ensure top-level wrapper is executable
if [ ! -x "$ARTIFACT_DIR/pair-cli" ]; then
  chmod +x "$ARTIFACT_DIR/pair-cli" || true
fi

assert_file "$ARTIFACT_DIR/pair-cli"
assert_file "$ARTIFACT_DIR/bundle-cli/index.js"

# The artifact must never advertise a file it does not contain. `index.d.ts` is
# BEST EFFORT here — the artifact is executed via bin/, never imported, so types
# are optional (ADL 2026-08-12-manual-cli-artifact-types-are-optional.md) — and
# dts-bundle-generator currently fails against this repo's TypeScript. What is not
# optional is that `types` and the file agree: the packaging script emitted
# `types: bundle-cli/index.d.ts` unconditionally, BEFORE generation, so every
# failure shipped a dangling pointer. Asserted in both directions so neither the
# claim nor the file can drift away from the other.
DECLARED_TYPES="$(node -e "process.stdout.write(String(require('$ARTIFACT_DIR/package.json').types || ''))")"
if [ -f "$ARTIFACT_DIR/bundle-cli/index.d.ts" ]; then
  if [ "$DECLARED_TYPES" = "bundle-cli/index.d.ts" ]; then
    log_succ "artifact bundles index.d.ts and declares types"
  else
    log_fail "bundle-cli/index.d.ts exists but package.json declares types='$DECLARED_TYPES'"
    exit 1
  fi
elif [ -n "$DECLARED_TYPES" ]; then
  log_fail "package.json declares types='$DECLARED_TYPES' but bundle-cli/index.d.ts is not in the artifact — the artifact advertises a file it does not contain"
  exit 1
else
  log_succ "no index.d.ts bundled and package.json omits types (consistent — types are optional for this artifact)"
fi

# Publish the packaged CLI path for other scenarios
# Copy the entire extracted artifact into the run's TMP_DIR so it is stable for the entire run
ARTIFACT_COPY_DIR="$TMP_DIR/artifacts/pair-cli-manual-$VERSION_NORMALIZED"
rm -rf "$ARTIFACT_COPY_DIR"
mkdir -p "$(dirname "$ARTIFACT_COPY_DIR")"
cp -a "$ARTIFACT_DIR" "$ARTIFACT_COPY_DIR" || { log_fail "Failed to copy artifact to $ARTIFACT_COPY_DIR"; exit 1; }
chmod -R a+rX "$ARTIFACT_COPY_DIR" || true
PACKAGED_CLI_PATH="$ARTIFACT_COPY_DIR/pair-cli"
echo "$PACKAGED_CLI_PATH" > "$TMP_DIR/packaged-cli"
log_info "Packaged CLI artifact copied to $ARTIFACT_COPY_DIR and wrapper written to $TMP_DIR/packaged-cli"
# NOTE: Previously we executed a lifecycle preflight here to sanity-check the
# created bundle. That made the packaging step brittle (packaging succeeded but
# the lifecycle preflight could fail for unrelated reasons). For robustness we
# publish the packaged artifact and leave the lifecycle scenario execution to
# the main runner. If you want to run a local preflight, set RUN_LIFECYCLE_PRECHECK=1
# and the script will run the lifecycle test but it will not fail the packaging step
# on lifecycle failure.
if [ "${RUN_LIFECYCLE_PRECHECK:-}" = "1" ]; then
  SCENARIOS_DIR="$(dirname "$0")"
  if ! TEST_BINARY="$PACKAGED_CLI_PATH" "$SCENARIOS_DIR/lifecycle-kb.sh"; then
    log_warn "Lifecycle KB test failed when executed with packaged CLI (precheck). Continuing."
  else
    log_succ "Package creation + lifecycle precheck passed"
  fi
else
  log_info "Packaging complete. Skipping lifecycle precheck by default (set RUN_LIFECYCLE_PRECHECK=1 to enable)"
fi

echo "=== $TEST_NAME Completed ==="
exit 0
