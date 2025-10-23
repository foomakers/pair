#!/bin/bash
#
# diagnose-install.sh
# Diagnostic script for pair-cli installation and environment
#
# Usage: bash scripts/diagnose-install.sh
#
# This script collects minimal diagnostic information for troubleshooting
# pair-cli installation issues. It does not send any data over the network.
#

set -e

# Color codes for output (if terminal supports it)
if [ -t 1 ]; then
    RED='\033[0;31m'
    GREEN='\033[0;32m'
    YELLOW='\033[1;33m'
    BLUE='\033[0;34m'
    NC='\033[0m' # No Color
else
    RED=''
    GREEN=''
    YELLOW=''
    BLUE=''
    NC=''
fi

echo "🔍 pair-cli Installation Diagnostics"
echo "======================================"
echo ""

# Helper function for section headers
print_section() {
    echo -e "${BLUE}📋 $1${NC}"
    echo "----------------------------------------"
}

# Helper function for status indicators
print_status() {
    local status="$1"
    local message="$2"
    if [ "$status" = "ok" ]; then
        echo -e "  ${GREEN}✓${NC} $message"
    elif [ "$status" = "warn" ]; then
        echo -e "  ${YELLOW}⚠${NC} $message"
    elif [ "$status" = "error" ]; then
        echo -e "  ${RED}✗${NC} $message"
    else
        echo -e "  ${NC}ℹ${NC} $message"
    fi
}

# System Information
print_section "System Information"

# OS and Architecture
if command -v uname >/dev/null 2>&1; then
    OS_INFO=$(uname -a 2>/dev/null || echo "uname failed")
    print_status "info" "OS: $OS_INFO"
else
    print_status "warn" "uname command not available"
fi

# Platform detection
if [ "$(uname -s 2>/dev/null)" = "Darwin" ]; then
    PLATFORM="macOS"
    if command -v sw_vers >/dev/null 2>&1; then
        MACOS_VERSION=$(sw_vers -productVersion 2>/dev/null || echo "unknown")
        print_status "info" "Platform: $PLATFORM $MACOS_VERSION"
    else
        print_status "info" "Platform: $PLATFORM (version unknown)"
    fi
elif [ "$(uname -s 2>/dev/null)" = "Linux" ]; then
    PLATFORM="Linux"
    if [ -f /etc/os-release ]; then
        . /etc/os-release
        print_status "info" "Platform: $PLATFORM ($NAME $VERSION_ID)"
    else
        print_status "info" "Platform: $PLATFORM (distribution unknown)"
    fi
else
    PLATFORM=$(uname -s 2>/dev/null || echo "unknown")
    print_status "info" "Platform: $PLATFORM"
fi

echo ""

# Node.js Information
print_section "Node.js Information"

if command -v node >/dev/null 2>&1; then
    NODE_VERSION=$(node --version 2>/dev/null || echo "version check failed")
    print_status "ok" "Node.js: $NODE_VERSION"
    
    # Check if Node version meets requirements (18+)
    NODE_MAJOR=$(echo "$NODE_VERSION" | sed 's/v\([0-9]*\).*/\1/')
    if [ "$NODE_MAJOR" -ge 18 ] 2>/dev/null; then
        print_status "ok" "Node.js version meets requirements (18+)"
    else
        print_status "warn" "Node.js version may be too old (requires 18+)"
    fi
else
    print_status "error" "Node.js not found in PATH"
fi

# Node installation location
if command -v node >/dev/null 2>&1; then
    NODE_PATH=$(which node 2>/dev/null || echo "path unknown")
    print_status "info" "Node.js location: $NODE_PATH"
fi

echo ""

# Package Manager Information
print_section "Package Managers"

# npm
if command -v npm >/dev/null 2>&1; then
    NPM_VERSION=$(npm --version 2>/dev/null || echo "version check failed")
    print_status "ok" "npm: $NPM_VERSION"
    
    NPM_PREFIX=$(npm config get prefix 2>/dev/null || echo "unknown")
    print_status "info" "npm global prefix: $NPM_PREFIX"
else
    print_status "warn" "npm not found in PATH"
fi

# pnpm
if command -v pnpm >/dev/null 2>&1; then
    PNPM_VERSION=$(pnpm --version 2>/dev/null || echo "version check failed")
    print_status "ok" "pnpm: $PNPM_VERSION"
else
    print_status "info" "pnpm not installed (optional)"
fi

echo ""

# pair-cli Information
print_section "pair-cli Installation"

if command -v pair-cli >/dev/null 2>&1; then
    PAIR_VERSION=$(pair-cli --version 2>/dev/null || echo "version check failed")
    print_status "ok" "pair-cli: $PAIR_VERSION"
    
    PAIR_PATH=$(which pair-cli 2>/dev/null || echo "path unknown")
    print_status "info" "pair-cli location: $PAIR_PATH"
else
    print_status "error" "pair-cli not found in PATH"
fi

# Check npm global installation
if command -v npm >/dev/null 2>&1; then
    NPM_PAIR_INFO=$(npm list -g @pair/pair-cli 2>/dev/null || echo "not installed via npm")
    if echo "$NPM_PAIR_INFO" | grep -q "@pair/pair-cli"; then
        print_status "ok" "npm global installation detected"
        print_status "info" "npm install info: $NPM_PAIR_INFO"
    else
        print_status "info" "not installed via npm globally"
    fi
fi

# Check pnpm global installation
if command -v pnpm >/dev/null 2>&1; then
    PNPM_PAIR_INFO=$(pnpm list -g @pair/pair-cli 2>/dev/null || echo "not installed via pnpm")
    if echo "$PNPM_PAIR_INFO" | grep -q "@pair/pair-cli"; then
        print_status "ok" "pnpm global installation detected"
    else
        print_status "info" "not installed via pnpm globally"
    fi
fi

echo ""

# Environment Information
print_section "Environment Variables"

print_status "info" "PATH: $PATH"

if [ -n "$NODE_PATH" ]; then
    print_status "info" "NODE_PATH: $NODE_PATH"
fi

if [ -n "$NPM_CONFIG_PREFIX" ]; then
    print_status "info" "NPM_CONFIG_PREFIX: $NPM_CONFIG_PREFIX"
fi

echo ""

# Permissions Check
print_section "Permissions Check"

if command -v npm >/dev/null 2>&1; then
    NPM_PREFIX=$(npm config get prefix 2>/dev/null || echo "unknown")
    if [ "$NPM_PREFIX" != "unknown" ] && [ -d "$NPM_PREFIX" ]; then
        if [ -w "$NPM_PREFIX" ]; then
            print_status "ok" "npm prefix directory is writable"
        else
            print_status "warn" "npm prefix directory is not writable (may need permission fix)"
        fi
    else
        print_status "warn" "npm prefix directory not found or invalid"
    fi
fi

echo ""

# Common Issues Check
print_section "Common Issues Check"

# Check for multiple Node installations
NODE_LOCATIONS=$(whereis node 2>/dev/null | cut -d: -f2- || echo "")
if [ -n "$NODE_LOCATIONS" ]; then
    NODE_COUNT=$(echo "$NODE_LOCATIONS" | wc -w)
    if [ "$NODE_COUNT" -gt 1 ]; then
        print_status "warn" "Multiple Node.js installations detected: $NODE_LOCATIONS"
    else
        print_status "ok" "Single Node.js installation found"
    fi
fi

# Check if npm cache might be corrupted
if command -v npm >/dev/null 2>&1; then
    NPM_CACHE_DIR=$(npm config get cache 2>/dev/null || echo "unknown")
    if [ "$NPM_CACHE_DIR" != "unknown" ] && [ -d "$NPM_CACHE_DIR" ]; then
        CACHE_SIZE=$(du -sh "$NPM_CACHE_DIR" 2>/dev/null | cut -f1 || echo "unknown")
        print_status "info" "npm cache size: $CACHE_SIZE"
    fi
fi

echo ""

# Summary and Next Steps
print_section "Summary & Next Steps"

if command -v pair-cli >/dev/null 2>&1; then
    print_status "ok" "pair-cli is installed and available"
    echo ""
    echo "🎉 Your installation looks good! If you're having issues, try:"
    echo "   1. Check the Installation FAQ: docs/support/installation-faq.md"
    echo "   2. Run: pair-cli --help"
    echo "   3. Run: pair-cli install --list-targets"
else
    echo ""
    echo "❌ pair-cli is not installed or not in PATH."
    echo ""
    echo "📖 Installation options:"
    echo "   1. npm install -g @pair/pair-cli"
    echo "   2. pnpm add -g @pair/pair-cli"
    echo "   3. Download manual install from GitHub releases"
    echo ""
    echo "🔧 If installation fails:"
    echo "   1. Check the Installation FAQ: docs/support/installation-faq.md"
    echo "   2. Fix Node.js version (requires 18+)"
    echo "   3. Fix npm permissions or use pnpm"
fi

echo ""

# Privacy Notice
print_section "Privacy Notice"
echo "ℹ️  This diagnostic script:"
echo "   - Does NOT send any data over the network"
echo "   - Only collects local system information"
echo "   - Safe to share output for troubleshooting"
echo ""
echo "❗ Before sharing this output:"
echo "   - Remove any personal paths with your username"
echo "   - Remove any corporate proxy or network details"
echo "   - Remove any sensitive environment variables"

echo ""
echo "✅ Diagnostic complete!"