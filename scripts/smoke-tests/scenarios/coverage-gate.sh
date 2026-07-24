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
#   4. baseline bootstrapping is ADVISORY on first run / when missing / when
#      corrupt — it SUGGESTS a value on stderr and passes without persisting
#      (a CI checkout is ephemeral; the baseline is human-committed, see #372),
#      instead of blocking everything at 0;
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

# --- CRLF-authored config: a trailing CR must NOT corrupt a human-committed
# baseline (Minor fix — Windows/autocrlf checkout). baseline.backend=82.5\r must
# read as 82.5, so 80 < 82.5 still BLOCKS instead of silently re-bootstrapping. ---
CRLF="$TMP_DIR/coverage-crlf.md"
printf 'target.backend=80\r\nbaseline.backend=82.5\r\n' >"$CRLF"
check "CRLF baseline read as number"              82.5 "$(baseline_for_type "$CRLF" backend)"
block "CRLF baseline honored (80 < 82.5 blocks)"  coverage_gate red backend 80 "$CRLF"

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

# --- Baseline bootstrapping is ADVISORY (AC4 + persistence=A): no committed
# baseline => the gate SUGGESTS a value on stderr and PASSES, but does NOT persist
# it (a CI checkout is ephemeral; a human commits it — see #372). ---
BOOT="$TMP_DIR/coverage-bootstrap.md"
cat >"$BOOT" <<'EOF'
```ini
target.default=70
```
EOF
BOOT_BEFORE="$(cat "$BOOT")"
pass  "no baseline -> advisory pass, does not block" coverage_gate red backend 55 "$BOOT"
if coverage_gate red backend 55 "$BOOT" 2>&1 >/dev/null | grep -q 'baseline.backend=55'; then
  log_succ "bootstrap SUGGESTS baseline.backend=55 on stderr"
else
  log_fail "bootstrap did not suggest a baseline on stderr"; FAILED=1
fi
if [ "$(cat "$BOOT")" = "$BOOT_BEFORE" ]; then
  log_succ "bootstrap did NOT persist to the config (advisory-only; ephemeral-safe)"
else
  log_fail "bootstrap wrote to the config (must be advisory-only)"; FAILED=1
fi

# --- Corrupt baseline is advisory too: pass without blocking AND without
# overwriting the (corrupt) committed value on its own (edge case). ---
CORRUPT="$TMP_DIR/coverage-corrupt.md"
cat >"$CORRUPT" <<'EOF'
```ini
baseline.backend=not-a-number
```
EOF
CORRUPT_BEFORE="$(cat "$CORRUPT")"
pass  "corrupt baseline -> advisory pass, no block" coverage_gate red backend 70 "$CORRUPT"
if [ "$(cat "$CORRUPT")" = "$CORRUPT_BEFORE" ]; then
  log_succ "corrupt baseline NOT overwritten by the gate (advisory-only)"
else
  log_fail "corrupt baseline was overwritten (must be advisory-only)"; FAILED=1
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

# --- Opt-in audit (default off): the guardrail must be documented as opt-in in
# both the guideline and the docs, and its persistence model must be advisory /
# human-committed — the Major fix (persistence=A). ---
if grep -qi 'opt-in' "$GUIDELINE" \
  && grep -Eqi 'human-committed|human commits|bootstrap-only' "$GUIDELINE"; then
  log_succ "guideline documents opt-in + advisory/human-committed persistence"
else
  log_fail "guideline missing opt-in / persistence documentation"; FAILED=1
fi

# --- Example audit: persistence=A (human-committed, advisory, commit-back #372)
# and the exclude-is-adopter-applied clarification (the two remaining Minors). ---
if grep -Eqi 'human-committed|bootstrap-only' "$EXAMPLE" \
  && grep -q '#372' "$EXAMPLE" \
  && grep -qi 'applied by the adopter' "$EXAMPLE"; then
  log_succ "example documents persistence=A (#372) + exclude adopter-applied"
else
  log_fail "example missing persistence / exclude clarification"; FAILED=1
fi

# --- "machine-maintained" wording must be gone from the shipped assets (Major fix). ---
if grep -qi 'machine-maintained' "$GATE" "$EXAMPLE" "$GUIDELINE"; then
  log_fail "'machine-maintained' wording still present (should be removed)"; FAILED=1
else
  log_succ "no misleading 'machine-maintained' wording remains"
fi

if [ "$FAILED" -ne 0 ]; then
  log_fail "$TEST_NAME had failures"; exit 1
fi
log_succ "$TEST_NAME passed"
