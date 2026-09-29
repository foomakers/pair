#!/usr/bin/env bash
# US-489 — `## Cycle Hooks` end to end against the REAL CLI, the REAL cycle scripts and the REAL
# shared executor (`pair-workflow-cycle/scripts/cycle-hooks.mjs`), in a scratch git repository.
#
# Same harness as run-card.sh: only the two EXTERNAL processes are stood in for — the operator's
# `gh` (the card) and the engine (`claude` on PATH: records how it was started, emits a success
# terminal event and publishes NO handoff, a dead dispatch, so the cycle stops `failed-implement`).
# The hooks themselves are real shell commands run in the repo root.
#
# Hermetic: no network, no real engine, no real tracker.

OFFLINE_SAFE=true

source "$(dirname "$0")/../lib/utils.sh"

TEST_NAME="Cycle Hooks (pre/post per stage, pre/post-cycle, on-halt)"
echo "=== Running $TEST_NAME ==="

if [ -z "${REPO_ROOT:-}" ]; then
  REPO_ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
fi
ensure_tmp_dir

WORK="$(setup_workspace "cycle-hooks")"
MAIN="$WORK/main"
STUB="$WORK/bin"
CARDS="$WORK/cards"
ENGINE_LOG="$WORK/engine.log"
mkdir -p "$MAIN" "$STUB" "$CARDS"

# ── the scratch repository ─────────────────────────────────────────────────────────────────
git -C "$MAIN" init -q -b main
git -C "$MAIN" -c user.name=t -c user.email=t@t commit -q --allow-empty -m init
git -C "$MAIN" update-ref refs/remotes/origin/main HEAD

mkdir -p "$MAIN/.claude/skills/pair-workflow-cycle" "$MAIN/.claude/agents" "$MAIN/.pair/adoption/tech"
cp -R "$REPO_ROOT/.claude/skills/pair-workflow-cycle/." "$MAIN/.claude/skills/pair-workflow-cycle/"
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
printf '{"title":"Ready story","body":"**Status**: Refined\\n\\n## Task Breakdown\\n\\n- [ ] **T-1**: build it\\n"}\n' >"$CARDS/12.json"
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
policy() { printf '# Automation\n\n%s\n' "$1" >"$MAIN/.pair/adoption/tech/automation.md"; }
reset_run() { rm -rf "$MAIN/.pair/working/runs" "$MAIN"/*.ran; : >"$ENGINE_LOG"; }
main_real="$(pwd -P)"

# ── 1. AC1/AC4/AC5: a passing pre-implement hook runs in the repo root before the stage; the dead
#    dispatch ends failed-implement, so on-halt (a failure path) and post-cycle run, once each ─────
log_info "Test 1: pre-cycle + pre-implement run, stage dispatched, failed-implement ⇒ on-halt + post-cycle"
policy '## Cycle Hooks

- `pre-cycle`: `echo x >> pre-cycle.ran`
- `pre-implement`: `pwd -P > pre-implement.ran`
- `post-implement`: `echo x >> post-implement.ran`
- `on-halt`: `echo x >> on-halt.ran`
- `post-cycle`: `echo x >> post-cycle.ran`'
reset_run
if run_pair run --card 12 --autonomous; then fail "a dead dispatch reported success"; fi
assert_output_contains "Cycle status: failed-implement" || FAILED=1
grep -q "/pair-workflow-implement-phase" "$ENGINE_LOG" || fail "the implement stage was never dispatched"
[ "$(cat pre-implement.ran 2>/dev/null)" = "$main_real" ] || fail "pre-implement did not run in the repo root"
[ "$(wc -l <pre-cycle.ran 2>/dev/null | tr -d ' ')" = "1" ] || fail "pre-cycle did not run exactly once"
[ ! -f post-implement.ran ] || fail "post-implement ran although the stage's handoff never advanced"
[ "$(wc -l <on-halt.ran 2>/dev/null | tr -d ' ')" = "1" ] || fail "on-halt did not run exactly once on a failed-* stop"
[ "$(wc -l <post-cycle.ran 2>/dev/null | tr -d ' ')" = "1" ] || fail "post-cycle did not run exactly once"

# ── 2. AC1: a failing pre-* HALTs the cycle before the stage dispatches, output verbatim ─────────
log_info "Test 2: failing pre-implement ⇒ failed-hook, output verbatim, zero spawns, on-halt runs"
policy '## Cycle Hooks

- `pre-implement`: `echo build-broke-marker; exit 4`
- `on-halt`: `echo x >> on-halt.ran`'
reset_run
if run_pair run --card 12 --autonomous; then fail "a failing pre-implement hook did not stop the cycle"; fi
assert_output_contains "failed-hook" || FAILED=1
assert_output_contains "build-broke-marker" || FAILED=1
[ "$(spawns)" = "0" ] || fail "the stage was dispatched despite a failing pre-* hook"
[ "$(wc -l <on-halt.ran 2>/dev/null | tr -d ' ')" = "1" ] || fail "on-halt did not run after the hook HALT"

# ── 3. AC6 + edge: no section ⇒ nothing reported; a typo'd key ⇒ one warning, never a HALT ───────
log_info "Test 3a: no ## Cycle Hooks ⇒ behaviour unchanged, no hook line"
policy '## Max Parallelism

3'
reset_run
if run_pair run --card 12 --autonomous; then fail "a dead dispatch reported success"; fi
assert_output_contains "Cycle status: failed-implement" || FAILED=1
if grep -Eqi "## Cycle Hooks|hook key|hook " "$TMP_DIR/last_cmd_output.log"; then fail "output mentions hooks though none are declared"; fi

log_info "Test 3b: typo'd hook key ⇒ unrecognized-key warning, the cycle still runs"
policy '## Cycle Hooks

- `pre-implemnt`: `exit 1`'
reset_run
if run_pair run --card 12 --autonomous; then fail "a dead dispatch reported success"; fi
assert_output_contains "unrecognized hook key" || FAILED=1
assert_output_contains "Cycle status: failed-implement" || FAILED=1

if [ "$FAILED" -ne 0 ]; then
  echo "=== $TEST_NAME FAILED ==="
  exit 1
fi
echo "=== $TEST_NAME Passed ==="
