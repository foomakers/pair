#!/usr/bin/env bash
# OFFLINE_SAFE=true
#
# Coverage baseline + CI guardrail — verification scenario (story #282).
#
# Exercises the shipped, provider-agnostic coverage guardrail end-to-end and
# audits the guideline for the non-negotiable properties:
#   1. a regression below the established baseline BLOCKS (fails) at every tier;
#   2. maintaining or improving coverage PASSES (guardrail, not an absolute wall);
#   3. per-type targets select the threshold matching the touched code's type;
#   4. baseline bootstrapping establishes a baseline on first run / when missing /
#      when corrupt, warning instead of blocking everything at 0;
#   5. a missing coverage report fails safe: BLOCKS at red tier, WARNS at lower
#      tiers, never a silent pass;
#   6. the guardrail reads adoption config + a coverage number only — it carries NO
#      classification criteria (D18): it never inspects the diff, code, or paths.
#
# Per the gate-tooling ADL (2026-07-13) this shell/asset surface is verified with a
# smoke test, not a vitest unit test.
source "$(dirname "$0")/../lib/utils.sh"
ensure_tmp_dir

TEST_NAME="Coverage Baseline + CI Guardrail"
echo "=== Running $TEST_NAME ==="

REPO_ROOT="${REPO_ROOT:-$(cd "$(dirname "$0")/../../.." && pwd)}"
GATE="$REPO_ROOT/packages/knowledge-hub/dataset/.pair/knowledge/assets/coverage-gate.sh"
GUIDELINE="$REPO_ROOT/packages/knowledge-hub/dataset/.pair/knowledge/guidelines/infrastructure/cicd-strategy/tier-aware-pipeline.md"
EXAMPLE="$REPO_ROOT/packages/knowledge-hub/dataset/.pair/knowledge/assets/coverage-config-example.md"

FAILED=0
check() { # check <description> <expected> <actual>
  if [ "$2" = "$3" ]; then log_succ "$1 => $3"; else log_fail "$1: expected '$2' got '$3'"; FAILED=1; fi
}
pass() { # pass <description> <cmd...> — expects exit 0
  local desc="$1"; shift
  if "$@" >/dev/null 2>&1; then log_succ "$desc (passed as expected)"; else log_fail "$desc: expected pass (exit 0) got fail"; FAILED=1; fi
}
block() { # block <description> <cmd...> — expects non-zero exit
  local desc="$1"; shift
  if "$@" >/dev/null 2>&1; then log_fail "$desc: expected BLOCK (exit!=0) got pass"; FAILED=1; else log_succ "$desc (blocked as expected)"; fi
}

assert_file "$GATE" || exit 1
assert_file "$GUIDELINE" || exit 1
assert_file "$EXAMPLE" || exit 1

# shellcheck source=/dev/null
source "$GATE"

# --- Config fixture: per-type targets + an established baseline (parseable lines
# that also live verbatim inside the adoption markdown's fenced config block) ---
CFG="$TMP_DIR/coverage-baseline.md"
cat >"$CFG" <<'EOF'
# Coverage config (fixture)
```ini
target.default=70
target.backend=80
target.frontend=60
target.shared=90
exclude=**/*.generated.ts
baseline.default=75
baseline.backend=82.5
baseline.frontend=61
```
EOF

# --- Per-type target selection (AC5) ---
check "target backend"          80 "$(target_for_type "$CFG" backend)"
check "target frontend"         60 "$(target_for_type "$CFG" frontend)"
check "target shared"           90 "$(target_for_type "$CFG" shared)"
check "target unknown->default" 70 "$(target_for_type "$CFG" mystery)"

# --- Baseline read ---
check "baseline backend" 82.5 "$(baseline_for_type "$CFG" backend)"

# --- Regression blocks; maintain/improve passes (AC1/AC2) — at EVERY tier ---
block "green: backend 80 < baseline 82.5 blocks"   coverage_gate green  backend 80    "$CFG"
block "yellow: backend 80 < baseline 82.5 blocks"  coverage_gate yellow backend 80    "$CFG"
block "red: backend 80 < baseline 82.5 blocks"     coverage_gate red    backend 80    "$CFG"
pass  "backend 82.5 == baseline passes"            coverage_gate yellow backend 82.5  "$CFG"
pass  "backend 90 > baseline passes"               coverage_gate yellow backend 90    "$CFG"
pass  "frontend 61 == baseline passes"             coverage_gate yellow frontend 61   "$CFG"

# --- Missing coverage report: fail-safe by tier (edge case) ---
block "red + no report blocks (fail-safe)"         coverage_gate red    backend ""    "$CFG"
pass  "yellow + no report warns (no block)"        coverage_gate yellow backend ""    "$CFG"
pass  "green + no report warns (no block)"         coverage_gate green  backend ""    "$CFG"
# missing report must warn on stderr (never silently pass)
if coverage_gate yellow backend "" "$CFG" 2>&1 >/dev/null | grep -qi 'not measured\|no coverage'; then
  log_succ "missing report warns on stderr"
else
  log_fail "missing report did not warn"; FAILED=1
fi

# --- Baseline bootstrapping: no baseline established for a type (AC4) ---
BOOT="$TMP_DIR/coverage-bootstrap.md"
cat >"$BOOT" <<'EOF'
```ini
target.default=70
```
EOF
pass  "no baseline -> bootstraps, does not block" coverage_gate red backend 55 "$BOOT"
if grep -q '^baseline.backend=55' "$BOOT"; then
  log_succ "bootstrap wrote baseline.backend=55"
else
  log_fail "bootstrap did not persist baseline"; FAILED=1
fi

# --- Corrupt baseline re-establishes rather than blocking (edge case) ---
CORRUPT="$TMP_DIR/coverage-corrupt.md"
cat >"$CORRUPT" <<'EOF'
```ini
baseline.backend=not-a-number
```
EOF
pass  "corrupt baseline -> re-bootstraps, no block" coverage_gate red backend 70 "$CORRUPT"
if grep -q '^baseline.backend=70' "$CORRUPT"; then
  log_succ "corrupt baseline re-established to 70"
else
  log_fail "corrupt baseline not re-established"; FAILED=1
fi

# --- Grep audit: the gate carries NO classification criteria (D18). It reads the
# adoption config and a coverage number — it never inspects the diff/code/paths. ---
CRITERIA='\b(git diff|--numstat|files?[ -]changed|risk:(green|yellow|red)|schema|migration)\b'
if grep -Eiq "$CRITERIA" "$GATE"; then
  log_fail "coverage gate leaks classification criteria"; grep -Ein "$CRITERIA" "$GATE"; FAILED=1
else
  log_succ "coverage gate contains no classification criteria"
fi

# --- Guideline audit: the coverage guardrail is documented as a job consumed by
# THIS pipeline (AC3), baseline-relative (regression), with per-type targets and
# fail-safe behavior. ---
if grep -qi 'coverage guardrail' "$GUIDELINE" \
  && grep -qi 'baseline' "$GUIDELINE" \
  && grep -qi 'regression' "$GUIDELINE"; then
  log_succ "guideline documents the coverage guardrail (baseline/regression)"
else
  log_fail "guideline missing coverage guardrail documentation"; FAILED=1
fi

if [ "$FAILED" -ne 0 ]; then
  log_fail "$TEST_NAME had failures"; exit 1
fi
log_succ "$TEST_NAME passed"
