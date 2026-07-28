#!/usr/bin/env bash
# pr-state.sh — provider-agnostic PR-state synthesis for the gate≠review merge flow.
#
# THIS FILE READS STATE SIGNALS AND CLASSIFICATION TAGS ONLY. It contains NO
# classification criteria (D18): it never inspects the diff, the code, file paths,
# or change size. The tier is decided upstream by `classify` from the quality
# model, carried on the PR as a `risk:*` label, and resolved into `green|yellow|red`
# by the sibling helper `tier-resolve.sh` (`resolve_tier`). This script is the
# deterministic Automation layer of the quality model's three-layer principle:
# it synthesizes already-produced signals and nothing else.
#
# Gate ≠ review (R5.4): the mechanical gate is the FIRST filter — a non-green gate
# can never produce a merge-enabling state, no matter what the judgment review said.
#
# Fail-safe: an unknown gate/review signal is treated as not-passing, and an absent,
# unknown, or malformed tier is treated as `red` (the strictest requirements) — never
# a silent `ready-to-merge`. See:
#   .pair/knowledge/guidelines/collaboration/project-management-tool/pr-states.md
#   .pair/knowledge/guidelines/quality-assurance/quality-model.md  (§3.2 fail-safe, §4 per-tier requirements)
#
# Usage (in a code host's automation, or by /pair-process-review):
#   source tier-resolve.sh                       # tags only
#   source pr-state.sh
#   TIER="$(resolve_tier "$PR_LABELS")"
#   STATE="$(resolve_pr_state "$GATES" "$REVIEW" "$TIER" "$EXPLICIT_APPROVAL")"
#   merge_allowed "$STATE" || exit 1

# resolve_pr_state <gates> <review> <tier> <explicit_approval>
#   gates             : pass | fail | pending | <anything else ⇒ treated as not-passing>
#   review            : approved | tech-debt | changes-requested | pending | missing | error
#                       (`tech-debt` is an approving verdict — approve now, track the debt
#                       separately; anything unrecognized is treated as no decision yet)
#   tier              : green | yellow | red | <anything else ⇒ red (fail-safe)>
#   explicit_approval : 1 when a human approval is recorded on the CURRENT head, else 0
#
# Echoes exactly one of: to-be-reviewed | ready-to-merge | not-approved. Always exits 0.
resolve_pr_state() {
  local gates="${1:-}" review="${2:-}" tier="${3:-}" approval="${4:-0}"

  # A changes-requested verdict is the one state that routes to a human author,
  # whatever the gate says — the finding list is the actionable output.
  if [ "$review" = "changes-requested" ]; then
    echo "not-approved"
    return 0
  fi

  # Gate first (R5.4): review never unlocks a merge over a non-green gate.
  if [ "$gates" != "pass" ]; then
    echo "pr-state: gates are not green ('${gates:-unknown}') — no merge-enabling state (gate is the first filter)" >&2
    echo "to-be-reviewed"
    return 0
  fi

  # Review must be an approving verdict; pending/missing/error/unknown stay blocked.
  case "$review" in
  approved | tech-debt) ;;
  *)
    echo "pr-state: review is '${review:-unknown}', not an approving verdict — staying to-be-reviewed (fail-safe)" >&2
    echo "to-be-reviewed"
    return 0
    ;;
  esac

  # Tier requirements: 🔴 (and any unknown tier, fail-safe) needs explicit human approval.
  if explicit_approval_required "$tier" && [ "$approval" != "1" ]; then
    echo "pr-state: tier '${tier:-unknown}' requires explicit human approval — staying to-be-reviewed" >&2
    echo "to-be-reviewed"
    return 0
  fi

  echo "ready-to-merge"
}

# explicit_approval_required <tier> — exit 0 (required) for red and for any
# unknown/absent tier (fail-safe), exit 1 (not required) for green/yellow.
# The requirement itself is the quality model's §4 row, not a rule invented here.
explicit_approval_required() {
  case "${1:-}" in
  green | yellow) return 1 ;;
  red) return 0 ;;
  *)
    echo "pr-state: unknown tier '${1:-}' — requiring explicit approval (fail-safe red)" >&2
    return 0
    ;;
  esac
}

# merge_allowed <state> — exit 0 ONLY for ready-to-merge; any other state exits 1
# with the reason on stderr. Never a silent pass.
merge_allowed() {
  case "${1:-}" in
  ready-to-merge) return 0 ;;
  not-approved)
    echo "pr-state: state is 'not-approved' — merge blocked, findings go back to the author" >&2
    return 1
    ;;
  *)
    echo "pr-state: state is '${1:-unknown}' — merge blocked (gates green + approved review required; explicit approval at 🔴)" >&2
    return 1
    ;;
  esac
}

# review_check_conclusion <verdict> — maps a review verdict onto the conclusion the
# REQUIRED `pair-review` check must carry on the code host (R5.7):
#   approved | tech-debt   ⇒ success
#   changes-requested      ⇒ failure
#   anything else (pending, missing, crashed, timed out, unknown) ⇒ pending
# A pending check blocks the merge exactly like a failing one — a crashed or skipped
# review can never leave the PR mergeable.
review_check_conclusion() {
  case "${1:-}" in
  approved | tech-debt) echo "success" ;;
  changes-requested) echo "failure" ;;
  *)
    echo "pr-state: review verdict '${1:-}' is not a decision — check stays pending (blocks merge)" >&2
    echo "pending"
    ;;
  esac
}
