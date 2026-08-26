#!/usr/bin/env bash
# coverage-gate.sh — provider-agnostic coverage baseline + regression guardrail
# for the tag-driven pre-merge gate (story #282).
#
# THIS FILE IS A GUARDRAIL, NOT A CLASSIFIER. It reads two inputs only:
#   1. the project's coverage config in adoption (per-type targets + a
#      human-committed baseline) — see coverage-config-example.md; and
#   2. a coverage percentage the pipeline already extracted from whatever report
#      the adopted test tooling produced (e.g. istanbul coverage-summary.json).
# It contains NO classification criteria (D18): it never inspects the diff, the
# code, file paths, or change size. The risk tier is decided upstream by
# `classify` and passed in only to choose the fail-safe behavior when NO coverage
# was measured (block at red, warn at lower tiers).
#
# Policy (story #282):
#   - The guardrail blocks a REGRESSION below the committed baseline, at every
#     tier — not "must hit X% absolute". Coverage that holds or improves on the
#     committed baseline passes.
#   - Per-type targets (backend/frontend/shared/…) select the gradual goal for the
#     touched code's type; below-target-but-not-below-baseline warns, never blocks —
#     the target is a direction to move in, only the baseline is enforced.
#   - No baseline committed yet (or a missing/corrupt one) => the gate PRINTS an
#     advisory suggestion to stderr and PASSES (bootstrap-only mode), rather than
#     blocking every project that has not committed a baseline yet. It does NOT
#     persist the baseline itself.
#   - No coverage report measured => fail-safe: BLOCK at red, WARN at lower tiers,
#     never a silent pass (edge case).
#
# PERSISTENCE (read before relying on the guardrail): the guardrail is LIVE only
# once a human COMMITS a `baseline.<type>=NN` line to the coverage config. The gate
# never persists the baseline itself — a CI checkout is ephemeral, so any file it
# wrote would be discarded when the runner is torn down (the failure mode: coverage
# could drift down run after run, each run "bootstrapping" a new, lower baseline it
# then throws away, and the regression guard would never fire). So bootstrapping is
# ADVISORY: the gate echoes the suggested `baseline.<type>=NN` to stderr for a human
# to copy into the committed config, and passes without blocking until that commit
# lands. THIS FILE NEVER WRITES, in any configuration. Automated commit-back is a
# SEPARATE, nested opt-in that lives outside this gate: when
# `Coverage baseline commit-back: enabled` is set, a push to the base branch
# proposes a raised baseline as a bot pull request (never a push to the base
# branch, never from a pull-request run), run by the shipped `coverage-ratchet`
# command as its own pipeline step. It is a side effect that may fail alone
# — a refused write is a warning and leaves this gate's verdict untouched.
#
# See:
#   .pair/knowledge/guidelines/infrastructure/cicd-strategy/tier-aware-pipeline.md
#   .pair/knowledge/assets/coverage-config-example.md
#
# Usage (sourced — as in the pipeline / the smoke test):
#   source coverage-gate.sh
#   coverage_gate "$TIER" "$TYPE" "$COVERAGE_PCT" .pair/adoption/tech/coverage-baseline.md || exit 1
# Usage (executed directly as a CLI):
#   bash coverage-gate.sh "$TIER" "$TYPE" "$COVERAGE_PCT" <config-file> || exit 1

# COVERAGE_DEFAULT_TARGET — advisory fallback when neither target.<type> nor
# target.default is configured (0 => no absolute goal; the baseline guardrail still applies).
: "${COVERAGE_DEFAULT_TARGET:=0}"

# _cov_is_num <val> — true iff val is a non-negative integer or decimal.
_cov_is_num() { printf '%s' "${1:-}" | grep -Eq '^[0-9]+([.][0-9]+)?$'; }

# _cov_key_re <key> — escape regex metachars so a dotted key matches literally.
_cov_key_re() { printf '%s' "$1" | sed 's/[.[\*^$]/\\&/g'; }

# cov_config_value <file> <key> [default] — echo the value of the first `key=value`
# line in the config, ignoring surrounding markdown (fences, headings). Trailing
# CR (CRLF-authored config) and surrounding whitespace are stripped so a
# `baseline.<type>=NN\r` from a Windows/autocrlf checkout is read as the number NN
# rather than rejected as corrupt. Empty/absent => the default (or empty string).
# Reads config ONLY — no code/diff inspection.
cov_config_value() {
  local file="$1" key="$2" def="${3:-}" val
  val="$(grep -E "^$(_cov_key_re "$key")=" "$file" 2>/dev/null | head -1 | sed 's/^[^=]*=//' | tr -d '\r' | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')"
  if [ -n "$val" ]; then printf '%s' "$val"; else printf '%s' "$def"; fi
}

# target_for_type <config-file> <type> — echo the gradual target for a code type:
# target.<type>, else target.default, else $COVERAGE_DEFAULT_TARGET.
target_for_type() {
  local cfg="$1" type="$2" v
  v="$(cov_config_value "$cfg" "target.$type")"
  [ -n "$v" ] && { printf '%s' "$v"; return 0; }
  v="$(cov_config_value "$cfg" "target.default")"
  [ -n "$v" ] && { printf '%s' "$v"; return 0; }
  printf '%s' "$COVERAGE_DEFAULT_TARGET"
}

# baseline_for_type <config-file> <type> — echo the committed baseline for a type
# (may be empty if a human has not committed one yet).
baseline_for_type() { cov_config_value "$1" "baseline.$2"; }

# suggest_baseline <type> <current> — print an ADVISORY baseline suggestion to
# stderr. The gate deliberately does NOT persist it (a CI checkout is ephemeral;
# see the PERSISTENCE note above). A bootstrapped baseline only takes effect once
# a human COMMITS the printed line to the coverage config — or, with the nested
# commit-back opt-in on, once the ratchet's bot pull request is merged.
suggest_baseline() {
  echo "coverage-gate: no committed baseline for '$1' — bootstrap-only mode: PASSING without blocking (not persisting; a CI checkout is ephemeral)." >&2
  echo "coverage-gate: to ACTIVATE the guardrail, commit this line to your coverage config:" >&2
  echo "  baseline.$1=$2" >&2
}

# coverage_gate <tier> <type> <current> <config-file> — the guardrail.
# Returns 0 (pass) / 1 (block). All human-readable output goes to stderr.
coverage_gate() {
  local tier="${1:-}" type="${2:-}" current="${3:-}" cfg="${4:-}" baseline target

  # 1. No coverage measured => fail-safe by tier (never a silent pass).
  if ! _cov_is_num "$current"; then
    case "$tier" in
    red | "")
      echo "coverage-gate: coverage NOT MEASURED for '$type' at red tier — failing the gate (no silent pass)" >&2
      return 1
      ;;
    *)
      echo "coverage-gate: coverage not measured for '$type' — warning only at '$tier' tier (heavier suites are not scheduled below red); never a silent pass" >&2
      return 0
      ;;
    esac
  fi

  # 2. No valid committed baseline yet => advisory suggestion + pass (bootstrap-only
  #    mode). The gate does NOT persist it; a human must commit baseline.<type>.
  baseline="$(baseline_for_type "$cfg" "$type")"
  if ! _cov_is_num "$baseline"; then
    suggest_baseline "$type" "$current"
    return 0
  fi

  # 3. Regression guardrail: below the baseline blocks, at EVERY tier.
  if awk -v a="$current" -v b="$baseline" 'BEGIN { exit !(a + 0 < b + 0) }'; then
    echo "coverage-gate: REGRESSION — '$type' coverage ${current}% is below baseline ${baseline}%; blocking merge" >&2
    return 1
  fi

  # 4. At/above baseline => pass. Advisory-warn if still below the gradual target.
  target="$(target_for_type "$cfg" "$type")"
  if _cov_is_num "$target" && awk -v a="$current" -v t="$target" 'BEGIN { exit !(a + 0 < t + 0) }'; then
    echo "coverage-gate: '$type' coverage ${current}% holds the baseline ${baseline}% but is below the gradual target ${target}% (advisory, not blocking)" >&2
  fi
  return 0
}

# CLI entrypoint when executed directly (not sourced): coverage_gate with the args.
if [ "${BASH_SOURCE[0]:-$0}" = "${0}" ]; then
  coverage_gate "$@"
fi
