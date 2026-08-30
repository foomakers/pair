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
#               healthy: see `review_identity_exclusion_ok` below, which
#               `review_identity_health` folds into the `healthy` flag
#               `resolve_identity_mode` reads, so a misconfigured bot user resolves to
#               `halt` instead of running unguarded.
# With that in place a `risk:red` pull request still needs a second HUMAN account. See:
#   .pair/knowledge/guidelines/collaboration/project-management-tool/pr-states.md
#   .pair/knowledge/guidelines/collaboration/project-management-tool/github-implementation.md
#     § "Dedicated review identity"  (per-host setup: GitHub App vs bot user — R2.12)
#
# Usage (in /pair-process-review, /pair-capability-publish-pr, or a code host's automation):
#   source review-identity.sh
#   # The adoption value must be one of the vocabulary BEFORE it is trusted: a key that is
#   # present but does not parse is configured-but-unusable, never `none`. See below.
#   review_identity_kind_ok "$IDENTITY_KIND" || { echo "fix the Review identity key" >&2; exit 1; }
#   # HEALTH IS COMPUTED ON THIS RUN, from the host guide's per-run, artifact-free probes
#   # (AUTH_OK: the credential authenticated and is scoped to this repository; PERMS_OK:
#   # the required grants were observed). It is never a remembered setup result.
#   # $RV: the identity's login READ BACK FROM THE HOST on this run, from the same
#   # configuration store the job evaluating the 🔴 predicate resolves it from (on GitHub a
#   # repository variable — see the implementation guide). NEVER the caller's ambient
#   # environment: a login set only in the agent's shell satisfies this precondition while
#   # the gate's clause compares against the empty string and matches every account.
#   # $ACTING: the login the identity credential itself reports on this run. On a machine
#   # user it MUST equal $RV; the code-host implementation guide owns that host read.
#   IDENTITY_HEALTHY="$(review_identity_health "$IDENTITY_KIND" "$AUTH_OK" "$PERMS_OK" "$RV" "$ACTING")"
#   MODE="$(resolve_identity_mode "$IDENTITY_CONFIGURED" "$IDENTITY_HEALTHY")"
#   [ "$MODE" = halt ] && exit 1
#   # APPROVE only when the light row authorized it (pr-state.sh light_auto_approve_allowed):
#   light_auto_approve_allowed "$PR_LABELS" "$LIGHT_DECLARED" "$TIER" "$STATE" && APPROVE_OK=1
#   # SELF_AUTHORED: 0 when the acting account provably did NOT author the pull request,
#   # 1 when it did. The DEFAULT differs by mode (see identity_verdict_event): unknown is
#   # self-authored in `session`, not-self-authored in `identity`.
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

# review_identity_kind_ok <identity_kind>
#   identity_kind : the value read out of adoption's `Review identity` key
#
# Exit 0 = the value is one this adapter understands: `app`, `bot-user` (the adoption
# literal) or its short form `user`, or `none` (no identity configured). Exit 1 = it is
# not, with the vocabulary on stderr.
#
# WHY THE READ IS TWO QUESTIONS, NOT ONE. A caller extracts the value with a host-side
# expression over a markdown adoption file, and any such expression can FAIL TO MATCH a
# key an adopter did write in a slightly different shape (`**Review identity**: bot-user`
# with no bullet, `- Review identity: app` with no bold). Treating that empty result as
# `none` is not a harmless default: `none` means NO IDENTITY IS CONFIGURED, so
# `resolve_identity_mode` returns `session` and the review is written — and, where the
# host allows it, APPROVED — with the SESSION token, on a repository that provisioned a
# dedicated identity precisely so that would not happen. That is the session-user
# fallback the HALT rule forbids, reached without any HALT because the flow never learns
# an identity was configured. So the caller detects the key's PRESENCE format-agnostically,
# extracts the value, and then asks THIS function whether the value parsed: present but
# unparseable ⇒ configured-but-unusable ⇒ HALT with the setup pointer; genuinely absent
# ⇒ `none`. The vocabulary lives here, once, so a host guide's snippet cannot drift from
# what `review_identity_exclusion_ok` and `pair_review_publication_mode` accept.
review_identity_kind_ok() {
  case "${1:-}" in
  app | user | bot-user | none)
    return 0
    ;;
  *)
    echo "review-identity: '${1:-empty}' is not a Review identity value — expected one of: app | bot-user (or its short form user) | none. If the key IS present in adoption, this is a configured-but-unusable identity: HALT and fix the key, never treat it as 'none' (which means no identity and writes the review with the session token)." >&2
    return 1
    ;;
  esac
}

# review_identity_exclusion_ok <identity_kind> <review_identity_login> <acting_login>
#   identity_kind        : app | user | bot-user | <anything else ⇒ unknown, fail-safe>
#                          `bot-user` is the ADOPTION literal (`Review identity: bot-user`
#                          in way-of-working) and `user` its short form: the skills forward
#                          the literal they read, so BOTH must resolve to the machine-user
#                          arm. A spelling this function does not accept would make a
#                          correctly provisioned bot user a NOT-healthy identity and HALT
#                          every review on that repository.
#   review_identity_login: the identity's account login AS THE JOB THAT EVALUATES
#                          `human_approval_jq_filter` WILL SEE IT — on GitHub the repository
#                          variable `REVIEW_IDENTITY_LOGIN`, which the
#                          `pair-explicit-approval` job reads as
#                          `${{ vars.REVIEW_IDENTITY_LOGIN }}`. The caller must READ IT BACK
#                          from the host on this run, never pass its own ambient environment
#                          variable of the same name: an operator who exports the login but
#                          never sets the repository variable would satisfy the precondition
#                          here while the gate's clause compares against the empty string —
#                          `.user.login != ""` is true for every account, so the bot's own
#                          approval would satisfy the 🔴 HUMAN gate. Passing what the gate
#                          cannot see is exactly the state this check exists to refuse.
#   acting_login         : the login the identity's own credential reports on this run.
#                          The code-host implementation guide owns the host-specific read.
#                          Read on the machine-user arm only. A non-empty login that is not
#                          this one excludes a DIFFERENT account: the predicate would drop
#                          `acme-bot` while `acme-bot-2` — the rotated account, or a typo in
#                          the variable — signs the 🔴 approval as a `"User"` and the PR
#                          reaches `ready-to-merge` with zero humans. Empty is UNKNOWN, and
#                          unknown is never excluded: a caller that cannot name the acting
#                          account cannot establish the match, so the identity is not healthy.
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
# approval. Provisioned but naming ANOTHER account is the same hole one step along, so
# BOTH halves are checked here rather than left to each host's own snippet: the check is
# the host-agnostic contract a second adapter is wired from, and a host that implements
# only the non-empty half excludes a login nobody is acting under. This function is what
# makes "the identity is excluded by construction" a checked precondition rather than a
# claim in prose.
review_identity_exclusion_ok() {
  local kind="${1:-}" login="${2:-}" acting="${3:-}"

  case "$kind" in
  app)
    # `user.type == "Bot"` — the shipped type clause already rejects it.
    return 0
    ;;
  user | bot-user)
    # Both spellings of the machine-USER form: `bot-user` is what adoption declares and
    # what the skills forward verbatim; `user` is the short form the adapter's own docs use.
    if [ -z "$login" ]; then
      echo "review-identity: a bot-USER identity types as user.type == \"User\" on the reviews API, so the 🔴 predicate's type clause does NOT exclude it. Its login must be provisioned as REVIEW_IDENTITY_LOGIN to the job evaluating human_approval_jq_filter, or the identity could sign the explicit human approval itself. Treat this identity as NOT healthy until it is set — see the code host's implementation guide, section 'Dedicated review identity'." >&2
      return 1
    fi
    if [ -z "$acting" ]; then
      echo "review-identity: the ACTING account was not passed, so the provisioned login ('$login') cannot be shown to be the one acting — unknown is never excluded. Read the acting login under the identity's own credential on this run and pass it as the third argument. See the code host's implementation guide, section 'Dedicated review identity'." >&2
      return 1
    fi
    if [ "$login" != "$acting" ]; then
      echo "review-identity: REVIEW_IDENTITY_LOGIN names '$login' but the acting account is '$acting' — the 🔴 predicate excludes THAT login, so an approving review by '$acting' still satisfies the explicit HUMAN approval. Fix the variable, or run the identity under the account it names. See the code host's implementation guide, section 'Dedicated review identity'." >&2
      return 1
    fi
    return 0
    ;;
  *)
    echo "review-identity: identity kind '${kind:-unknown}' is unknown — cannot establish that it is excluded from the 🔴 human-approval predicate (fail-safe: not excluded)" >&2
    return 1
    ;;
  esac
}

# review_identity_health <identity_kind> <auth_ok> <perms_ok> <review_identity_login> <acting_login>
#   auth_ok  : 1 when THIS RUN's credential probe answered 2xx — the token authenticated
#              AND the identity is scoped to this repository. Anything else (empty, a
#              probe that was not run, a malformed value) is NOT authenticated.
#   perms_ok : 1 when THIS RUN observed the required grants — the host guide's per-run,
#              ARTIFACT-FREE probes (for an App: the installation-token exchange requested
#              with explicit `permissions`, which 422s when the installation lacks one;
#              for a bot user: the account's repository permission read). Anything else is
#              NOT granted.
#   The last two arguments are the exclusion precondition's, forwarded verbatim: the
#   provisioned login read back from the host, and the login of the account ACTING on this
#   run. On the machine-user form they must MATCH — see `review_identity_exclusion_ok`.
#
# Echoes exactly `1` or `0` — the `healthy` argument of `resolve_identity_mode`, so an
# unhealthy identity becomes `halt` and never a session fallback. Always exits 0.
#
# WHY THIS EXISTS. `healthy` is the single signal that separates `identity` from `halt`,
# i.e. the security-critical decision point of the whole flow, and it had NO defined
# runtime source: the host guide's publication snippet carried an inert
# `PROBES_PASSED=0  # set to 1 by whatever ran step 5's probes` that nothing ever set. Two
# ways to read that, both broken on a CORRECTLY provisioned repository: follow the guide
# literally (its probes are explicitly setup-time — they leave an undeletable check run on
# the head commit) and `healthy` is 0 forever, so every review and every publish HALTs
# with a setup pointer to a setup that is already right; or re-run the setup probes per
# review and every reviewed head permanently carries a neutral `pair-identity-probe` check
# run plus a posted/deleted scratch comment. So the health question is split in two:
#   PER RUN (here)  — cheap, artifact-free: does the credential authenticate, is it scoped
#                     to this repository, are the grants observable without writing?
#   AT SETUP (once) — the probes that must WRITE to prove a write grant (a check run, a
#                     scratch comment). They leave artifacts; the guide says run them once.
# What a read probe cannot prove at run time is covered by the third rule, stated in both
# skills and the host guide: a 403/422 met MID-WRITE is a HALT — report it against the
# artifact that failed, never continue with the session token and never leave `pair-review`
# published as if a review had been written.
#
# The exclusion precondition is folded in deliberately: it is part of "may this identity
# act at all", so no caller can compute health while forgetting it.
review_identity_health() {
  local kind="${1:-}" auth_ok="${2:-}" perms_ok="${3:-}" login="${4:-}" acting="${5:-}"

  if [ "$auth_ok" != "1" ]; then
    echo "review-identity: the identity's credential did not authenticate on this run (auth probe='${auth_ok:-not run}') — NOT healthy. Unknown is never healthy: see the code host's implementation guide, section 'Dedicated review identity', for the per-run probes." >&2
    echo "0"
    return 0
  fi

  if [ "$perms_ok" != "1" ]; then
    echo "review-identity: the identity's required permissions were not observed on this run (permission probe='${perms_ok:-not run}') — NOT healthy. A missing grant discovered later lands mid-flow, after pair-review was already published." >&2
    echo "0"
    return 0
  fi

  if ! review_identity_exclusion_ok "$kind" "$login" "$acting"; then
    echo "0"
    return 0
  fi

  echo "1"
}

# identity_verdict_event <mode> <verdict> <approve_authorized> <self_authored>
#   mode               : identity | session (a `halt` never reaches here — the caller stops first)
#   verdict            : approved | changes-requested | <anything else ⇒ no decision>
#   approve_authorized : 1 when the adoption-gated light row (`light_auto_approve_allowed`
#                        in pr-state.sh) authorized an APPROVING review on this pull
#                        request; anything else — including empty and absent — is NOT
#                        authorized (fail-safe). Read in `identity` mode ONLY: it governs
#                        the review the IDENTITY would sign on the project's behalf.
#   self_authored      : 0 when the acting account is provably NOT the pull request's
#                        author, 1 when it is. Read in BOTH modes, with per-mode DEFAULTS
#                        that are deliberately asymmetric:
#                          session  — unknown ⇒ SELF-authored (the acting account is
#                                     routinely the author: the solo maintainer, the agent
#                                     reviewing the PR its own account opened) ⇒ COMMENT.
#                          identity — unknown ⇒ NOT self-authored. Setup forbids using a
#                                     PR-AUTHORING account as the review identity (host
#                                     guide), so the common case is a distinct account;
#                                     defaulting to self-authored here would collapse
#                                     every identity verdict to COMMENT and delete the
#                                     feature. The wrong guess is loud, not silent — the
#                                     host answers 422 and the caller HALTs on the failed
#                                     write (it never publishes `pair-review` as though a
#                                     review had landed).
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
#
# WHY `identity` MODE READS AUTHORSHIP TOO. The same host rule applies to the identity: if
# the review identity IS the account that opened the pull request — an unattended loop that
# implements and publishes as `acme-bot` and then provisions `acme-bot` as its
# `Review identity: bot-user` — the host rejects the native event
# (`422 Can not request changes on your own pull request`). The verdict would never land as
# a review while the check publication (a separate step) still marked `pair-review`
# `success`: an approving verdict recorded as a green required check on a pull request
# carrying NO review body. The setup rule is the primary containment (the identity must not
# author pull requests in the repository — host guide); this arm is the mechanical one, and
# it degrades to the COMMENT form rather than losing the verdict.
identity_verdict_event() {
  local mode="${1:-}" verdict="${2:-}" approve_authorized="${3:-0}" self_authored="${4:-}"

  case "$mode" in
  identity)
    if [ "$self_authored" = "1" ]; then
      echo "review-identity: the review identity is the AUTHOR of this pull request — the host rejects a self-authored APPROVE/REQUEST_CHANGES, so the verdict is submitted as COMMENT with its token leading the body. Fix the setup: the review identity must not be an account that opens pull requests in this repository (see the code host's implementation guide, section 'Dedicated review identity')." >&2
      echo "COMMENT"
      return 0
    fi
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

  printf 'pair review identity — %s. Tag: %s (%s) · tier: %s · PR state: %s. Inputs are tags, gate results and the review verdict only; nothing here classifies the change (D18). An identity approval never satisfies the explicit human approval required at risk:red: an App identity is rejected by `human_approval_jq_filter`'"'"'s `user.type == "User"` clause, a bot-USER identity (which does type as "User") by its login clause against REVIEW_IDENTITY_LOGIN.\n' \
    "${action:-unknown}" "${tag:-none}" "$declaration" "${tier:-unknown}" "${state:-unknown}"
}
