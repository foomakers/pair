#!/usr/bin/env bash
source "$(dirname "$0")/../lib/utils.sh"

TEST_NAME="KB Lifecycle (Install -> Package -> Update)"
echo "=== Running $TEST_NAME ==="

# Ensure the packaged CLI is available (runs preliminary packaging if needed)
ensure_packaged_cli || log_warn "Proceeding without packaged CLI; tests may use local built CLI or fail"

# --- Setup Workspace First ---
WORKSPACE_ROOT=$(setup_workspace "lifecycle")

# --- Setup Source of Truth ---
# The user might be offline. We need a "Remote" implementation that we can install FROM.
# This simulates the "Origin" knowledge base.
REMOTE_KB_DIR="$WORKSPACE_ROOT/remote-kb-origin"
mkdir -p "$REMOTE_KB_DIR"

if [ -n "$KB_SOURCE_PATH" ] && [ -d "$KB_SOURCE_PATH" ]; then
  log_info "Creating local 'remote' KB clone from $KB_SOURCE_PATH"
  # Copy content to our temp remote. 
  # Note: KB_SOURCE_PATH is usually .../dataset which contains .pair or just content?
  # The pair standard expects a folder that HAS .pair inside or IS the content?
  # Usually `dataset` HAS content. `pair install` takes content and puts it in target.
  # Let's simple copy content.
  cp -r "$KB_SOURCE_PATH/." "$REMOTE_KB_DIR/"
else
  log_warn "KB_SOURCE_PATH not available. Generating minimal mock KB."
  mkdir -p "$REMOTE_KB_DIR/.pair"
  echo "# Mock KB" > "$REMOTE_KB_DIR/.pair/README.md"
  # Need a config if we rely on it? install command usually copies assets.
  # If we install FROM this folder, we expect standard structure or just files.
  # Let's assume standard structure:
  # The source MUST have .pair/knowledge etc if it's a full KB.
fi
# Ensure we have a valid source path to use
SOURCE_FOR_DEV="$REMOTE_KB_DIR"

# --- Step 1: Create a "Dev" environment and simulate v1 ---
DEV_DIR="$WORKSPACE_ROOT/dev-env"
mkdir -p "$DEV_DIR"
cd "$DEV_DIR"

# Create a minimal valid config for packaging
# that only includes the knowledge registry
# Note: The config.json must be in the project root for the package command to find it
cat > "$DEV_DIR/config.json" << 'EOF'
{
  "asset_registries": {
    "knowledge": {
      "source": ".pair/knowledge",
      "target_path": ".pair/knowledge",
      "behavior": "mirror",
      "description": "Knowledge base and documentation"
    }
  }
}
EOF

log_info "Step 1: Install base KB content to Dev environment"
run_pair install --no-kb --offline --source "$SOURCE_FOR_DEV"
assert_success || exit 1

# Simulate v1 state -> Edit a known file
# Create marker file in the knowledge directory
mkdir -p .pair/knowledge
echo "Version 1 Content" > .pair/knowledge/version-marker.md

# --- Step 2: Package v1 ---
# Use --source-dir to specify the dev directory as the source for packaging
log_info "Step 2: Package v1"
run_pair package --source-dir "$DEV_DIR" --output "$WORKSPACE_ROOT/kb-v1.zip"
assert_success || exit 1

# --- Step 3: Setup Client Target with v1 ---
CLIENT_DIR="$WORKSPACE_ROOT/client-app"
mkdir -p "$CLIENT_DIR"
cd "$CLIENT_DIR"

log_info "Step 3: Client installs v1 from package"
# Testing installing from ZIP source (Offline)
# Note: The install command expects the ZIP to contain .pair or AGENTS.md at root
# The package command creates a structure with .zip-temp containing the files
# We need to check the actual structure
unzip -l "$WORKSPACE_ROOT/kb-v1.zip" | head -20
run_pair install --no-kb --offline --source "$WORKSPACE_ROOT/kb-v1.zip"
assert_success || exit 1
assert_contains ".pair/knowledge/version-marker.md" "Version 1 Content"

# --- Step 4: Upgrade Dev environment to v2 ---
cd "$DEV_DIR"
log_info "Step 4: Upgrade Dev environment content (v2)"
echo "Version 2 Content - UPDATED" > .pair/knowledge/version-marker.md
# Add a new file
echo "New Feature" > .pair/knowledge/new-feature.md

# --- Step 5: Package v2 ---
log_info "Step 5: Package v2"
run_pair package --source-dir "$DEV_DIR" --output "$WORKSPACE_ROOT/kb-v2.zip" --pkg-version 2.0.0
assert_success || exit 1

# --- Step 6: Client updates to v2 ---
cd "$CLIENT_DIR"
log_info "Step 6: Client updates from v2 package"
run_pair update --no-kb --offline --source "$WORKSPACE_ROOT/kb-v2.zip"
assert_success || exit 1

# --- Step 7: Verify Client State ---
log_info "Step 7: Verifying updates"

# Check modified file
assert_contains ".pair/knowledge/version-marker.md" "Version 2 Content - UPDATED" || exit 1

# Check new file
assert_file ".pair/knowledge/new-feature.md" || exit 1

log_succ "Lifecycle (Install v1 -> Package -> Install Client -> Update v2 -> Verify) passed!"

echo "=== $TEST_NAME Completed ==="
