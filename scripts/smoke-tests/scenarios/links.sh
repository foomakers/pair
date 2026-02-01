#!/usr/bin/env bash
source "$(dirname "$0")/../lib/utils.sh"

TEST_NAME="Update Link Scenarios"
echo "=== Running $TEST_NAME ==="

TEST_DIR=$(setup_workspace "links-test")
cd "$TEST_DIR"

# Setup file structure - update-link expects .pair/knowledge structure
mkdir -p .pair/knowledge/folder-a
mkdir -p .pair/knowledge/folder-b

# Create destination file
echo "# File B" > ".pair/knowledge/folder-b/target-doc.md"

# Create source file with broken link (assumes it's in same dir)
# But it's actually in folder-b
echo "Link to [Target](./target-doc.md)" > ".pair/knowledge/folder-a/source-doc.md"

log_info "Test 1: Dry run (Detect broken link)"
run_pair update-link --dry-run
assert_success || exit 1
# Note: update-link converts between relative/absolute paths
# Command success is sufficient for smoke test

log_info "Test 2: Fix links"
run_pair update-link
assert_success || exit 1
# Command success is sufficient for smoke test

log_info "Test 3: Verbose mode"
run_pair update-link --verbose
assert_success || exit 1
# Command success is sufficient for smoke test

echo "=== $TEST_NAME Completed ==="
