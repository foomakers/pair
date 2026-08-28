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
#   review            : approved | changes-requested | pending | missing | error
#                       (anything unrecognized, including the retired `tech-debt` token, is
#                       treated as no decision yet, fail-safe)
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
  approved) ;;
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

# light_auto_approve_allowed <pr_labels> <light_declared> <tier> <state>
#   pr_labels      : the pull request's label list, space- or comma-separated (TAGS ONLY)
#   light_declared : 1 when the project's adoption declares the `light` family in
#                    `## Tag Projection` (tech/risk-matrix.md); anything else ⇒ not declared
#   tier           : green | yellow | red | <anything else ⇒ red (fail-safe)>
#   state          : the synthesis `resolve_pr_state` already produced
#
# Exit 0 = the dedicated review identity may submit a native approving review, so the
# pull request satisfies the host's required-approvals rule with no human action.
# Exit 1 = no-op, with the unmet condition on stderr. Never a silent yes.
#
# A SIBLING, NOT A CHANGE: `resolve_pr_state` above is not modified and not consulted
# for anything but its already-computed output. This row does not decide the PR state;
# it decides only whether the identity signs the approving review the host asks for.
#
# ZERO CRITERIA (D18). "Light" is not computed here and is not computable here: this
# reads a TAG the classification produced upstream, a DECLARATION the project made in
# its adoption, the tier, and the synthesis. It never inspects the change.
#
# ADOPTION IS THE GATE, NOT THE LABEL. All four conditions must hold, and the
# declaration is deliberately one of them: a hand-applied `light` label on a repository
# whose adoption declares no `light` projection triggers nothing at all. That is the
# containment for the obvious abuse — mis-tagging a pull request to auto-approve it.
#
# BELOW RED ONLY. `explicit_approval_required` is the same per-tier row the synthesis
# reads, so an untagged or malformed tier fails this row exactly as it fails the rest of
# the flow: most restrictive wins, and light never bypasses the 🔴 human-approval rule
# (ADR-018, amendment 2026-08-28 — the identity's approval is excluded from
# `human_approval_jq_filter` by construction).
light_auto_approve_allowed() {
  local labels="${1:-}" declared="${2:-0}" tier="${3:-}" state="${4:-}"

  if [ "$declared" != "1" ]; then
    echo "pr-state: adoption declares no 'light' family in ## Tag Projection — no auto-approval (the label alone is inert)" >&2
    return 1
  fi

  # Whole-label match: `lightweight` is not `light`. Commas are normalised to spaces
  # because hosts render a label list either way.
  case " ${labels//,/ } " in
  *" light "*) ;;
  *)
    echo "pr-state: the pull request does not carry the 'light' tag — no auto-approval" >&2
    return 1
    ;;
  esac

  if explicit_approval_required "$tier"; then
    echo "pr-state: tier '${tier:-unknown}' requires an explicit human approval — light applies below red only, and never bypasses that rule" >&2
    return 1
  fi

  if [ "$state" != "ready-to-merge" ]; then
    echo "pr-state: state is '${state:-unknown}', not merge-enabling — no auto-approval (this row never overrides the synthesis)" >&2
    return 1
  fi

  return 0
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

# human_approval_jq_filter — echoes the ONE jq predicate that decides whether an
# explicit human approval (D10) exists on the CURRENT head commit. It ships here,
# next to the synthesis it feeds, instead of being written inline in each code host's
# workflow: the host job and its tests then read the SAME text, so the authorization
# predicate cannot drift between the recipe and what is verified ("one executable
# projection", as for tier-resolve.sh).
#
#   Input  : a REST `GET /repos/{owner}/{repo}/pulls/{n}/reviews` payload (an array).
#   Env    : HEAD_SHA (the only commit branch protection evaluates), PR_AUTHOR (login).
#   Output : one line per qualifying review id — count them; and always read ALL pages
#            (`--paginate`), since an approval can sit past page 1.
#
# Rejects by construction: a non-APPROVED review, an approval on any other commit
# (i.e. stale after a force-push), a non-human account (`user.type != "User"` — bots
# and GitHub Apps, so the pair review itself can never satisfy the gate), and the PR
# author's own approval.
human_approval_jq_filter() {
  printf '%s' '.[] | select(.state=="APPROVED" and .commit_id==env.HEAD_SHA and .user.type=="User" and .user.login!=env.PR_AUTHOR) | .id'
}

# review_check_conclusion <verdict> — maps a review verdict onto the conclusion the
# REQUIRED `pair-review` check must carry on the code host (R5.7):
#   approved               ⇒ success
#   changes-requested      ⇒ failure
#   anything else (pending, missing, crashed, timed out, unknown) ⇒ pending
# A pending check blocks the merge exactly like a failing one — a crashed or skipped
# review can never leave the PR mergeable.
review_check_conclusion() {
  case "${1:-}" in
  approved) echo "success" ;;
  changes-requested) echo "failure" ;;
  *)
    echo "pr-state: review verdict '${1:-}' is not a decision — check stays pending (blocks merge)" >&2
    echo "pending"
    ;;
  esac
}
