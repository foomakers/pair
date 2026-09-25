#!/usr/bin/env bash
# US-487 T-5 — `pair-cli run --card` end to end against the REAL CLI and the REAL cycle scripts.
#
# Every unit suite injects a fake bridge or a fake driver, which is how the story's canary found
# seven driver defects no unit test could see. This scenario runs the built/packaged CLI in a
# scratch git repository carrying byte copies of `pair-workflow-cycle`'s scripts and the agent
# definitions, with this repository's own board mapping. Only the two EXTERNAL processes are
# stood in for: the operator's `gh` (the card) and the engine (`claude` on PATH: it records how it
# was started, emits a success terminal event and publishes NO handoff — a dead dispatch).
#
# Hermetic: no network, no real engine, no real tracker.

OFFLINE_SAFE=true

source "$(dirname "$0")/../lib/utils.sh"

TEST_NAME="run --card (delivery-cycle coordinator entry)"
echo "=== Running $TEST_NAME ==="

if [ -z "${REPO_ROOT:-}" ]; then
  REPO_ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
fi
ensure_tmp_dir

WORK="$(setup_workspace "run-card")"
MAIN="$WORK/main"
STUB="$WORK/bin"
CARDS="$WORK/cards"
ENGINE_LOG="$WORK/engine.log"
mkdir -p "$MAIN" "$STUB" "$CARDS"

# ── the scratch repository ─────────────────────────────────────────────────────────────────
git -C "$MAIN" init -q -b main
git -C "$MAIN" -c user.name=t -c user.email=t@t commit -q --allow-empty -m init
git -C "$MAIN" update-ref refs/remotes/origin/main HEAD

install_cycle_skill() {
  mkdir -p "$MAIN/.claude/skills/pair-workflow-cycle"
  cp -R "$REPO_ROOT/.claude/skills/pair-workflow-cycle/." "$MAIN/.claude/skills/pair-workflow-cycle/"
}
install_cycle_skill
mkdir -p "$MAIN/.claude/agents" "$MAIN/.pair/adoption/tech"
cp "$REPO_ROOT"/.claude/agents/*.md "$MAIN/.claude/agents/"
for skill in pair-process-refine-story pair-process-plan-tasks; do
  mkdir -p "$MAIN/.claude/skills/$skill" && : >"$MAIN/.claude/skills/$skill/SKILL.md"
done
cat >"$MAIN/.pair/adoption/tech/way-of-working.md" <<'EOF'
# Way of Working

## State Mapping

| Board State | Macrostate  |
| ----------- | ----------- |
| Todo        | Draft       |
| Refined     | Ready       |
| In Progress | In Progress |
| Done        | Done        |
EOF

# ── the two external processes ─────────────────────────────────────────────────────────────
# Cards: #11 Todo (Draft on this board), #12 Refined + task breakdown (Ready).
card() { printf '{"title":%s,"body":%s}\n' "\"$2\"" "\"**Status**: $3\\n\\n$4\"" >"$CARDS/$1.json"; }
card 11 "Draft story" "Todo" ""
card 12 "Ready story" "Refined" "## Task Breakdown\\n\\n- [ ] **T-1**: build it\\n"

cat >"$STUB/gh" <<EOF
#!/usr/bin/env node
const a = process.argv.slice(2)
if (a[0] !== 'issue' || a[1] !== 'view') process.exit(1)
const card = JSON.parse(require('fs').readFileSync('$CARDS/' + a[2] + '.json', 'utf8'))
process.stdout.write(a.includes('-q') ? card.body : JSON.stringify(card))
EOF
cat >"$STUB/claude" <<EOF
#!/usr/bin/env node
require('fs').appendFileSync('$ENGINE_LOG', JSON.stringify(process.argv.slice(2)) + '\n')
process.stdout.write(JSON.stringify({ type: 'result', subtype: 'success' }) + '\n')
EOF
chmod +x "$STUB/gh" "$STUB/claude"
export PATH="$STUB:$PATH"
export PAIR_GH_BIN="$STUB/gh"

cd "$MAIN" || exit 1
spawns() { [ -f "$ENGINE_LOG" ] && wc -l <"$ENGINE_LOG" | tr -d ' ' || echo 0; }
FAILED=0
fail() { log_fail "$1"; FAILED=1; }

# ── 1. AC14 via the adopted State Mapping: a Todo card routes to refinement (supervised) ───────
log_info "Test 1: Todo card (Draft via State Mapping), supervised ⇒ pair-process-refine-story"
run_pair run --card 11 --max-iterations 1 || fail "supervised Todo card exited non-zero"
assert_output_contains "board state \`Todo\` ⇒ Draft" || FAILED=1
grep -q "pair-process-refine-story" "$ENGINE_LOG" 2>/dev/null || fail "no refine-story dispatch recorded"

# ── 2. AC14 amended: unattended runs never start a preparation skill ───────────────────────────
log_info "Test 2: Todo card, --autonomous ⇒ clean skip, 'needs a human', nothing spawned"
before="$(spawns)"
run_pair run --card 11 --autonomous || fail "autonomous Todo card exited non-zero"
assert_output_contains "needs a human" || FAILED=1
[ "$(spawns)" = "$before" ] || fail "an unattended preparation skill was spawned"

# ── 3. AC11: reserved flags carry the #488 pointer ─────────────────────────────────────────────
log_info "Test 3: --profile is refused with a pointer to #488"
if run_pair run --card 12 --profile x; then fail "--profile was accepted"; fi
assert_output_contains "#488" || FAILED=1

# ── 4. AC1/AC10: a Ready card enters the real cycle at implement (US-506: no up-front contract);
#    a dead dispatch ends failed-implement ─────────────────────────────────────────────────────
log_info "Test 4: Ready card, --autonomous ⇒ transparency block, real scripts, failed-implement"
: >"$ENGINE_LOG"
if run_pair run --card 12 --autonomous; then fail "a dead dispatch reported success"; fi
assert_output_contains "Worktree root: ../pair-worktrees" || FAILED=1
assert_output_contains "Dispatch ceiling: none" || FAILED=1
assert_output_contains "Cycle status: failed-implement" || FAILED=1
grep -q "/pair-workflow-implement-phase" "$ENGINE_LOG" || fail "the implement stage was never dispatched"
if grep -q "/pair-workflow-red-spec" "$ENGINE_LOG"; then fail "a fresh card dispatched a preparation before any code"; fi
[ -d "$WORK/pair-worktrees/12" ] || fail "the story worktree was not created under the script's root"

# ── 5. AC11: the FIRST stage's missing agent definition HALTs agent-definition-missing before any
#    spawn (the role is checked per packet: a later stage's role is checked when that stage is due) ─
log_info "Test 5: a missing first-stage agent definition HALTs agent-definition-missing"
mv "$MAIN/.claude/agents/pair-implementer.md" "$WORK/role.md"
rm -rf "$MAIN/.pair/working/runs"
: >"$ENGINE_LOG"
if run_pair run --card 12 --autonomous; then fail "missing role was accepted"; fi
assert_output_contains "agent-definition-missing" || FAILED=1
[ "$(spawns)" = "0" ] || fail "a stage was spawned without its role"
mv "$WORK/role.md" "$MAIN/.claude/agents/pair-implementer.md"

# ── 6. Edge case: the story worktree exists on another branch ⇒ worktree-conflict ──────────────
log_info "Test 6: story worktree on another branch HALTs worktree-conflict before any spawn"
git -C "$MAIN" worktree remove --force "$WORK/pair-worktrees/12"
git -C "$MAIN" worktree add -q -b other "$WORK/pair-worktrees/12" origin/main
: >"$ENGINE_LOG"
if run_pair run --card 12 --autonomous; then fail "worktree conflict was accepted"; fi
assert_output_contains "worktree-conflict" || FAILED=1
[ "$(spawns)" = "0" ] || fail "a stage was spawned over a conflicting worktree"

# ── 7. AC11: skill-missing HALTs naming pair-workflow-cycle ────────────────────────────────────
log_info "Test 7: pair-workflow-cycle not installed ⇒ skill-missing"
rm -rf "$MAIN/.claude/skills/pair-workflow-cycle"
if run_pair run --card 12 --autonomous; then fail "missing skill was accepted"; fi
assert_output_contains "skill-missing: pair-workflow-cycle" || FAILED=1

if [ "$FAILED" -ne 0 ]; then
  echo "=== $TEST_NAME FAILED ==="
  exit 1
fi
echo "=== $TEST_NAME Passed ==="
