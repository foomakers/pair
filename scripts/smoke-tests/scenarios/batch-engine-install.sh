#!/usr/bin/env bash
# US-219 T10 / AC2 + AC3 — the batch engine and its agents actually land on disk.
#
# Every other check on this story reads config.json or the dataset. This one runs the real
# CLI into a scratch project and looks at what appeared, because a registry can be declared
# correctly and still install nothing: a wrong `source`, a target the resolver rejects, or a
# file the packager never bundled all produce a green config and an empty directory.
#
# The engine and the agent definitions are asserted TOGETHER on purpose. A workflow installed
# without the agent types it dispatches to is the half-installed state that fails at an
# adopter's first batch, long after install reported success.
source "$(dirname "$0")/../lib/utils.sh"

OFFLINE_SAFE=true

TEST_NAME="Batch Engine Install"
echo "=== Running $TEST_NAME ==="

SOURCE_PATH="$KB_SOURCE_PATH"
if [ -z "$SOURCE_PATH" ]; then
  log_warn "KB_SOURCE_PATH unset — cannot verify what a real install writes; skipping"
  echo "=== $TEST_NAME Skipped ==="
  exit 0
fi

PROJECT=$(setup_workspace "batch-engine-install")
cd "$PROJECT" || exit 1

log_info "Test 1: install writes the workflow engine and its agent layer"
run_pair install --source "$SOURCE_PATH" --offline .

assert_dir ".claude/workflows"
assert_dir ".claude/agents"

# The engine itself, plus the helper the agents invoke. `contracts/ensure-contract.mjs` is a
# real dependency: shipping the workflow without it produces a batch that dies in phase 0.
assert_file ".claude/workflows/pair-implement-batch.js"
assert_file ".claude/workflows/pair-contracts/ensure-contract.mjs"

# Every agent type the workflow spawns must have arrived with it.
for agent in pair-implementer pair-reviewer pair-contract-generator; do
  assert_file ".claude/agents/${agent}.md"
done

log_info "Test 2: the installed engine is the one that ships, not a stale copy"
# Byte-equality against the dataset is guarded in the unit suite; here the cheaper claim is
# that the installed file is the current contract — it names `cards`, the key #250 codes
# against. An older engine on disk would still pass the existence checks above.
assert_contains ".claude/workflows/pair-implement-batch.js" "cards"

log_info "Test 3: update keeps them (an overwrite registry must not drop the pair)"
run_pair update .
assert_file ".claude/workflows/pair-implement-batch.js"
assert_file ".claude/agents/pair-reviewer.md"

echo "=== $TEST_NAME Completed ==="
