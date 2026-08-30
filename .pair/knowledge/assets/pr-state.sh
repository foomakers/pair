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

# --- The solo-maintainer approval token (#398) --------------------------------
#
# THE ALTERNATIVE satisfaction path for D10, never a replacement for the one above.
# A repository with a single human account cannot produce a NON-AUTHOR approving
# review — the code host rejects an approval on your own pull request — so the 🔴
# rule was unsatisfiable there, not merely inconvenient. The token is what a solo
# maintainer applies instead: a comment carrying the command AND the head SHA.
#
# What it guarantees, in the words the design settled on: **explicit human
# confirmation, not independent review**. There is no second pair of eyes on a
# single-account repository and this text never pretends otherwise. What it does
# provide is exactly three properties:
#   1. deliberateness — merging a 🔴 change takes a distinct, explicit act,
#   2. an audit trail — who approved, when, on which head SHA,
#   3. invalidation on change — a force-push moves the head and voids the token,
#      exactly like a review-based approval.
# Forgery-resistance is NOT among them while the agent runs on the maintainer's own
# credentials: host-side the agent and the human ARE the same actor, so no
# server-side check can separate them. That becomes achievable only with a dedicated
# agent identity (#218). Recorded in ADR-018 rather than assumed away.
#
# The consumer evaluates the review path FIRST and only falls back to this one.

# human_token_approval_select — the ONE predicate both projections below are built
# from, so the count the gate acts on and the audit line it publishes cannot drift.
#
#   Input : a REST `GET /repos/{owner}/{repo}/issues/{n}/comments` payload (an array),
#           read FRESH from the API — an edited/deleted comment must stop counting,
#           and a webhook payload is a snapshot. Read ALL pages (`--paginate`).
#   Env   : HEAD_SHA (the only commit branch protection evaluates).
#
# Every field it decides on is asserted by the HOST, never by the applier:
#   `.user.type`               — "User" excludes Bot and Organization accounts,
#   `.performed_via_github_app`— non-null when an App posted it on a user's behalf,
#                                so an app-attributed comment is rejected too,
#   `.author_association`      — anyone with READ access can comment on a public
#                                repository, so write-level association is the
#                                authorization, not the mere ability to type,
#   `.user.login`/`.created_at`— the audit trail.
# The BODY is read for the command and the head SHA only — never for an actor: a
# comment claiming to be someone else changes nothing.
#
# The `(env.HEAD_SHA|length)==40` guard is load-bearing: with an unset HEAD_SHA the
# match would degrade into "any /approve", i.e. an unbound token. Fail-safe: nothing.
human_token_approval_select() {
  printf '%s' '.[] | select((env.HEAD_SHA|length)==40 and .user.type=="User" and (.performed_via_github_app|not) and (.author_association|IN("OWNER","MEMBER","COLLABORATOR")) and ((.body // "") | test("(^|\\s)/approve[ \\t]+" + env.HEAD_SHA + "(\\s|$)")))'
}

# human_token_approval_jq_filter — one line per qualifying comment id; count them
# (`| grep -c .`), exactly like the review filter above.
human_token_approval_jq_filter() {
  printf '%s%s' "$(human_token_approval_select)" ' | .id'
}

# human_token_approval_actor_jq_filter — the audit line for the published status
# description: WHO confirmed, on WHICH head, WHEN — all three host-asserted.
human_token_approval_actor_jq_filter() {
  printf '%s%s' "$(human_token_approval_select)" ' | "\(.user.login) approved head \(env.HEAD_SHA) at \(.created_at)"'
}

# solo_approval_token_body <head-sha> — the exact comment body a maintainer posts.
# Generated from one text so the docs, the tests and the adopter cannot drift.
solo_approval_token_body() {
  printf '/approve %s' "${1:-}"
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
