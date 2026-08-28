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
#              is NOT an error: host writes execute with the session token, `pair-review`
#              is a commit status, and the verdict is the NATIVE event unless the acting
#              account authored the pull request — the self-review case, where the host
#              rejects it and the verdict degrades to `--comment`.
#   halt     — an identity IS configured but is not usable (invalid credential, missing
#              permission, unknown health). The flow STOPS with a setup pointer. It
#              never falls back to the session user: a review silently attributed to
#              whoever's token happened to be loaded is worse than a stopped review.
#
# WHAT ADOPTING AN IDENTITY DOES *NOT* CHANGE (ADR-018, amendment 2026-08-28):
# the 🔴 explicit-human-approval rule. An identity approval must never satisfy
# `pair-explicit-approval` — and that exclusion is MECHANICAL, by two different
# mechanisms, because the two identity forms are two different account kinds on the
# host and only ONE of them is covered by the account-type clause:
#   app       — a GitHub App installation types as `user.type == "Bot"` on the reviews
#               API, so `human_approval_jq_filter`'s `user.type == "User"` clause
#               already rejects it. Nothing further is required.
#   bot-user  — a machine USER account types as `"User"`. The type clause does NOT
#               reject it, and a bot-user approval would otherwise satisfy the 🔴 gate.
#               The exclusion is the login clause `.user.login != env.REVIEW_IDENTITY_LOGIN`
#               in `human_approval_jq_filter` (pr-state.sh), which is INERT until the
#               identity's login is provisioned to the job evaluating the predicate.
#               A bot-user identity whose login is not provisioned is therefore NOT
#               healthy: see `review_identity_exclusion_ok` below, whose result is an
#               input to the `healthy` flag `resolve_identity_mode` reads, so a
#               misconfigured bot user resolves to `halt` instead of running unguarded.
# With that in place a `risk:red` pull request still needs a second HUMAN account. See:
#   .pair/knowledge/guidelines/collaboration/project-management-tool/pr-states.md
#   .pair/knowledge/guidelines/collaboration/project-management-tool/github-implementation.md
#     § "Dedicated review identity"  (per-host setup: GitHub App vs bot user — R2.12)
#
# Usage (in /pair-process-review, /pair-capability-publish-pr, or a code host's automation):
#   source review-identity.sh
#   review_identity_exclusion_ok "$IDENTITY_KIND" "$REVIEW_IDENTITY_LOGIN" || IDENTITY_HEALTHY=0
#   MODE="$(resolve_identity_mode "$IDENTITY_CONFIGURED" "$IDENTITY_HEALTHY")"
#   [ "$MODE" = halt ] && exit 1
#   # APPROVE only when the light row authorized it (pr-state.sh light_auto_approve_allowed):
#   light_auto_approve_allowed "$PR_LABELS" "$LIGHT_DECLARED" "$TIER" "$STATE" && APPROVE_OK=1
#   # SELF_AUTHORED is `session`-mode only: 0 when the acting account provably did NOT
#   # author the pull request, 1 when it did, unset when the read failed (⇒ COMMENT).
#   EVENT="$(identity_verdict_event "$MODE" "$VERDICT" "${APPROVE_OK:-0}" "${SELF_AUTHORED:-}")"
#   PUB="$(pair_review_publication_mode "$MODE" "$IDENTITY_KIND")"          # checks-api | commit-status

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

# review_identity_exclusion_ok <identity_kind> <review_identity_login>
#   identity_kind        : app | user | bot-user | <anything else ⇒ unknown, fail-safe>
#                          `bot-user` is the ADOPTION literal (`Review identity: bot-user`
#                          in way-of-working) and `user` its short form: the skills forward
#                          the literal they read, so BOTH must resolve to the machine-user
#                          arm. A spelling this function does not accept would make a
#                          correctly provisioned bot user a NOT-healthy identity and HALT
#                          every review on that repository.
#   review_identity_login: the identity's account login, as provisioned to the job that
#                          evaluates `human_approval_jq_filter` (on GitHub: the repository
#                          variable `REVIEW_IDENTITY_LOGIN`, read into the environment of
#                          the `pair-explicit-approval` job)
#
# Exit 0 = the identity is MECHANICALLY excluded from the 🔴 explicit-human-approval
# predicate. Exit 1 = it is NOT, with the missing piece on stderr; the caller must then
# treat the identity as NOT healthy, so `resolve_identity_mode` yields `halt`.
#
# WHY THIS EXISTS. The exclusion is not one rule but two, because the account kinds are
# different on the host: an App installation is `user.type == "Bot"` and the predicate's
# type clause rejects it outright; a bot USER account is `user.type == "User"` and the
# type clause does not. For the bot-user form the exclusion is the login clause, and a
# login clause with nothing to compare against excludes nothing — an unprovisioned
# `REVIEW_IDENTITY_LOGIN` would leave a machine account able to sign the 🔴 human
# approval. This function is what makes "the identity is excluded by construction" a
# checked precondition rather than a claim in prose.
review_identity_exclusion_ok() {
  local kind="${1:-}" login="${2:-}"

  case "$kind" in
  app)
    # `user.type == "Bot"` — the shipped type clause already rejects it.
    return 0
    ;;
  user | bot-user)
    # Both spellings of the machine-USER form: `bot-user` is what adoption declares and
    # what the skills forward verbatim; `user` is the short form the adapter's own docs use.
    if [ -n "$login" ]; then
      return 0
    fi
    echo "review-identity: a bot-USER identity types as user.type == \"User\" on the reviews API, so the 🔴 predicate's type clause does NOT exclude it. Its login must be provisioned as REVIEW_IDENTITY_LOGIN to the job evaluating human_approval_jq_filter, or the identity could sign the explicit human approval itself. Treat this identity as NOT healthy until it is set — see the code host's implementation guide, section 'Dedicated review identity'." >&2
    return 1
    ;;
  *)
    echo "review-identity: identity kind '${kind:-unknown}' is unknown — cannot establish that it is excluded from the 🔴 human-approval predicate (fail-safe: not excluded)" >&2
    return 1
    ;;
  esac
}

# identity_verdict_event <mode> <verdict> <approve_authorized> <self_authored>
#   mode               : identity | session (a `halt` never reaches here — the caller stops first)
#   verdict            : approved | changes-requested | <anything else ⇒ no decision>
#   approve_authorized : 1 when the adoption-gated light row (`light_auto_approve_allowed`
#                        in pr-state.sh) authorized an APPROVING review on this pull
#                        request; anything else — including empty and absent — is NOT
#                        authorized (fail-safe). Read in `identity` mode ONLY: it governs
#                        the review the IDENTITY would sign on the project's behalf.
#   self_authored      : `session` mode only — 0 when the acting session account is
#                        provably NOT the pull request's author, 1 when it is, and
#                        anything else (empty, absent, unknown) is treated as SELF-authored
#                        (fail-safe ⇒ COMMENT, the form the host always accepts)
#
# Echoes the native review event to submit on the code host:
#   APPROVE | REQUEST_CHANGES | COMMENT
#
# WHY AN APPROVING VERDICT IS NOT AUTOMATICALLY AN `APPROVE` EVENT. On a repository whose
# branch protection sets `required_approving_review_count >= 1`, a native APPROVE by the
# identity IS what satisfies the host's approvals rule — it makes the pull request
# mergeable with no human action. That outcome is exactly what the adoption-gated light
# row governs, so it is that row, and only that row, that authorizes the APPROVE event.
# An approving verdict outside it is recorded as a COMMENT-form review with the verdict
# token leading the body: the judgment is published in full, it simply does not sign the
# host's approval on the project's behalf. `REQUEST_CHANGES` needs no such gate — it
# blocks, it never unlocks.
#
# WHY `session` MODE IS NOT UNIFORMLY A COMMENT. The COMMENT form there is the workaround
# for exactly ONE host rule: a code host rejects an APPROVE / REQUEST_CHANGES on a pull
# request you authored yourself. That is the SELF-REVIEW case (the solo maintainer, the
# agent reviewing the PR its own account opened) and nothing else. On a two-person team
# with no identity configured — the shipped default — the reviewer is NOT the author, the
# host accepts the native event, and collapsing it to a COMMENT would silently drop a real
# change request (nothing blocks the merge button, no blocking reviewer is recorded) and a
# real approval (nothing the host counts toward `required_approving_review_count`). So the
# session path returns the NATIVE event whenever self-authorship is provably false, and
# COMMENT whenever it is true or unknown.
identity_verdict_event() {
  local mode="${1:-}" verdict="${2:-}" approve_authorized="${3:-0}" self_authored="${4:-}"

  case "$mode" in
  identity)
    case "$verdict" in
    approved)
      if [ "$approve_authorized" = "1" ]; then
        echo "APPROVE"
      else
        echo "review-identity: the verdict is APPROVED but no adoption-gated light row authorized an approving review — submitting as COMMENT, so the identity never satisfies the host's required-approvals rule on the project's behalf" >&2
        echo "COMMENT"
      fi
      ;;
    changes-requested) echo "REQUEST_CHANGES" ;;
    *)
      echo "review-identity: verdict '${verdict:-unknown}' is not a decision — submitting as COMMENT, never as an approval (fail-safe)" >&2
      echo "COMMENT"
      ;;
    esac
    ;;
  session)
    if [ "$self_authored" != "0" ]; then
      echo "review-identity: the acting session account authored this pull request (self_authored='${self_authored:-unset}'; unknown is treated as self-authored, fail-safe) — the host rejects a self-authored APPROVE/REQUEST_CHANGES, so the verdict is submitted as COMMENT with its token leading the body" >&2
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
    ;;
  *)
    echo "review-identity: mode '${mode:-unknown}' is not a resolved actor — submitting as COMMENT, never a native verdict (fail-safe)" >&2
    echo "COMMENT"
    ;;
  esac
}

# pair_review_publication_mode <mode> <identity_kind>
#   identity_kind : app | user | bot-user | <anything else ⇒ treated as not an App>
#                   same vocabulary as `review_identity_exclusion_ok`: `bot-user` is the
#                   adoption literal, `user` its short form, and both are machine-user
#                   forms that the Checks API rejects.
#
# Echoes: checks-api | commit-status.
#
# The Checks API is writable ONLY by a GitHub App installation token; an ordinary
# user token or PAT gets `403`. So the check-run form is available exactly when an
# App identity is resolved, and every other combination — a bot user under either
# spelling, an identity of unknown kind, no identity at all — keeps the commit status
# the flow already ships. Only `app` is matched positively, so a new or misspelled kind
# degrades to the commit status rather than attempting a write it cannot perform.
pair_review_publication_mode() {
  if [ "${1:-}" = "identity" ] && [ "${2:-}" = "app" ]; then
    echo "checks-api"
    return 0
  fi
  echo "commit-status"
}

# identity_audit_comment <action> <tag> <declared> <tier> <state>
#   action   : approve | comment | block  (every identity action is audited — the
#              approving review the light row authorized, the COMMENT-form approving
#              verdict it did not, and the block)
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

  printf 'pair review identity — %s. Tag: %s (%s) · tier: %s · PR state: %s. Inputs are tags, gate results and the review verdict only; nothing here classifies the change (D18). An identity approval never satisfies the explicit human approval required at risk:red: an App identity is rejected by human_approval_jq_filter user.type == "User" clause, a bot-USER identity (which does type as "User") by its login clause against REVIEW_IDENTITY_LOGIN.\n' \
    "${action:-unknown}" "${tag:-none}" "$declaration" "${tier:-unknown}" "${state:-unknown}"
}
