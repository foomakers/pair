#!/bin/bash

# Verification script for pair quickstart
# This script validates that the sample project works as expected
# Exit codes: 0 = success, 1 = failure, 2 = environment error

set -e  # Exit on any error

LOG_FILE="/tmp/pair-verify-$(date +%s).log"
exec > >(tee -a "$LOG_FILE") 2>&1

echo "🔍 Verifying pair sample project..."
echo "📝 Log file: $LOG_FILE"

# Function to cleanup on exit
cleanup() {
    local exit_code=$?
    if [ $exit_code -ne 0 ]; then
        echo "❌ Verification failed. Check log: $LOG_FILE"
    else
        echo "✅ Verification completed successfully"
        rm -f "$LOG_FILE"
    fi
    exit $exit_code
}

trap cleanup EXIT

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    echo "❌ Error: package.json not found. Run this script from the sample-project directory."
    echo "💡 Current directory: $(pwd)"
    echo "💡 Files here: $(ls -la)"
    exit 2
fi

# Check if node is available
if ! command -v node &> /dev/null; then
    echo "❌ Error: Node.js not found. Please install Node.js 18+"
    exit 2
fi

# Check Node version
NODE_VERSION=$(node --version | sed 's/v//')
REQUIRED_VERSION="18.0.0"

if ! [ "$(printf '%s\n' "$REQUIRED_VERSION" "$NODE_VERSION" | sort -V | head -n1)" = "$REQUIRED_VERSION" ]; then
    echo "❌ Error: Node.js version $NODE_VERSION is too old. Need 18.0.0 or higher"
    exit 2
fi

echo "✅ Node.js version: $NODE_VERSION"

# Check if npm is available
if ! command -v npm &> /dev/null; then
    echo "❌ Error: npm not found. Please install npm"
    exit 2
fi

echo "📦 Running sample project test..."
if npm test; then
    echo "✅ npm test passed"
else
    echo "❌ npm test failed"
    exit 1
fi

# Check if index.js exists and is executable
if [ ! -f "index.js" ]; then
    echo "❌ Error: index.js not found"
    exit 1
fi

# Make index.js executable if it has shebang
if head -1 index.js | grep -q "#!"; then
    chmod +x index.js
fi

echo "🚀 Running sample project..."
OUTPUT=$(node index.js 2>&1)
NODE_EXIT_CODE=$?

if [ $NODE_EXIT_CODE -ne 0 ]; then
    echo "❌ Error: index.js failed with exit code $NODE_EXIT_CODE"
    echo "📄 Output: $OUTPUT"
    exit 1
fi

echo "📄 Script output:"
echo "$OUTPUT"
echo ""

# Check for expected output lines
EXPECTED_LINE1="Hello from pair sample project!"
EXPECTED_LINE2="This is a minimal example for testing pair-cli installation."

OUTPUT_CHECK_PASSED=true

if ! echo "$OUTPUT" | grep -q "$EXPECTED_LINE1"; then
    echo "❌ Missing expected line: '$EXPECTED_LINE1'"
    OUTPUT_CHECK_PASSED=false
fi

if ! echo "$OUTPUT" | grep -q "$EXPECTED_LINE2"; then
    echo "❌ Missing expected line: '$EXPECTED_LINE2'"
    OUTPUT_CHECK_PASSED=false
fi

if [ "$OUTPUT_CHECK_PASSED" = true ]; then
    echo "✅ Sample project verification passed!"
    echo "� Summary:"
    echo "  - Node.js: $NODE_VERSION"
    echo "  - npm test: PASSED"
    echo "  - Script execution: PASSED"
    echo "  - Output validation: PASSED"
    exit 0
else
    echo "❌ Sample project verification failed!"
    echo "📄 Expected output lines:"
    echo "  '$EXPECTED_LINE1'"
    echo "  '$EXPECTED_LINE2'"
    echo "📄 Actual output:"
    echo "$OUTPUT"
    exit 1
fi