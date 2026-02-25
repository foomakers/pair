#!/usr/bin/env bash
set -e

# Default values
BINARY_PATH=""
KB_SOURCE=""
SCENARIOS_DIR="$(dirname "$0")/scenarios"
TMP_DIR=""
REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"

# Help function
usage() {
  echo "Usage: $0 [--binary <path>] [--kb-source <path>] [--cleanup] [--ci] [--offline-only]"
  echo "  --binary       Path to the 'pair' executable to test."
  echo "                 If omitted, defaults to detected 'apps/pair-cli/dist/cli.js'"
  echo "  --kb-source    Path to a local Knowledge Base directory."
  echo "                 If omitted, defaults to detected 'packages/knowledge-hub/dataset'"
  echo "  --cleanup      Remove temporary directories after success"
  echo "  --ci           Run in CI mode (enables cleanup, detailed logs, and selects CI-safe tests)"
  echo "  --offline-only Only run scenarios tagged OFFLINE_SAFE=true (no network required)"
  exit 1
}

# Parse args
CLEANUP="false"
IS_CI="false"
OFFLINE_ONLY="false"

while [[ "$#" -gt 0 ]]; do
  case $1 in
    --binary) BINARY_PATH="$2"; shift ;;
    --kb-source) KB_SOURCE="$2"; shift ;;
    --cleanup) CLEANUP="true" ;;
    --ci)
      IS_CI="true"
      CLEANUP="true"
      export PAIR_DIAG=1
      ;;
    --offline-only) OFFLINE_ONLY="true" ;;
    --help) usage ;;
    *) echo "Unknown parameter: $1"; usage ;;
  esac
  shift
done

if [ "$IS_CI" = "true" ]; then
    echo "---------------------------------------------------"
    echo "Running in CI Mode"
    echo " - Cleanup: Enabled"
    echo " - Diagnostics: Enabled (PAIR_DIAG=1)"
    echo "---------------------------------------------------"
fi

# --- Auto-Detection: Binary ---
if [ -z "$BINARY_PATH" ]; then
  echo "No --binary specified. Attempting auto-detection..."

  # Try standard build output
  DEFAULT_DIST="$REPO_ROOT/apps/pair-cli/dist/cli.js"

  if [ -f "$DEFAULT_DIST" ]; then
    echo "Found built CLI at: $DEFAULT_DIST"
    BINARY_PATH="node $DEFAULT_DIST"
  else
    echo "Built CLI not found at $DEFAULT_DIST — attempting build..."
    if (cd "$REPO_ROOT" && pnpm --filter @pair/pair-cli build 2>&1); then
      if [ -f "$DEFAULT_DIST" ]; then
        echo "Build succeeded. Using: $DEFAULT_DIST"
        BINARY_PATH="node $DEFAULT_DIST"
      else
        echo "Warning: Build completed but $DEFAULT_DIST still not found."
        echo "Will attempt packaging preflight later to provide a packaged CLI for the run."
      fi
    else
      echo "Warning: Build failed. Will attempt packaging preflight later."
    fi
  fi
fi

# Ensure BINARY_PATH is usable (only when provided)
if [ -n "$BINARY_PATH" ]; then
  # If it starts with "node ", we skip file check on the whole string
  if [[ "$BINARY_PATH" != node\ * ]] && [ ! -x "$BINARY_PATH" ] && [ ! -f "$BINARY_PATH" ]; then
      echo "Error: Binary not found or not executable: $BINARY_PATH"
      exit 1
  fi
fi


# --- Auto-Detection: KB Source ---
if [ -z "$KB_SOURCE" ]; then
  DEFAULT_KB="$REPO_ROOT/packages/knowledge-hub/dataset"
  if [ -d "$DEFAULT_KB" ]; then
    echo "Auto-detected KB Source: $DEFAULT_KB"
    KB_SOURCE="$DEFAULT_KB"
  else
    echo "Warning: KB Source not found at defaults. Offline/Lifecycle tests may fail."
  fi
fi

# Detect absolute path for KB Source if provided
if [ -n "$KB_SOURCE" ]; then
  if [[ "$KB_SOURCE" != /* ]]; then
    KB_SOURCE="$(pwd)/$KB_SOURCE"
  fi
fi

# Create global temp dir with naming: smoke-tests.[yyyyMMdd.hhMMss].[hash]
# Get current datetime in format yyyyMMdd.hhMMss
DATETIME=$(date +"%Y%m%d.%H%M%S")
# Generate a short random hash (8 characters)
RANDOM_HASH=$(openssl rand -hex 4 2>/dev/null || cat /dev/urandom | tr -dc 'a-f0-9' | head -c 8)
TMP_DIR_NAME="smoke-tests.${DATETIME}.${RANDOM_HASH}"

if [ -n "${RUNNER_TEMP:-}" ]; then
  TMP_DIR="${RUNNER_TEMP}/${TMP_DIR_NAME}"
  mkdir -p "$TMP_DIR"
else
  mkdir -p "$REPO_ROOT/.tmp"
  TMP_DIR="$REPO_ROOT/.tmp/${TMP_DIR_NAME}"
  mkdir -p "$TMP_DIR"
fi

echo "Detailed logs will be available in $TMP_DIR"


# Export variables for scenarios
# Convert relative binary path to absolute path to ensure it works from any working directory
# Guard: leave TEST_BINARY empty when BINARY_PATH is unset so the packaging
# preflight (below) or ensure_packaged_cli in utils.sh can still provide one.
if [ -n "$BINARY_PATH" ]; then
  if [[ "$BINARY_PATH" == node\ * ]]; then
    # For "node ./path/to/cli.js" format, extract and convert the path
    binary_rel_path="${BINARY_PATH#node }"
    if [[ "$binary_rel_path" != /* ]]; then
      binary_rel_path="$(pwd)/$binary_rel_path"
    fi
    export TEST_BINARY="node $binary_rel_path"
  else
    # For direct binary path, convert to absolute if relative
    if [[ "$BINARY_PATH" != /* ]]; then
      export TEST_BINARY="$(pwd)/$BINARY_PATH"
    else
      export TEST_BINARY="$BINARY_PATH"
    fi
  fi
fi
export KB_SOURCE_PATH="$KB_SOURCE" # Can be empty
export TMP_DIR="$TMP_DIR"
export REPO_ROOT="$REPO_ROOT"

# --- Sanitize environment for child processes
# Some environment keys originating from pnpm workspace config can end up as
# npm_config_* vars which trigger noisy warnings from npm (e.g. "Unknown env config ...").
# Clear known problematic npm_config_* keys so scenario runs remain quiet and
# consistent across CI and local runs.
# If additional keys are observed, add them here.
clear_problematic_npm_envs() {
  unset npm_config_cleanup_unused_catalogs
  unset npm_config_catalog
  unset npm_config_verify_deps_before_run
  unset npm_config__jsr_registry
}

# Clear before running any child scenarios so they inherit a clean environment
clear_problematic_npm_envs

# --- Preliminary: Ensure packaged CLI artifact exists for the run
# The packaging scenario writes the packaged CLI absolute path to $TMP_DIR/packaged-cli
PACKAGED_CLI_FILE="$TMP_DIR/packaged-cli"
PACKAGING_SCRIPT="$SCENARIOS_DIR/00-create-install-package.sh"

if [ -f "$PACKAGED_CLI_FILE" ]; then
  export TEST_BINARY="$(cat "$PACKAGED_CLI_FILE")"
  echo "Using existing packaged CLI from $PACKAGED_CLI_FILE"
else
  if [ -f "$PACKAGING_SCRIPT" ]; then
    echo "Packaged CLI not found; running preliminary packaging scenario: $PACKAGING_SCRIPT"
    if "$PACKAGING_SCRIPT"; then
      if [ -f "$PACKAGED_CLI_FILE" ]; then
        export TEST_BINARY="$(cat "$PACKAGED_CLI_FILE")"
        echo "Packaging step produced CLI at: $TEST_BINARY"
      else
        echo "Warning: packaging scenario completed but did not produce $PACKAGED_CLI_FILE"
      fi
    else
      echo "Warning: preliminary packaging scenario failed; continuing without packaged CLI"
    fi
  else
    echo "Packaging script not present: $PACKAGING_SCRIPT"
  fi
fi

# --- Final guard: TEST_BINARY must be set and must not be a directory ---
if [ -z "${TEST_BINARY:-}" ]; then
  echo "Error: No usable CLI binary found. Either:"
  echo "  1. Build the project: pnpm --filter @pair/pair-cli build"
  echo "  2. Provide --binary <path>"
  exit 1
fi
if [ -d "$TEST_BINARY" ]; then
  echo "Error: TEST_BINARY points to a directory ($TEST_BINARY), not a file."
  echo "This usually means the build step did not produce apps/pair-cli/dist/cli.js."
  exit 1
fi

# --- Reporting Setup ---
REPORT_FILE="$TMP_DIR/smoke-report.md"
echo "# Smoke Test Report" > "$REPORT_FILE"
echo "" >> "$REPORT_FILE"
echo "**Date:** $(date)" >> "$REPORT_FILE"
echo "**Binary Tested:** \`$BINARY_PATH\`" >> "$REPORT_FILE"
echo "**Node Version:** \`$(node -v)\`" >> "$REPORT_FILE"
echo "**OS:** \`$(uname -ms)\`" >> "$REPORT_FILE"
echo "**Execution Mode:** $( [ "$IS_CI" = "true" ] && echo "CI" || echo "Local" )" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"
echo "## Test Summary" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"
echo "| Scenario | Status |" >> "$REPORT_FILE"
echo "|----------|--------|" >> "$REPORT_FILE"

# Run Scenarios
FAILED_TESTS=()

# Check if a scenario is offline-safe by sourcing its OFFLINE_SAFE variable.
# Scenarios without the variable are treated as offline-safe (default true).
is_offline_safe() {
  local script="$1"
  local val
  val=$(grep -m1 '^OFFLINE_SAFE=' "$script" 2>/dev/null | cut -d= -f2)
  [ "${val:-true}" = "true" ]
}

run_scenario() {
  local script="$1"
  local name=$(basename "$script")
  echo "---------------------------------------------------"
  echo "Running Scenario: $name"
  
  # Run in subshell
  if "$script"; then
    echo -e "\033[0;32m[PASS]\033[0m $name"
    echo "| $name | ✅ PASS |" >> "$REPORT_FILE"
  else
    echo -e "\033[0;31m[FAIL]\033[0m $name"
    FAILED_TESTS+=("$name")
    echo "| $name | ❌ FAIL |" >> "$REPORT_FILE"
  fi
}

# Find and run scenarios
if [ "$IS_CI" = "true" ]; then
  # Explicit list of CI-safe smoke tests
  # We exclude any future tests that might require external resources or internet if strictly air-gapped
  CI_TESTS=(
    "install-basic.sh"
    "package.sh"
    "00-create-install-package.sh"
    "bundle-content.sh"
    "links.sh"
    "lifecycle-kb.sh"
    "validate-config.sh"
    "kb-validate.sh"
    "source-resolution.sh"
    "install-preconditions.sh"
    "default-resolution.sh"
  )
  
  for t in "${CI_TESTS[@]}"; do
    script="$SCENARIOS_DIR/$t"
    if [ -f "$script" ]; then
        if [ "$OFFLINE_ONLY" = "true" ] && ! is_offline_safe "$script"; then
          echo "  Skipping (not offline-safe): $t"
          continue
        fi
        run_scenario "$script"
    else
        echo -e "\033[0;31m[ERROR]\033[0m CI Test not found: $t"
        FAILED_TESTS+=("$t (missing)")
        echo "| $t | ⚠️ MISSING |" >> "$REPORT_FILE"
    fi
  done
else
  # Default: Run all discovered scenarios
  # Run the preliminary packaging scenario first if present (ensures packaged CLI is prepared for offline tests)
  PRELIM="$SCENARIOS_DIR/00-create-install-package.sh"
  if [ -f "$PRELIM" ]; then
    echo "Running preliminary packaging scenario first: $(basename "$PRELIM")"
    run_scenario "$PRELIM"
  fi

  for script in "$SCENARIOS_DIR"/*.sh; do
    [ -e "$script" ] || continue
    # Skip the prelim script we already executed
    if [ "$(basename "$script")" = "00-create-install-package.sh" ]; then
      continue
    fi
    if [ "$OFFLINE_ONLY" = "true" ] && ! is_offline_safe "$script"; then
      echo "  Skipping (not offline-safe): $(basename "$script")"
      continue
    fi
    run_scenario "$script"
  done
fi

echo "---------------------------------------------------"
echo "" >> "$REPORT_FILE"

if [ ${#FAILED_TESTS[@]} -eq 0 ]; then
  echo -e "\033[0;32mAll scenarios passed successfully!\033[0m"
  echo "## Result" >> "$REPORT_FILE"
  echo "✅ **SUCCESS** - All tests passed." >> "$REPORT_FILE"
  
  echo "Report generated at: $REPORT_FILE"
  
  if [ "$CLEANUP" = "true" ]; then
      echo "Cleaning up $TMP_DIR..."
      # We might want to keep the report?
      # If cleanup is true, we usually delete everything. 
      # In CI we might output to stdout before deleting.
      if [ "$IS_CI" = "true" ]; then
          echo "--- REPORT CONTENT ---"
          cat "$REPORT_FILE"
          echo "----------------------"

          # If running in GitHub Actions, append to Step Summary
          if [ -n "$GITHUB_STEP_SUMMARY" ]; then
            cat "$REPORT_FILE" >> "$GITHUB_STEP_SUMMARY"
          fi
      fi
      rm -rf "$TMP_DIR"
  else
      echo "Artifacts and Report kept in $TMP_DIR"
  fi
  exit 0
else
  echo -e "\033[0;31mLog failures detected in:\033[0m"
  for t in "${FAILED_TESTS[@]}"; do
    echo " - $t"
  done
  
  echo "## Result" >> "$REPORT_FILE"
  echo "❌ **FAILURE** - ${#FAILED_TESTS[@]} test(s) failed." >> "$REPORT_FILE"
  echo "" >> "$REPORT_FILE"
  echo "### Failed Tests" >> "$REPORT_FILE"
  for t in "${FAILED_TESTS[@]}"; do
      echo "- $t" >> "$REPORT_FILE"
  done
  
  echo "Check detailed logs in $TMP_DIR"
  echo "Report generated at: $REPORT_FILE"
  
  # Even on failure, if cleanup is requested (CI), we might want to dump logs
  if [ "$IS_CI" = "true" ]; then
      echo "--- REPORT CONTENT ---"
      cat "$REPORT_FILE"
      echo "----------------------"
      
      # If running in GitHub Actions, append to Step Summary
      if [ -n "$GITHUB_STEP_SUMMARY" ]; then
        cat "$REPORT_FILE" >> "$GITHUB_STEP_SUMMARY"
      fi
  fi
  
  exit 1
fi
