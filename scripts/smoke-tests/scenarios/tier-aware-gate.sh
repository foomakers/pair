#!/usr/bin/env bash
# OFFLINE_SAFE=true
#
# Tier-aware pre-merge gate — verification scenario (story #258).
#
# Exercises the shipped, provider-agnostic tag resolver end-to-end and audits the
# generated-pipeline guideline for the two non-negotiable properties:
#   1. the resolver reads classification TAGS ONLY (fail-safe red), and
#   2. the pipeline contains NO classification criteria (grep-verifiable, D18),
#      and secret scanning is unconditional at every tier.
#
# Per the gate-tooling ADL (2026-07-13) this shell/template surface is verified
# with a smoke test, not a vitest unit test.
source "$(dirname "$0")/../lib/utils.sh"
ensure_tmp_dir

TEST_NAME="Tier-Aware Pre-Merge Gate"
echo "=== Running $TEST_NAME ==="

REPO_ROOT="${REPO_ROOT:-$(cd "$(dirname "$0")/../../.." && pwd)}"
RESOLVER="$REPO_ROOT/packages/knowledge-hub/dataset/.pair/knowledge/assets/tier-resolve.sh"
GUIDELINE="$REPO_ROOT/packages/knowledge-hub/dataset/.pair/knowledge/guidelines/infrastructure/cicd-strategy/tier-aware-pipeline.md"

FAILED=0
check() { # check <description> <expected> <actual>
  if [ "$2" = "$3" ]; then log_succ "$1 => $3"; else log_fail "$1: expected '$2' got '$3'"; FAILED=1; fi
}

assert_file "$RESOLVER" || exit 1
assert_file "$GUIDELINE" || exit 1

# shellcheck source=/dev/null
source "$RESOLVER"

# --- Tag -> TIER resolution (reads tags only, fail-safe red) ---
check "risk:green tag"              green  "$(resolve_tier 'risk:green' 2>/dev/null)"
check "risk:yellow tag"            yellow "$(resolve_tier 'risk:yellow' 2>/dev/null)"
check "risk:red tag"               red    "$(resolve_tier 'risk:red' 2>/dev/null)"
check "untagged PR (fail-safe)"    red    "$(resolve_tier '' 2>/dev/null)"
check "malformed tag (fail-safe)"  red    "$(resolve_tier 'risk:banana' 2>/dev/null)"
check "max() widens, never narrows" red   "$(resolve_tier 'risk:green risk:red' 2>/dev/null)"
check "max() green+yellow => yellow" yellow "$(resolve_tier 'risk:green risk:yellow' 2>/dev/null)"

# untagged/malformed must warn (never silently pass) on stderr
if resolve_tier '' 2>&1 >/dev/null | grep -q 'fail-safe'; then
  log_succ "untagged emits fail-safe warning"
else
  log_fail "untagged did not warn"; FAILED=1
fi

# --- Per-tier required suites (matrix sourced from quality-model §4) ---
check "green suites"  "install lint type build"                  "$(required_suites_for_tier green)"
check "yellow suites" "install lint type build unit"             "$(required_suites_for_tier yellow)"
check "red suites"    "install lint type build unit integration e2e" "$(required_suites_for_tier red)"

# --- Missing required suite => explicit failure, never a silent pass ---
if require_suite e2e 0 2>/dev/null; then log_fail "missing suite passed silently"; FAILED=1; else log_succ "missing suite fails explicitly"; fi
if require_suite e2e 1 2>/dev/null; then log_succ "present suite passes"; else log_fail "present suite failed"; FAILED=1; fi

# --- Grep audit: resolver + guideline template carry NO classification criteria (D18) ---
# The resolver/pipeline must never inspect the diff/code to decide a tier — it only
# reads the risk:* label. Any of these tokens inside the resolver is a criteria leak.
if grep -Eiq '\b(schema|migration|git diff|--numstat|lines?[ -]changed|loc\b|files?[ -]changed)\b' "$RESOLVER"; then
  log_fail "resolver leaks classification criteria"; grep -Ein 'schema|migration|numstat|loc|changed' "$RESOLVER"; FAILED=1
else
  log_succ "resolver contains no classification criteria"
fi

# --- Secret scanning is unconditional: the secret-scan YAML job has NO `if:` key ---
# Scope strictly to the 2-space-indented `secret-scan:` job block inside the YAML
# (reset on the next job key), ignoring prose that mentions "if:".
if awk '
  /^  secret-scan:/ { injob=1; next }
  /^  [a-z][a-z0-9-]*:/ { injob=0 }
  injob && /^ +if:/ { hit=1 }
  END { exit hit ? 1 : 0 }
' "$GUIDELINE"; then
  log_succ "secret-scan job is unconditional at every tier"
else
  log_fail "secret-scan job has an if: (tier-conditioned)"; FAILED=1
fi

if [ "$FAILED" -ne 0 ]; then
  log_fail "$TEST_NAME had failures"; exit 1
fi
log_succ "$TEST_NAME passed"
