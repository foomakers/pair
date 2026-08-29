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
#   pr_labels      : the pull request's label NAMES (TAGS ONLY). PREFER one name per LINE
#                    (on GitHub: `gh pr view <n> --json labels -q '.labels[].name'`) or
#                    comma-separated: both delimit whole names, so a label whose NAME
#                    contains a space (`good first issue`) stays one label. The
#                    space-joined shape (`-q '[.labels[].name]|join(" ")'`) is accepted as
#                    a LEGACY input and is AMBIGUOUS by construction — see the match below.
#   light_declared : 1 when the project's adoption declares the `light` family in
#                    `## Tag Projection` (tech/risk-matrix.md); anything else ⇒ not declared
#   tier           : green | yellow | red | <anything else ⇒ red (fail-safe)>
#   state          : the synthesis `resolve_pr_state` already produced
#
# Exit 0 = the dedicated review identity may submit a native approving review, so the
# pull request satisfies the host's required-approvals rule with no human action.
# Exit 1 = no-op, with the unmet condition on stderr. Never a silent yes.
#
# THIS ROW IS THE ONLY AUTHORITY FOR AN `APPROVE` EVENT THE IDENTITY SIGNS. It is the
# third argument of `identity_verdict_event` (review-identity.sh): in `identity` mode,
# outside this row an approving verdict is published as a COMMENT-form review, never as a
# native APPROVE. (In `session` mode no identity acts and the argument is not read: the
# account whose token is loaded signs its own review, as it did before this row existed.) That is what makes the
# gate below load-bearing rather than decorative — without it every approving verdict
# would satisfy a host `required_approving_review_count >= 1` on its own.
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
# `human_approval_jq_filter` mechanically: by the type clause for an App, by the
# `REVIEW_IDENTITY_LOGIN` clause for a bot user).
light_auto_approve_allowed() {
  local labels="${1:-}" declared="${2:-0}" tier="${3:-}" state="${4:-}"

  if [ "$declared" != "1" ]; then
    echo "pr-state: adoption declares no 'light' family in ## Tag Projection — no auto-approval (the label alone is inert)" >&2
    return 1
  fi

  # WHOLE-LABEL match: `lightweight` is not `light`. What "whole" can mean depends on the
  # SHAPE of the read, and each shape carries ITS OWN delimiter — never another shape's:
  #   one name per LINE (`-q '.labels[].name'`) — EXACT for every label name, because a
  #   code-host name cannot contain a newline. Split on newlines ALONE: a name may legally
  #   contain a COMMA (`theme, light`), and translating commas here would cut one whole
  #   name into two fields and match the tag against a fragment nobody applied.
  #   COMMA-separated — a field is a whole label name, spaces included, so `ui: light theme`
  #   is one label and never the tag. Exact only for names FREE OF COMMAS: once the host
  #   joined the names with commas, a name containing one is indistinguishable from two
  #   labels, the same way the space-joined shape below loses names containing spaces.
  #   NO DELIMITER AT ALL — the shape a ONE-label line read produces (`ui: light theme`),
  #   and the shape the LEGACY space-joined read (`-q '[.labels[].name] | join(" ")'`)
  #   produces for every PR. It is matched as ONE whole trimmed field, and therefore FAILS
  #   CLOSED: `light` alone still matches, `ui: light theme` is a no-op, and the joined
  #   `risk:green light` is a no-op too. That last one is the deliberate cost: a code-host
  #   label NAME may itself contain spaces (`good first issue`, `help wanted`), so the
  #   joined shape is irrecoverably AMBIGUOUS — nothing in it distinguishes the `light` TAG
  #   from a label merely containing the word — and an ambiguous input must never authorize
  #   an APPROVE. Pass the line form, which is exact; the joined form is accepted only in
  #   the degenerate single-label case where it IS the line form.
  local matched=0 line fields=""
  case "$labels" in
  *$'\n'*) fields="$labels" ;;
  *,*) fields="${labels//,/$'\n'}" ;;
  *) fields="$labels" ;;
  esac
  while IFS= read -r line; do
    line="${line#"${line%%[![:space:]]*}"}" # trim leading blanks
    line="${line%"${line##*[![:space:]]}"}" # trim trailing blanks
    [ "$line" = light ] && matched=1
  done <<<"$fields"
  if [ "$matched" != 1 ]; then
    echo "pr-state: the pull request does not carry the 'light' tag — no auto-approval" >&2
    return 1
  fi

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
#   Env    : HEAD_SHA (the only commit branch protection evaluates), PR_AUTHOR (login),
#            REVIEW_IDENTITY_LOGIN (the dedicated review identity's account login, when
#            one is configured — see below; unset ⇒ the clause is inert, which is correct
#            only for a project running no identity or an App one).
#   Output : one line per qualifying review id — count them; and always read ALL pages
#            (`--paginate`), since an approval can sit past page 1.
#
# Rejects by construction: a non-APPROVED review, an approval on any other commit
# (i.e. stale after a force-push), a non-human account (`user.type != "User"` — bots
# and GitHub Apps), the PR author's own approval, and the DEDICATED REVIEW IDENTITY's
# own account by login.
#
# WHY THE LOGIN CLAUSE IS NOT REDUNDANT WITH THE TYPE CLAUSE. A GitHub **App**
# installation types as `"Bot"`, so the type clause alone excludes it. A **bot user** —
# an ordinary machine account, the `Review identity: bot-user` form — types as `"User"`
# on this API: the type clause does NOT exclude it, and without the login clause a
# machine account could sign the 🔴 explicit HUMAN approval. The clause is the mechanical
# exclusion for that form; `review_identity_exclusion_ok` (review-identity.sh) makes an
# unprovisioned `REVIEW_IDENTITY_LOGIN` a not-healthy identity, so the flow HALTs rather
# than running with the clause inert. See github-implementation.md § "Dedicated review
# identity" for how the variable reaches the `pair-explicit-approval` job.
human_approval_jq_filter() {
  printf '%s' '.[] | select(.state=="APPROVED" and .commit_id==env.HEAD_SHA and .user.type=="User" and .user.login!=env.PR_AUTHOR and .user.login!=env.REVIEW_IDENTITY_LOGIN) | .id'
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
