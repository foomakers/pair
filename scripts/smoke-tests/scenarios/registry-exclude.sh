#!/usr/bin/env bash
source "$(dirname "$0")/../lib/utils.sh"

OFFLINE_SAFE=true

TEST_NAME="Registry Exclude Scenarios"
echo "=== Running $TEST_NAME ==="

# `exclude` ships as an enabler for #392 and has no skill consumer yet, so the only
# way to show it does what the docs say is to drive the real CLI over a real source
# tree. Both copy paths are covered here, because they are two different walks:
#   - with flatten+prefix, the pipeline collects a file list and filters it;
#   - without them, it walks the directory itself and skips entries in place.
# A regression in either one is invisible to the other's assertions.

# setup_workspace resolves against TMP_DIR, which run_pair sets lazily — this scenario
# builds its source tree BEFORE the first run_pair, so claim TMP_DIR up front.
ensure_tmp_dir

MOCK_SOURCE=$(setup_workspace "exclude-kb-source")
mkdir -p "$MOCK_SOURCE/.pair"
printf -- '# Mock KB\n' > "$MOCK_SOURCE/.pair/README.md" # validateKBStructure wants .pair or AGENTS.md
mkdir -p "$MOCK_SOURCE/.skills/process/review"
mkdir -p "$MOCK_SOURCE/.skills/process/setup/references"
mkdir -p "$MOCK_SOURCE/.skills/process/setup-helper"
printf -- '---\nname: review\n---\n# review\n' > "$MOCK_SOURCE/.skills/process/review/SKILL.md"
printf -- '---\nname: setup\n---\n# setup\n' > "$MOCK_SOURCE/.skills/process/setup/SKILL.md"
printf -- '# deep\n' > "$MOCK_SOURCE/.skills/process/setup/references/deep.md"
printf -- '---\nname: helper\n---\n# helper\n' > "$MOCK_SOURCE/.skills/process/setup-helper/SKILL.md"
log_info "Mock KB source with process/{review,setup,setup-helper} at $MOCK_SOURCE"

# --- Test 1: transform path (flatten + prefix), the shape pair itself installs ---
TEST_DIR=$(setup_workspace "registry-exclude-transform")
cd "$TEST_DIR"

cat > config.json <<EOF
{
  "asset_registries": {
    "skills": {
      "source": ".skills",
      "target_path": ".claude/skills",
      "behavior": "overwrite",
      "description": "Agent skills, flattened and prefixed",
      "flatten": true,
      "prefix": "pair",
      "exclude": ["process/setup"]
    }
  }
}
EOF

log_info "Test 1: flatten+prefix path honors exclude"
run_pair install --source "$MOCK_SOURCE" --offline --config config.json
assert_success || exit 1
assert_file ".claude/skills/pair-process-review/SKILL.md" || exit 1
assert_file ".claude/skills/pair-process-setup-helper/SKILL.md" || exit 1
assert_no_file ".claude/skills/pair-process-setup/SKILL.md" || exit 1
assert_no_file ".claude/skills/pair-process-setup-references/deep.md" || exit 1
log_succ "excluded entry absent, sibling and non-excluded entry installed"

# --- Test 2: plain path (no flatten, no prefix) ---
# `exclude` is a registry-level option, so a registry that declares it WITHOUT
# flatten/prefix must honor it too. It used to be read only by the transform path,
# which made the option a silent no-op here.
#
# The registry is deliberately NOT named `skills`: --config MERGES over the built-in
# config, so a `skills` entry would inherit the default's flatten+prefix and quietly
# run the transform path again — the assertions would pass while testing nothing.
TEST_DIR2=$(setup_workspace "registry-exclude-plain")
cd "$TEST_DIR2"

cat > config.json <<EOF
{
  "asset_registries": {
    "verbatim": {
      "source": ".skills",
      "target_path": ".verbatim/skills",
      "behavior": "overwrite",
      "description": "Agent skills, copied verbatim",
      "exclude": ["process/setup"]
    }
  }
}
EOF

log_info "Test 2: plain copy path honors exclude"
run_pair install --source "$MOCK_SOURCE" --offline --config config.json
assert_success || exit 1
# Guard against the trap above: the plain path must NOT have flattened+prefixed.
assert_no_file ".verbatim/skills/pair-process-review/SKILL.md" || exit 1
assert_file ".verbatim/skills/process/review/SKILL.md" || exit 1
assert_file ".verbatim/skills/process/setup-helper/SKILL.md" || exit 1
assert_no_file ".verbatim/skills/process/setup/SKILL.md" || exit 1
assert_no_file ".verbatim/skills/process/setup/references/deep.md" || exit 1
log_succ "plain path skips the excluded subtree, keeps the segment-wise sibling"

# --- Test 3: a malformed exclude is a config error, not a silent no-op ---
TEST_DIR3=$(setup_workspace "registry-exclude-invalid")
cd "$TEST_DIR3"

cat > bad-config.json <<EOF
{
  "asset_registries": {
    "skills": {
      "source": ".skills",
      "target_path": ".claude/skills",
      "behavior": "overwrite",
      "description": "Agent skills",
      "exclude": "process/setup"
    }
  }
}
EOF

log_info "Test 3: non-array exclude fails validation"
run_pair validate-config --config bad-config.json
assert_failure || exit 1
log_succ "malformed exclude rejected at config validation"

log_succ "$TEST_NAME passed"
