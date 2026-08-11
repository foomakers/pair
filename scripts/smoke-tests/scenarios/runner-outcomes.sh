#!/usr/bin/env bash
# OFFLINE_SAFE=true
#
# Smoke runner vocabulary + CI list integrity — story #400.
#
# The runner used to know two answers about a listed scenario: it passed, or it
# FAILED. `scenarios/coverage-gate.sh` was committed mode 644, so every run said
# `Permission denied` -> FAIL — a message indistinguishable from a real assertion
# failure, on a suite no pipeline executed. It sat dead for weeks.
#
# What is asserted here:
#   1. the runner's classification is a THREE-state answer before a scenario is
#      ever executed — RUNNABLE / MISSING / NOT_EXECUTABLE — so "cannot run" can
#      never again be reported as "ran and failed";
#   2. the NOT_EXECUTABLE report names the file AND its mode (that is the whole
#      difference between an actionable line and a `Permission denied`);
#   3. the runner is CHECK-ONLY (ADL 2026-07-31): it never chmods a scenario;
#   4. `CI_TESTS` means what it says — every scenario in `scenarios/` is either in
#      the CI list or in `CI_EXCLUDED` *with a reason*, and every listed name is a
#      file that exists. AC7 as an executable invariant instead of a prose note:
#      a scenario added tomorrow cannot silently be absent from CI.
#
# Per the gate-tooling ADL (2026-07-13) this shell surface is verified with a smoke
# test, not a vitest unit test. The COMMITTED mode of every scenario is a separate,
# unit-tested guard (packages/dev-tools/src/quality-gates/smoke-scenario-modes.ts):
# the filesystem states below are runtime states, the git index is the commit.
source "$(dirname "$0")/../lib/utils.sh"
ensure_tmp_dir

TEST_NAME="Smoke Runner Outcomes + CI List Integrity"
echo "=== Running $TEST_NAME ==="

REPO_ROOT="${REPO_ROOT:-$(cd "$(dirname "$0")/../../.." && pwd)}"
SMOKE_DIR="$REPO_ROOT/scripts/smoke-tests"
RUNNER="$SMOKE_DIR/run-all.sh"
SCENARIOS_DIR="$SMOKE_DIR/scenarios"

FAILED=0
check() { # check <description> <expected> <actual>
  if [ "$2" = "$3" ]; then log_succ "$1 => $3"; else log_fail "$1: expected '$2' got '$3'"; FAILED=1; fi
}

assert_file "$RUNNER" || exit 1

# --- Fixtures: the three states, as real files in the temp dir ---
FIX="$TMP_DIR/runner-outcomes"
rm -rf "$FIX"
mkdir -p "$FIX"
printf '#!/usr/bin/env bash\nexit 0\n' >"$FIX/runnable.sh"
chmod 755 "$FIX/runnable.sh"
printf '#!/usr/bin/env bash\nexit 0\n' >"$FIX/unexecutable.sh"
chmod 644 "$FIX/unexecutable.sh"

# --- 1. Three distinct states, decided BEFORE execution ---
check "an executable scenario is RUNNABLE"      RUNNABLE       "$(scenario_state "$FIX/runnable.sh")"
check "a listed file that does not exist is MISSING" MISSING   "$(scenario_state "$FIX/nope.sh")"
check "an existing 644 scenario is NOT_EXECUTABLE" NOT_EXECUTABLE "$(scenario_state "$FIX/unexecutable.sh")"

# The distinction is the point: collapsing these is what hid coverage-gate.sh.
if [ "$(scenario_state "$FIX/unexecutable.sh")" = "$(scenario_state "$FIX/nope.sh")" ]; then
  log_fail "NOT_EXECUTABLE and MISSING collapse to the same state"; FAILED=1
else
  log_succ "NOT_EXECUTABLE is distinct from MISSING"
fi

# --- 2. The report names the mode (portable: BSD stat vs GNU stat) ---
check "file_mode reports the octal mode of a 644 file" 644 "$(file_mode "$FIX/unexecutable.sh")"
check "file_mode reports 755 for the executable one"   755 "$(file_mode "$FIX/runnable.sh")"
check "file_mode on a missing file is empty, never a stat error" "" "$(file_mode "$FIX/nope.sh" 2>/dev/null)"

# --- 3. The runner reports all three outcomes, and NEVER repairs a mode ---
for token in 'NOT EXECUTABLE' 'MISSING' 'FAIL'; do
  if grep -q "$token" "$RUNNER"; then
    log_succ "runner reports the '$token' outcome"
  else
    log_fail "runner has no '$token' outcome"; FAILED=1
  fi
done
if grep -q 'scenario_state' "$RUNNER"; then
  log_succ "runner classifies through scenario_state (one decision, one place)"
else
  log_fail "runner no longer uses scenario_state — the outcomes can drift apart"; FAILED=1
fi
# Check-only, like the pre-push gate: a runner that chmods the tree it is judging
# turns a red commit into a green run on one machine only.
if grep -Eq '^[[:space:]]*chmod\b' "$RUNNER" "$SMOKE_DIR/lib/ci-tests.sh" "$SMOKE_DIR/lib/utils.sh"; then
  log_fail "the runner chmods a file — it must report the mode, never fix it"; FAILED=1
else
  log_succ "runner never chmods (check-only)"
fi
# The remedy must be actionable AND commit-level: `chmod +x` alone leaves the
# committed mode 644, which is exactly the bug that survived for weeks.
if grep -q 'update-index --chmod=+x' "$RUNNER"; then
  log_succ "the NOT EXECUTABLE message points at the COMMITTED mode fix"
else
  log_fail "the NOT EXECUTABLE message does not name the commit-level remedy"; FAILED=1
fi

# --- 4. CI list integrity (AC7) ---
# shellcheck source=/dev/null
source "$SMOKE_DIR/lib/ci-tests.sh"

check "the CI list is not empty" "yes" "$([ "${#CI_TESTS[@]}" -gt 0 ] && echo yes || echo no)"

for t in "${CI_TESTS[@]}"; do
  if [ ! -f "$SCENARIOS_DIR/$t" ]; then
    log_fail "CI_TESTS lists '$t', which does not exist in scenarios/"; FAILED=1
  fi
done

# Every excluded entry carries a reason (`<file>: <why>`), and names a real file.
# The reason cannot be an opinion: an excluded scenario must either DECLARE
# `OFFLINE_SAFE=false` (the rule — CI runs every offline-safe scenario) or name a
# tracking issue, which is the flakiness escape hatch the story allows in both
# directions. Without this, "excluded" degrades back into "nobody got round to it".
for e in "${CI_EXCLUDED[@]}"; do
  name="${e%%:*}"
  reason="${e#*: }"
  if [ ! -f "$SCENARIOS_DIR/$name" ]; then
    log_fail "CI_EXCLUDED names '$name', which does not exist in scenarios/"; FAILED=1
    continue
  fi
  if [ -z "$reason" ] || [ "$reason" = "$e" ] || [ "${#reason}" -lt 20 ]; then
    log_fail "CI_EXCLUDED entry '$name' has no usable reason"; FAILED=1
  fi
  if grep -q '^OFFLINE_SAFE=false' "$SCENARIOS_DIR/$name" || echo "$reason" | grep -q '#[0-9]\+'; then
    log_succ "exclusion of $name is justified (offline-unsafe or tracked)"
  else
    log_fail "$name is offline-safe and excluded without a tracking issue"; FAILED=1
  fi
done

# The mirror of that rule: an offline-safe scenario belongs in CI.
for t in "${CI_TESTS[@]}"; do
  if [ -f "$SCENARIOS_DIR/$t" ] && grep -q '^OFFLINE_SAFE=false' "$SCENARIOS_DIR/$t"; then
    log_fail "CI_TESTS lists '$t', which declares OFFLINE_SAFE=false"; FAILED=1
  fi
done

# The invariant that keeps the list honest in BOTH directions: no scenario is
# absent from CI by accident, and none is excluded without a recorded reason.
UNCOVERED=""
for f in "$SCENARIOS_DIR"/*.sh; do
  name="$(basename "$f")"
  covered=0
  for t in "${CI_TESTS[@]}"; do [ "$t" = "$name" ] && covered=1; done
  for e in "${CI_EXCLUDED[@]}"; do [ "${e%%:*}" = "$name" ] && covered=1; done
  [ "$covered" -eq 1 ] || UNCOVERED="$UNCOVERED $name"
done
if [ -n "$UNCOVERED" ]; then
  log_fail "scenario(s) neither in CI_TESTS nor documented in CI_EXCLUDED:$UNCOVERED"; FAILED=1
else
  log_succ "every scenario is either run in CI or excluded with a reason"
fi

# The runner must READ that list rather than keep a second copy of it.
if grep -q 'lib/ci-tests.sh' "$RUNNER"; then
  log_succ "runner sources the single CI list (no second copy to drift)"
else
  log_fail "runner does not source lib/ci-tests.sh — the list exists twice"; FAILED=1
fi

# --- 5. The suite actually RUNS in CI, with its cost declared (AC1, AC6, AC8) ---
# This is the story's whole point: an assertion nobody executes is not an assertion.
CI_WORKFLOW="$REPO_ROOT/.github/workflows/ci.yml"
if grep -q 'run-all.sh --ci' "$CI_WORKFLOW"; then
  log_succ "CI runs the smoke suite"
else
  log_fail "no CI job runs run-all.sh --ci — the CI_TESTS list is a claim again"; FAILED=1
fi
if grep -qi 'MEASURED COST' "$CI_WORKFLOW" && grep -qi 'REVISIT THRESHOLD' "$CI_WORKFLOW"; then
  log_succ "the job records its measured cost and the revisit threshold"
else
  log_fail "the smoke job has no measured cost / revisit threshold recorded"; FAILED=1
fi
# Nothing is auto-corrected in CI: the guard reports, it never fixes a mode.
# Comment lines are exempt (the job DOCUMENTS that it never chmods); an executed
# `chmod` is not. release.yml does chmod its release scripts before running them —
# which is exactly the habit that lets a 644 commit go unnoticed.
if grep -Eq '^[[:space:]]*[^#[:space:]].*\bchmod\b' "$CI_WORKFLOW"; then
  log_fail "ci.yml runs chmod — CI must never repair a mode (check-only)"; FAILED=1
else
  log_succ "CI never chmods a scenario (check-only)"
fi

rm -rf "$FIX"

if [ "$FAILED" -ne 0 ]; then
  log_fail "$TEST_NAME had failures"; exit 1
fi
log_succ "$TEST_NAME passed"
