#!/usr/bin/env bash
# tier-resolve.sh — provider-agnostic tier resolver for the tag-driven pre-merge gate.
#
# THIS FILE READS CLASSIFICATION TAGS ONLY. It contains NO classification
# criteria (D18): it never inspects the diff, the code, file paths, or change
# size to decide a tier. The tier is decided upstream by `classify` (#233) from
# the quality model, carried on the PR as a `risk:*` label, and propagated by
# `publish-pr`. This script is the deterministic Automation layer of the quality
# model's three-layer principle — it consumes the tag and nothing else.
#
# Fail-safe: an absent, unknown, or malformed `risk:*` label resolves to `red`
# (the widest matrix), never a silent green. See:
#   .pair/knowledge/guidelines/infrastructure/cicd-strategy/tier-aware-pipeline.md
#   .pair/knowledge/guidelines/quality-assurance/quality-model.md  (§3.2 fail-safe, §4 matrix)
#
# Usage (in a provider's pipeline, e.g. GitHub Actions):
#   PR_LABELS="$(gh pr view "$PR" --json labels -q '.labels[].name')"  # tags only
#   source tier-resolve.sh
#   TIER="$(resolve_tier "$PR_LABELS")"

# resolve_tier [labels...] — labels default to $PR_LABELS (space/newline separated).
# Echoes exactly one of: green | yellow | red. Always exits 0; `red` is the
# fail-safe default. Widens on max(); never narrows (risk:red always wins).
resolve_tier() {
  local raw="${*:-${PR_LABELS:-}}"
  local best="" malformed=0 tok
  for tok in $raw; do
    case "$tok" in
    risk:red) best=red ;;
    risk:yellow) [ "$best" = red ] || best=yellow ;;
    risk:green) [ -z "$best" ] && best=green ;;
    risk:*) malformed=1 ;;
    esac
  done
  if [ "$best" = red ]; then echo red; return 0; fi
  if [ "$malformed" = 1 ]; then
    echo "tier-resolve: malformed risk:* label — treating as red (fail-safe)" >&2
    echo red
    return 0
  fi
  if [ -n "$best" ]; then echo "$best"; return 0; fi
  echo "tier-resolve: no risk:* tag on the PR — treating as red (fail-safe)" >&2
  echo red
}

# required_suites_for_tier <tier> — echoes the space-separated suite keys the tier
# requires. Base (install lint type build) always; +unit from yellow;
# +integration +e2e from red. An unknown tier gets the full (red) set — fail-safe.
# The tier→checks mapping is the quality model's matrix (§4); this function is the
# single executable copy of it, not a second source of truth.
required_suites_for_tier() {
  local base="install lint type build"
  case "$1" in
  green) echo "$base" ;;
  yellow) echo "$base unit" ;;
  red) echo "$base unit integration e2e" ;;
  *) echo "$base unit integration e2e" ;;
  esac
}

# require_suite <suite-name> <present:0|1> — a required suite that is absent is an
# EXPLICIT failure (exit 1), never a silent pass. Call this per required suite
# after resolving the tier so a 🔴 PR with no e2e suite fails loudly.
require_suite() {
  local name="$1" present="$2"
  if [ "$present" != "1" ]; then
    echo "tier-resolve: required suite '$name' is MISSING at this tier — failing the gate (no silent pass)" >&2
    return 1
  fi
  return 0
}
