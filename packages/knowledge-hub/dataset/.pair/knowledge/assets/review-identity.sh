#!/usr/bin/env bash
# review-identity.sh — provider-agnostic adapter for the DEDICATED REVIEW IDENTITY.
#
# WHAT THIS ANSWERS: *which credential executes a code-host write* — the native
# review verdict, the `pair-review` publication, the audit comment. Nothing else.
# It resolves a mode from configuration signals and projects that mode onto the
# host action to take. It never reads the diff, the code, or the change itself:
# like its siblings `tier-resolve.sh` and `pr-state.sh` it carries NO classification
# criteria (D18), and unlike them it carries no state synthesis either — the PR
# state remains `resolve_pr_state`'s, untouched.
#
# WHY IT SHIPS AS AN ASSET rather than as prose in a skill: the same "one executable
# projection" rule the tier resolver and the 🔴 approval predicate already follow.
# The skills (`/pair-process-review` Steps 5.3–5.4, `/pair-capability-publish-pr` Phase 5), the code host's
# implementation guide and the tests all read THIS text, so the rule that decides who
# may approve a pull request cannot drift between a doc code block and a hand-copied
# twin in a test.
#
# THREE MODES, AND NO FOURTH:
#   identity — a dedicated review identity is configured and usable. Host writes
#              execute as it: the verdict becomes a NATIVE APPROVE / REQUEST_CHANGES
#              (the reviewer is not the author, so the host no longer rejects it), and
#              on a GitHub-App identity `pair-review` publishes through the Checks API.
#   session  — no identity is configured. This is TODAY'S SHIPPED BEHAVIOR in full and
#              is NOT an error: host writes execute with the session token, the verdict
#              degrades to `--comment`, `pair-review` is a commit status.
#   halt     — an identity IS configured but is not usable (invalid credential, missing
#              permission, unknown health). The flow STOPS with a setup pointer. It
#              never falls back to the session user: a review silently attributed to
#              whoever's token happened to be loaded is worse than a stopped review.
#
# WHAT ADOPTING AN IDENTITY DOES *NOT* CHANGE (ADR-018, amendment 2026-08-28):
# the 🔴 explicit-human-approval rule. `human_approval_jq_filter` (pr-state.sh)
# requires `user.type == "User"`, which is exactly what a bot user or a GitHub App is
# not — so an identity approval can never satisfy `pair-explicit-approval`, and a
# `risk:red` pull request still needs a second HUMAN account. See:
#   .pair/knowledge/guidelines/collaboration/project-management-tool/pr-states.md
#   .pair/knowledge/guidelines/collaboration/project-management-tool/github-implementation.md
#     § "Dedicated review identity"  (per-host setup: GitHub App vs bot user — R2.12)
#
# Usage (in /pair-process-review, /pair-capability-publish-pr, or a code host's automation):
#   source review-identity.sh
#   MODE="$(resolve_identity_mode "$IDENTITY_CONFIGURED" "$IDENTITY_HEALTHY")"
#   [ "$MODE" = halt ] && exit 1
#   EVENT="$(identity_verdict_event "$MODE" "$VERDICT")"          # APPROVE | REQUEST_CHANGES | COMMENT
#   PUB="$(pair_review_publication_mode "$MODE" "$IDENTITY_KIND")" # checks-api | commit-status

# resolve_identity_mode <configured> <healthy>
#   configured : 1 when the project's adoption declares a dedicated review identity
#                (`Review identity: app|bot-user` under way-of-working's Quality
#                Gates); anything else ⇒ not configured
#   healthy    : 1 when that identity's credential authenticated AND holds the
#                required host permissions; anything else — including empty and
#                unknown — is treated as NOT healthy (fail-safe)
#
# Echoes exactly one of: identity | session | halt. Always exits 0, so a caller can
# branch on the word instead of on an exit status it might swallow.
resolve_identity_mode() {
  local configured="${1:-0}" healthy="${2:-}"

  if [ "$configured" != "1" ]; then
    # The zero-configuration default, not a degradation: the flow behaves exactly as
    # it did before an identity existed as an option.
    echo "session"
    return 0
  fi

  if [ "$healthy" = "1" ]; then
    echo "identity"
    return 0
  fi

  echo "review-identity: a dedicated review identity IS configured but is not usable ('${healthy:-unknown}' health) — HALT. This never falls back to the session user: see the code host's implementation guide, section 'Dedicated review identity', for the required permissions and the credential setup." >&2
  echo "halt"
}

# identity_verdict_event <mode> <verdict>
#   mode    : identity | session (a `halt` never reaches here — the caller stops first)
#   verdict : approved | changes-requested | <anything else ⇒ no decision>
#
# Echoes the native review event to submit on the code host:
#   APPROVE | REQUEST_CHANGES | COMMENT
#
# In `session` mode the answer is always COMMENT — the reviewer IS the author there,
# and hosts reject a self-authored APPROVE/REQUEST_CHANGES; the verdict token still
# leads the review body, so nothing is lost. That degraded form stays documented and
# supported; the identity is what upgrades it, not what replaces it.
identity_verdict_event() {
  local mode="${1:-}" verdict="${2:-}"

  if [ "$mode" != "identity" ]; then
    echo "COMMENT"
    return 0
  fi

  case "$verdict" in
  approved) echo "APPROVE" ;;
  changes-requested) echo "REQUEST_CHANGES" ;;
  *)
    echo "review-identity: verdict '${verdict:-unknown}' is not a decision — submitting as COMMENT, never as an approval (fail-safe)" >&2
    echo "COMMENT"
    ;;
  esac
}

# pair_review_publication_mode <mode> <identity_kind>
#   identity_kind : app | user | <anything else ⇒ treated as not an App>
#
# Echoes: checks-api | commit-status.
#
# The Checks API is writable ONLY by a GitHub App installation token; an ordinary
# user token or PAT gets `403`. So the check-run form is available exactly when an
# App identity is resolved, and every other combination — a bot user, an identity of
# unknown kind, no identity at all — keeps the commit status the flow already ships.
pair_review_publication_mode() {
  if [ "${1:-}" = "identity" ] && [ "${2:-}" = "app" ]; then
    echo "checks-api"
    return 0
  fi
  echo "commit-status"
}

# identity_audit_comment <action> <tag> <declared> <tier> <state>
#   action   : approve | block  (every identity action is audited, both directions)
#   tag      : the tag that drove it (e.g. `light`), or empty when none did
#   declared : 1 when adoption declares that tag family in `## Tag Projection`
#   tier     : the tier read from the pull request's `risk:*` label
#   state    : the `resolve_pr_state` synthesis
#
# Echoes ONE deterministic audit line. It is a projection of the inputs, never a
# summary an agent writes from memory: the reason a pull request was approved or
# blocked by the identity has to be reconstructable from the comment alone, and it has
# to name the TAG and the DECLARATION rather than any judgment about the change.
identity_audit_comment() {
  local action="${1:-}" tag="${2:-}" declared="${3:-0}" tier="${4:-}" state="${5:-}"
  local declaration="not declared"
  [ "$declared" = "1" ] && declaration="declared in ## Tag Projection"

  printf 'pair review identity — %s. Tag: %s (%s) · tier: %s · PR state: %s. Inputs are tags, gate results and the review verdict only; nothing here classifies the change (D18). An identity approval never satisfies the explicit human approval required at risk:red — that predicate requires user.type == "User", which this identity is not.\n' \
    "${action:-unknown}" "${tag:-none}" "$declaration" "${tier:-unknown}" "${state:-unknown}"
}
