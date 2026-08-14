#!/usr/bin/env bash
OFFLINE_SAFE=true
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
#   2. the four REPORT ROWS and the exit code, by running run-all.sh for real
#      against a fixture scenarios/ dir and a fixture CI list (a pass, a fail, a
#      644, a listed-absent) and reading the report it wrote. Grepping the
#      runner's source for the words would pass on a token in a comment;
#   3. the runner is CHECK-ONLY (ADL 2026-07-31): it never chmods a scenario —
#      observed on the 644 fixture, which is still 644 after the run;
#   4. `CI_TESTS` means what it says — every scenario in `scenarios/` is either in
#      the CI list or in `CI_EXCLUDED` *with a reason*, and every listed name is a
#      file that exists. AC7 as an executable invariant instead of a prose note:
#      a scenario added tomorrow cannot silently be absent from CI.
#
# Per the gate-tooling ADL (2026-07-13) this shell surface is verified with a smoke
# test, not a vitest unit test. The TRACKED (staged) mode of every scenario is a
# separate, unit-tested guard (packages/dev-tools/src/quality-gates/smoke-scenario-modes.ts):
# the states below are runtime states of the filesystem, that one reads the git index.
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

# --- 3. The runner REALLY renders the four outcomes, and NEVER repairs a mode ---
#
# This section EXECUTES run-all.sh against a fixture scenarios/ directory and a
# fixture CI list, then reads the report it wrote. Grepping the runner's source
# for the word `NOT EXECUTABLE` would pass on a token that appears only in a
# comment — and it does appear in several — while a refactor that echoed
# `[NOT EXECUTABLE]` to stdout but wrote `❌ FAIL` into the report row would go
# unnoticed. The report rows and the exit code are the observable contract.
RUN_ROOT="$FIX/run"
FIXTURE_SCENARIOS="$RUN_ROOT/scenarios"
mkdir -p "$FIXTURE_SCENARIOS" "$RUN_ROOT/tmp"

printf '#!/usr/bin/env bash\nexit 0\n' >"$FIXTURE_SCENARIOS/fx-pass.sh"
chmod 755 "$FIXTURE_SCENARIOS/fx-pass.sh"
printf '#!/usr/bin/env bash\necho "boom"\nexit 1\n' >"$FIXTURE_SCENARIOS/fx-fail.sh"
chmod 755 "$FIXTURE_SCENARIOS/fx-fail.sh"
printf '#!/usr/bin/env bash\nexit 0\n' >"$FIXTURE_SCENARIOS/fx-unexecutable.sh"
chmod 644 "$FIXTURE_SCENARIOS/fx-unexecutable.sh"
# fx-absent.sh is deliberately NOT created: listed for the run, gone from disk.

cat >"$RUN_ROOT/ci-tests.sh" <<'FIXTURE_LIST'
CI_TESTS=(
  "fx-pass.sh"
  "fx-fail.sh"
  "fx-unexecutable.sh"
  "fx-absent.sh"
)
CI_EXCLUDED=()
FIXTURE_LIST

# A stand-in binary: the fixture scenarios never call it, but the runner's final
# guard requires TEST_BINARY, and passing --binary skips the packaging preflight.
printf '#!/usr/bin/env bash\nexit 0\n' >"$RUN_ROOT/fake-pair"
chmod 755 "$RUN_ROOT/fake-pair"

RUN_LOG="$RUN_ROOT/run.log"
set +e
# GITHUB_STEP_SUMMARY is blanked so this nested run never appends a fixture report
# to the real job summary. RUNNER_TEMP pins the nested TMP_DIR under the fixture,
# which is how the report is found afterwards.
env -u PAIR_DIAG \
  SCENARIOS_DIR="$FIXTURE_SCENARIOS" \
  CI_TESTS_FILE="$RUN_ROOT/ci-tests.sh" \
  RUNNER_TEMP="$RUN_ROOT/tmp" \
  GITHUB_STEP_SUMMARY="" \
  "$RUNNER" --ci --binary "$RUN_ROOT/fake-pair" >"$RUN_LOG" 2>&1
RUN_RC=$?
set -e

check "a run containing a failure exits 1" 1 "$RUN_RC"

RUN_REPORT="$(find "$RUN_ROOT/tmp" -name 'smoke-report.md' -maxdepth 2 2>/dev/null | head -1)"
if [ -z "$RUN_REPORT" ] || [ ! -f "$RUN_REPORT" ]; then
  log_fail "the fixture run produced no report (see $RUN_LOG)"; FAILED=1
else
  # One row per outcome, verbatim: four distinct vocabularies, not two.
  assert_row() { # assert_row <description> <expected row substring>
    if grep -qF "$2" "$RUN_REPORT"; then
      log_succ "$1"
    else
      log_fail "$1 — no '$2' row in $RUN_REPORT"; FAILED=1
    fi
  }
  assert_row "a passing scenario is reported PASS"             "| fx-pass.sh | ✅ PASS |"
  assert_row "a failing scenario is reported FAIL"             "| fx-fail.sh | ❌ FAIL |"
  assert_row "a 644 scenario is NOT EXECUTABLE, with its mode" "| fx-unexecutable.sh | 🚫 NOT EXECUTABLE (mode 644) |"
  assert_row "a listed-but-absent scenario is MISSING"         "| fx-absent.sh | ⚠️ MISSING |"

  # NOT EXECUTABLE must not degrade into FAIL (the collapse that hid coverage-gate.sh).
  if grep -qF "| fx-unexecutable.sh | ❌ FAIL |" "$RUN_REPORT"; then
    log_fail "an unexecutable scenario was reported as a plain FAIL"; FAILED=1
  else
    log_succ "NOT EXECUTABLE never renders as FAIL"
  fi
fi

# The remedy must be actionable AND tracked-mode level: `chmod +x` alone leaves the
# git index at 644, which is exactly the bug that survived for weeks. Both halves
# must name the SAME path — a hardcoded `scenarios/<basename>` disagreed with the
# runner's own path for any nested scenario, and the pasted command then failed
# with "did not match any files".
REMEDY="$(grep -m1 'update-index --chmod=+x' "$RUN_LOG" || true)"
if [ -z "$REMEDY" ]; then
  log_fail "the NOT EXECUTABLE message does not name the tracked-mode remedy"; FAILED=1
else
  log_succ "the NOT EXECUTABLE message names the tracked-mode remedy"
  CHMOD_PATH="$(echo "$REMEDY" | sed -n 's/.*chmod +x \(.*\) && git update-index.*/\1/p')"
  INDEX_PATH="$(echo "$REMEDY" | sed -n 's/.*update-index --chmod=+x \(.*\)$/\1/p')"
  check "both halves of the remedy name one path" "$CHMOD_PATH" "$INDEX_PATH"
fi

if grep -q 'scenario_state' "$RUNNER"; then
  log_succ "runner classifies through scenario_state (one decision, one place)"
else
  log_fail "runner no longer uses scenario_state — the outcomes can drift apart"; FAILED=1
fi
# Check-only, like the pre-push gate: a runner that chmods the tree it is judging
# turns a red commit into a green run on one machine only. Observed, not grepped:
# the 644 fixture is still 644 after the run.
check "the runner left the 644 fixture untouched" 644 "$(file_mode "$FIXTURE_SCENARIOS/fx-unexecutable.sh")"
# Matches `chmod` in any COMMAND position, not just as a line's first word: an
# anchored `^[[:space:]]*chmod` let `mkdir -p "$d" && chmod +x "$s"`,
# `[ -x "$s" ] || chmod +x "$s"` and `$(chmod …)` through — a named assertion a
# reader would take at face value while it asserted almost nothing. What it must
# NOT match is `chmod` inside a message: the runner PRINTS the remedy
# (`echo "  chmod +x $rel && …"`), and that is the opposite of repairing.
CHMOD_CALL='(^|[;&|(`{]|\b(then|do|else)\b)[[:space:]]*chmod([[:space:]]|$)'
if grep -Eq "$CHMOD_CALL" "$RUNNER" "$SMOKE_DIR/lib/ci-tests.sh" "$SMOKE_DIR/lib/utils.sh"; then
  log_fail "the runner chmods a file — it must report the mode, never fix it"; FAILED=1
else
  log_succ "runner never chmods (check-only)"
fi

# The remedy path is only trustworthy if `repo_relative_path` degrades honestly:
# with REPO_ROOT unset the guard `"${REPO_ROOT:-}"/*` degenerates to `/*`, which
# matches every absolute path and strips the leading slash — a confidently wrong
# path in the one message added to make failures legible.
check "repo_relative_path leaves a path alone when the root is unknown" \
  "/Users/x/repo/scripts/a.sh" \
  "$(REPO_ROOT="" repo_relative_path /Users/x/repo/scripts/a.sh)"
check "repo_relative_path strips a known root" \
  "scripts/a.sh" \
  "$(REPO_ROOT=/Users/x/repo repo_relative_path /Users/x/repo/scripts/a.sh)"

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
# `OFFLINE_SAFE=false` on its own line (the enforced rule is opt-OUT — a scenario
# runs in CI unless it says otherwise) or name a tracking issue, which is the
# flakiness escape hatch the story allows in both directions. Without this,
# "excluded" degrades back into "nobody got round to it".
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
#
# Scoped to the workflows DIRECTORY, not to ci.yml: the repo is actively splitting
# jobs into their own workflow files (#413 adds `format` that way), and the smoke
# job already carries its own permissions/timeout. Pinning one filename would turn
# "we moved the job" into a red asserting the suite is not wired into CI at all.
WORKFLOWS_DIR="$REPO_ROOT/.github/workflows"
if grep -rq 'run-all.sh --ci' "$WORKFLOWS_DIR"; then
  log_succ "CI runs the smoke suite"
else
  log_fail "no workflow runs run-all.sh --ci — the CI_TESTS list is a claim again"; FAILED=1
fi
if grep -rqi 'MEASURED COST' "$WORKFLOWS_DIR" && grep -rqi 'REVISIT THRESHOLD' "$WORKFLOWS_DIR"; then
  log_succ "the job records its measured cost and the revisit threshold"
else
  log_fail "the smoke job has no measured cost / revisit threshold recorded"; FAILED=1
fi

# The TRACKED-mode guard's enforcement point must be a step that always RUNS.
# `pnpm test` is a cacheable turbo task whose inputs live entirely inside
# @pair/dev-tools, so a scenario added mode 644 without touching that package
# replays a cached PASS and the guard never executes. The root gate chain and the
# CI step are the two places that cannot be cached away — asserted here, and the
# CLI is EXECUTED so a broken entrypoint is a red rather than a green no-op.
ROOT_PKG="$REPO_ROOT/package.json"
if grep -q 'smoke-modes:check' "$ROOT_PKG" && node -e "
  const g = require('$ROOT_PKG').scripts['quality-gate'] || '';
  process.exit(g.includes('smoke-modes:check') ? 0 : 1)"; then
  log_succ "the root quality-gate runs the smoke-scenario mode guard (uncacheable)"
else
  log_fail "quality-gate no longer runs pnpm smoke-modes:check — a 644 scenario can be pushed"; FAILED=1
fi
if grep -rq 'smoke-modes:check' "$WORKFLOWS_DIR"; then
  log_succ "a CI step runs the mode guard, not only the cacheable unit test"
else
  log_fail "no CI step runs pnpm smoke-modes:check"; FAILED=1
fi
if (cd "$REPO_ROOT" && pnpm smoke-modes:check >/dev/null 2>&1); then
  log_succ "the mode-guard CLI runs and reports green on this tree"
else
  log_fail "pnpm smoke-modes:check failed (or its entrypoint is broken)"; FAILED=1
fi
# Nothing is auto-corrected in CI: the guard reports, it never fixes a mode.
#
# SCOPED to smoke-test paths on purpose. `ci.yml` is a shared file several stories
# touch, and a future job may legitimately need `chmod` on something else (the
# `secret-scan` job already downloads and extracts a binary). A repo-wide grep
# would fail this suite with a message that misdiagnoses the cause. What is
# forbidden is narrower and exact: CI repairing a SMOKE SCENARIO's mode — the
# habit that lets a 644 commit go unnoticed (release.yml does chmod its own
# release scripts before running them, which is out of this invariant's scope).
# Comment lines are exempt: the job DOCUMENTS that it never chmods. Directory-wide
# for the same reason as above: the invariant follows the job, not the filename.
if grep -rEq '^[[:space:]]*[^#[:space:]].*\bchmod\b.*scripts/smoke-tests' "$WORKFLOWS_DIR"; then
  log_fail "ci.yml chmods a smoke-test path — CI must report a scenario's mode, never repair it"; FAILED=1
else
  log_succ "CI never chmods a smoke scenario (check-only)"
fi

rm -rf "$FIX"

if [ "$FAILED" -ne 0 ]; then
  log_fail "$TEST_NAME had failures"; exit 1
fi
log_succ "$TEST_NAME passed"
