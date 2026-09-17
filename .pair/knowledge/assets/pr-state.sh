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
  #   one name per LINE (`-q '.labels[].name'`) — EXACT for every label name whenever the
  #   string ACTUALLY carries a newline: ≥2 labels, or ONE label whose trailing newline the
  #   caller preserved. A code-host name cannot contain a newline, so that split never cuts
  #   a name. Split on newlines ALONE: a name may legally contain a COMMA (`theme, light`),
  #   and translating commas here would cut one whole name into two fields and match the
  #   tag against a fragment nobody applied.
  #   RESIDUAL, single label + a comma in its NAME. `LABELS="$(gh pr view <n> --json labels
  #   -q '.labels[].name')"` strips the trailing newline, so a PR carrying the ONE label
  #   `theme, light` reaches this function as `theme, light` with NO newline, takes the
  #   comma branch below and matches on the fragment `light`. Nothing in that string says
  #   whether the comma delimits two names or belongs to one — the same irrecoverable
  #   ambiguity as the joined shape. It is not reachable through this row today (a sub-🔴
  #   tier needs a `risk:*` label, hence a second field and a newline), but a caller that
  #   supplies the tier from another source meets it: preserve the trailing newline and the
  #   LINE branch is taken, which is exact.
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
# agent identity shipped as a GitHub App or Bot account (#218) — a machine USER
# account holding a PAT does NOT recover it. Recorded in ADR-018 rather than
# assumed away.
#
# The consumer evaluates the review path FIRST and only falls back to this one, and
# the token is decided in TWO stages that BOTH have to pass:
#   1. `human_token_approval_select` — host-asserted comment fields + the head-bound
#      command + the author exclusion (unless the repository opted in as single-human),
#   2. `token_approver_login` — a SERVER-SIDE read of the actor's repository
#      permission, because `author_association` is not push access.
# A rejection is REPORTED as the rejection it is (`token_denied_desc`): "no token was
# posted", "the token's author is not write-level", "the permission lookup could not
# answer" and "the token is the PR author's and the single-human opt-in is not set"
# (`token_blocked_by_author_exclusion`, the one rejection that happens at stage 1) are
# four different things to tell a maintainer, and collapsing them into one description
# tells someone who just posted a valid token to post one.

# human_token_approval_select — the ONE predicate all three projections below are
# built from, so the count the gate acts on and the audit line it publishes cannot
# drift. It is stage 1 of TWO: a candidate that passes here is not yet authorized —
# `token_approver_login` must still confirm the actor's repository permission
# server-side (see below). Neither stage alone decides.
#
#   Input : a REST `GET /repos/{owner}/{repo}/issues/{n}/comments` payload (an array),
#           read FRESH from the API — an edited/deleted comment must stop counting,
#           and a webhook payload is a snapshot. Read ALL pages (`--paginate`).
#   Env   : HEAD_SHA            — the only commit branch protection evaluates,
#           PR_AUTHOR           — the PR's author login (author-exclusion, below),
#           SOLO_APPROVAL_TOKEN — "true" ONLY on a repository that has declared
#                                 itself single-human (see the opt-in note below).
#
# Every field it decides on is asserted by the HOST, never by the applier:
#   `.user.type`               — "User" excludes Bot and Organization accounts,
#   `.performed_via_github_app`— non-null when an App posted it on a user's behalf,
#                                so an app-attributed comment is rejected too,
#   `.author_association`      — a cheap PRE-FILTER, NOT the authorization: GitHub's
#                                MEMBER means "member of the organization that owns
#                                the repository" and says nothing about push access
#                                HERE, so a read-only org member passes this stage.
#                                What authorizes is the server-side permission read
#                                in `token_approver_login`,
#   `.user.login`/`.created_at`— the audit trail.
# The BODY is read for the command and the head SHA only — never for an actor: a
# comment claiming to be someone else changes nothing.
#
# THE AUTHOR EXCLUSION AND ITS OPT-IN. The token exists for a repository that cannot
# produce a second human; it must never become a self-approval shortcut for one that
# can. Nothing in a comment payload says "this repository has one human", so the
# repository declares it: `SOLO_APPROVAL_TOKEN=true` (on GitHub, the repository
# variable `vars.PAIR_SOLO_APPROVAL_TOKEN`). Default — the variable unset — the token
# is still available but carries the SAME author exclusion the review predicate above
# carries (`.user.login != env.PR_AUTHOR`), so a 🔴 PR can never be self-satisfied by
# its own author. With an empty PR_AUTHOR and the opt-in off, nothing counts.
#
# The opt-in is compared CASE-INSENSITIVELY, with surrounding whitespace ignored: its
# value is typed into a free-text box (GitHub's Actions → Variables), and a
# case-sensitive `== "true"` made `True`/`TRUE` declare nothing while looking set —
# indistinguishable, on the PR, from never having created the variable. Only that one
# word opts in: `1`, `yes` and `on` are NOT the declaration, and the exclusion stays.
# A declaration that silently did nothing is the failure mode this comparison removes;
# a stricter parse would only move it.
#
# The `test("^[0-9a-f]{40}$")` guard on HEAD_SHA is load-bearing twice over: an unset
# HEAD_SHA would degrade the match into "any /approve" (an unbound token), and the
# value is CONCATENATED INTO A REGEX, so a non-hex 40-character string of
# metacharacters would match anything of the right shape. Fail-safe: nothing counts.
#
# The command must own its LINE (`(^|\n)/approve …(\n|$)`, no leading whitespace
# allowed): GitHub's own "Quote reply" produces `> /approve <sha>`, and a whitespace-
# tolerant match would let a quoter — who may be explicitly declining in the same
# comment — approve the PR and be published as its approver. Indented code blocks and
# inline-backtick mentions are rejected by the same anchor.
#
# TWO REGIONS ARE REMOVED BEFORE THAT ANCHOR IS APPLIED, because the anchor cannot see
# them and GitHub renders neither as a live command:
#   HTML COMMENTS (`<!-- … -->`, across lines) — INVISIBLE in the rendered comment. A
#     token hidden in one is a token no reader can see, published in the audit line
#     under its author's name. An UNCLOSED `<!--` swallows the rest of the body, the
#     same fail-safe direction the fences take.
#   FENCED regions — a ``` (or ~~~) fence puts its content at column 0 of its own line,
#     so a maintainer writing "here is how you approve:" with the command in a fence —
#     the shape this very guide uses to show the adopter the token, and the shape
#     GitHub's UI produces for a copyable command — would otherwise approve the PR and
#     be published as its approver while the same comment says "do not run it yet".
# The fence split is LINE-ANCHORED (`(^|\n) {0,3}```[^\n]*`, up to CommonMark's three
# leading spaces, consuming the info string) rather than a bare `split("```")`, and the
# surviving segments are rejoined with `""`, never `"\n"`. Both details are defects
# this shape closes, not style: a bare parity split treated an INLINE ```gh``` span as
# a fence and the `"\n"` join then MANUFACTURED a line boundary the raw body does not
# have, so a mid-line mention after an inline code span approved; and a token glued to
# a closing fence (```` ```/approve <sha> ````) counted as "outside", though a closing
# fence may not carry trailing content, so GitHub leaves the fence OPEN and renders the
# token as code. `.key % 2 == 0` keeps the regions outside the fences; an UNCLOSED
# fence swallows everything after it, which is both what GitHub renders and the
# fail-safe direction. A genuine token before or after a fence still matches.
#
# RESIDUAL, named rather than claimed away: this is a targeted strip, not a CommonMark
# parser. A fence indented FOUR or more spaces (inside a list item, say) is not
# recognised as a fence — but its content is indented too, and the anchor forbids
# leading whitespace, so the token inside it is rejected anyway. Say "outside fenced
# regions and HTML comments", never "outside every code block".
human_token_approval_select() {
  printf '%s' '.[] | select(((env.HEAD_SHA // "") | test("^[0-9a-f]{40}$")) and .user.type=="User" and (.performed_via_github_app|not) and (.author_association|IN("OWNER","MEMBER","COLLABORATOR")) and (if ((env.SOLO_APPROVAL_TOKEN // "") | ascii_downcase | gsub("\\s";"")) == "true" then true else ((env.PR_AUTHOR // "") != "" and .user.login != env.PR_AUTHOR) end) and ((.body // "") | gsub("<!--(.|\\n)*?-->";"") | gsub("<!--(.|\\n)*$";"") | split("(^|\\n) {0,3}```[^\\n]*";"") | to_entries | map(select(.key % 2 == 0) | .value) | join("") | split("(^|\\n) {0,3}~~~[^\\n]*";"") | to_entries | map(select(.key % 2 == 0) | .value) | join("") | test("(^|\\n)/approve[ \\t]+" + env.HEAD_SHA + "[ \\t\\r]*(\\n|$)")))'
}

# human_token_approval_jq_filter — one line per candidate comment id; count them
# (`| grep -c .`), exactly like the review filter above. A non-zero count is a
# CANDIDATE, not an approval: stage 2 below still has to authorize the actor.
human_token_approval_jq_filter() {
  printf '%s%s' "$(human_token_approval_select)" ' | .id'
}

# human_token_approval_login_jq_filter — the candidate actor logins, fed to the
# server-side permission read that actually authorizes them.
human_token_approval_login_jq_filter() {
  printf '%s%s' "$(human_token_approval_select)" ' | .user.login'
}

# human_token_approval_actor_jq_filter — the audit line for the published status
# description: WHO confirmed, on WHICH head, WHEN — all three host-asserted.
# The head is abbreviated to 12 characters ON PURPOSE: the commit status
# `description` is capped at 140 characters by the API, and the full 40-char form
# put a login of 24+ characters over that cap, silently truncating the timestamp out
# of the audit trail. 12 hex characters plus the head-pinned status itself (the
# status is POSTed on the full SHA) keep the line unambiguous and bounded — worst
# case, a 39-character login: 129 characters with the fixed suffix.
human_token_approval_actor_jq_filter() {
  printf '%s%s' "$(human_token_approval_select)" ' | "\(.user.login) approved head \(env.HEAD_SHA[0:12]) at \(.created_at)"'
}

# TOKEN_PERMISSION_UNKNOWN — the value a permission lookup echoes when it could NOT
# ANSWER (403 on the collaborators surface, a 5xx, a rate limit). It must be distinct
# from `none`: `none` is a definitive "this login has no permission here", and folding
# an API failure onto it makes a token that WAS posted and could not be authorized
# indistinguishable from one that was never posted at all. Both still reject the
# token — what differs is the description the gate publishes (`token_denied_desc`).
TOKEN_PERMISSION_UNKNOWN='lookup-failed'

# token_permission_sufficient <permission> — stage 2's decision, isolated so it is
# executable on its own. Takes the `permission` field of
# `GET /repos/{owner}/{repo}/collaborators/{login}/permission` and answers whether it
# is write-level. `read`, `triage`, `none`, an empty value and
# `$TOKEN_PERMISSION_UNKNOWN` all fail.
token_permission_sufficient() {
  case "${1:-}" in
  admin | maintain | write) return 0 ;;
  *)
    echo "pr-state: repository permission '${1:-none}' is not write-level — token rejected" >&2
    return 1
    ;;
  esac
}

# token_approver_login <lookup-cmd> <candidate-login>... — stage 2. Echoes the FIRST
# candidate whose SERVER-SIDE repository permission is write-level and exits 0.
# Otherwise it echoes nothing and exits with a code that says WHY, because the three
# reasons are three different things to tell the maintainer:
#   1 — no candidate at all (no token was posted), or no lookup command (fail-safe),
#   2 — candidates existed and every one of them is definitively not write-level,
#   3 — candidates existed and at least one lookup COULD NOT ANSWER (403/5xx/rate
#       limit) — the gate must not report that as "no token was posted".
# Feed the code to `token_denied_desc` so the published description matches the state.
#
# <lookup-cmd> is the command answering "what permission does this login hold on this
# repository": the host job passes a `gh api .../collaborators/<login>/permission`
# wrapper, the smoke test passes a fixture reader — so ONE code path decides in both
# and the authorization cannot drift between the recipe and what is verified.
# Fail-safe: no lookup command ⇒ no approver.
token_approver_login() {
  local lookup="${1:-}" login perm seen=0 unknown=0
  shift 2>/dev/null || true
  if [ -z "$lookup" ]; then
    echo "pr-state: no permission lookup provided — token rejected (fail-safe)" >&2
    return 1
  fi
  for login in "$@"; do
    [ -n "$login" ] || continue
    seen=1
    perm="$("$lookup" "$login" 2>/dev/null || true)"
    if [ "${perm:-none}" = "$TOKEN_PERMISSION_UNKNOWN" ]; then unknown=1; fi
    if token_permission_sufficient "${perm:-none}"; then
      printf '%s' "$login"
      return 0
    fi
  done
  [ "$seen" -eq 1 ] || return 1
  [ "$unknown" -eq 0 ] || return 3
  return 2
}

# token_blocked_by_author_exclusion <pr-author> <forced-candidate-login>… — the
# FOURTH state, and the stage-1 twin of the stage-2 failure `token_denied_desc` exists
# for. With the opt-in unset, the PR AUTHOR's own token is dropped by stage 1: it never
# reaches the permission read, the candidate list is empty and `token_approver_login`
# exits 1 — i.e. the gate publishes "nothing was posted" to the one person who did post
# it, on the only repository shape the token exists for. The maintainer re-posts, gets
# the byte-identical line, has no second account, and the variable that would lift the
# exclusion is named NOWHERE on the pull request.
#
# The caller re-runs stage 1 with the opt-in FORCED on (`SOLO_APPROVAL_TOKEN=true jq -r
# "$(human_token_approval_login_jq_filter)"`) and passes the logins that yields here.
# Answering 0 means: a token WAS posted and the author exclusion is the only thing that
# dropped it. Fail-safe: an empty/unresolved <pr-author> matches nothing, so a failed
# author resolution can never be reported as a self-approval.
token_blocked_by_author_exclusion() {
  local author="${1:-}" login
  shift 2>/dev/null || true
  [ -n "$author" ] || return 1
  for login in "$@"; do
    [ "$login" = "$author" ] || continue
    return 0
  done
  return 1
}

# token_denied_desc <token_approver_login-exit-code> <head-sha> <candidate-login> —
# the commit-status `description` for a 🔴 PR the token did NOT satisfy. One text per
# STATE, never one text for all of them: telling a maintainer who just posted a valid
# token to "post /approve <sha>" is the failure this function exists to prevent — they
# re-post, get the same line, and nothing on the PR distinguishes "you did not post
# one" from "yours could not be authorized" or "yours was yours". All four forms fit
# the API's 140-char `description` cap at the worst-case 39-character login.
# <candidate-login> is the FIRST stage-1 candidate and is named only in the
# permission-denied form, where it is the actor the verdict is about. The
# lookup-failure form names no one on purpose: the lookup that failed is not
# necessarily the first candidate's, and the run log has the exact API error. Code 4
# (`token_blocked_by_author_exclusion`) names the VARIABLE instead of a login: the
# author already knows who they are, and the variable is the thing they cannot guess.
token_denied_desc() {
  case "${1:-}" in
  2) printf 'risk:red — token from %s not authorized: repository permission is not write-level (D10)' "${3:-a candidate}" ;;
  3) printf 'risk:red — a token was posted but could not be authorized: permission lookup failed, see the run log (D10)' ;;
  4) printf 'risk:red — token posted by the PR author; set PAIR_SOLO_APPROVAL_TOKEN=true if this repo has one human (D10)' ;;
  *) printf 'risk:red — needs a non-author human approval, or %s posted by a human maintainer (D10)' "$(solo_approval_token_body "${2:-}")" ;;
  esac
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
