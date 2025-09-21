#!/usr/bin/env bash
set -euo pipefail

# Portable verification script for the sample project.
# - Ensures Node >= 18
# - Installs project dependencies (pnpm) if package.json exists
# - Uses `pnpm dlx` to invoke @pair/pair-cli when needed (no global install required)
# - Runs `npm test`, runs `node index.js`, and validates expected output lines.

LOG_FILE="/tmp/pair-verify-$(date +%s).log"
exec > >(tee -a "$LOG_FILE") 2>&1

cleanup() {
    local rc=$?
    if [ $rc -eq 0 ]; then
        echo "✅ Verification completed successfully"
        rm -f "$LOG_FILE" || true
    else
        echo "❌ Verification failed (exit $rc). See log: $LOG_FILE"
    fi
    exit $rc
}

trap cleanup EXIT

echo "🔍 Verifying pair sample project"
echo "📝 Log file: $LOG_FILE"

if [ ! -f package.json ]; then
    echo "❌ package.json not found. Run this script from the sample-project directory."
    exit 2
fi

if ! command -v node >/dev/null 2>&1; then
    echo "❌ Node.js not found. Please install Node.js 18+"
    exit 2
fi

NODE_MAJOR=$(node --version | sed 's/^v//' | cut -d. -f1)
if [ "${NODE_MAJOR:-0}" -lt 18 ]; then
    echo "❌ Node.js version $(node --version) is too old. Need 18+"
    exit 2
fi

echo "✅ Node.js $(node --version)"

if ! command -v npm >/dev/null 2>&1; then
    echo "❌ npm not found"
    exit 2
fi

# Install deps for sample project if package.json exists
if [ -f package.json ]; then
    echo "📦 Installing sample-project dependencies (pnpm)..."
    if command -v pnpm >/dev/null 2>&1; then
        pnpm install --frozen-lockfile || pnpm install
    else
        # fall back to npm install if pnpm not present (shouldn't happen on CI after setup)
        npm install
    fi
fi

echo "🔧 Checking pair-cli availability via pnpm dlx..."
PAIR_CLI_OK=0
if pnpm dlx --version >/dev/null 2>&1; then
    # attempt to run pair-cli via pnpm dlx and read version
    if pnpm dlx @pair/pair-cli --version >/dev/null 2>&1; then
        PAIR_CLI_OK=1
    fi
fi

if [ $PAIR_CLI_OK -eq 1 ]; then
    echo "✅ pair-cli (via pnpm dlx) is available"
else
    echo "⚠️ pair-cli not available via pnpm dlx; verify.sh will continue but some checks may be skipped"
fi

echo "📦 Running project tests"
if npm test; then
    echo "✅ npm test passed"
else
    echo "❌ npm test failed"
    exit 1
fi

if [ ! -f index.js ]; then
    echo "❌ index.js not found"
    exit 1
fi

echo "🚀 Running sample project"
OUTPUT=$(node index.js 2>&1)
EXIT_CODE=$?
if [ $EXIT_CODE -ne 0 ]; then
    echo "❌ index.js exited with $EXIT_CODE"
    echo "$OUTPUT"
    exit 1
fi

echo "📄 Script output:"; echo "$OUTPUT"; echo

EXPECTED_LINE1="Hello from pair sample project!"
EXPECTED_LINE2="This is a minimal example for testing pair-cli installation."

OK=true
if ! printf "%s" "$OUTPUT" | grep -qF "$EXPECTED_LINE1"; then
    echo "❌ Missing expected line: $EXPECTED_LINE1"
    OK=false
fi
if ! printf "%s" "$OUTPUT" | grep -qF "$EXPECTED_LINE2"; then
    echo "❌ Missing expected line: $EXPECTED_LINE2"
    OK=false
fi

if [ "$OK" = true ]; then
    echo "✅ Sample project verification passed"
    exit 0
else
    echo "❌ Sample project verification failed";
    exit 1
fi