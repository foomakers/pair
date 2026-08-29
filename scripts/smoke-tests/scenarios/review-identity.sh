#!/usr/bin/env bash
OFFLINE_SAFE=true
#
# Dedicated review identity + adoption-gated light auto-approval — verification
# scenario (story #218, ADR-018 amendment 2026-08-28 adopting Option 4).
#
# This story EXTENDS the shipped PR state flow (#234/#390); it rebuilds none of it.
# `resolve_pr_state`'s table is untouched and is re-asserted here as regression
# surface. What is new, and what this scenario executes end-to-end:
#
#   1. the host-agnostic identity ADAPTER (`assets/review-identity.sh`):
#      configured+usable ⇒ `identity`, none configured ⇒ `session` (today's degraded
#      mode, NOT an error), configured-but-broken ⇒ `halt` — never a silent fallback
#      to the session user (AC1, AC4),
#   2. the NATIVE verdict + the App-only Checks API path, with the `--comment` /
#      commit-status forms preserved as the documented degraded ones (AC1),
#   3. the adoption-gated LIGHT row (`light_auto_approve_allowed` in `pr-state.sh`):
#      approve only when adoption declares `light`, the PR carries it, the tier is
#      below red, AND the synthesis is already merge-enabling (AC2, AC3),
#   4. the 🔴 predicate EXCLUDES the identity MECHANICALLY, by two clauses because the
#      two forms are two account kinds: an App types as `"Bot"` (type clause), a bot
#      USER types as `"User"` and is excluded only by its login
#      (`REVIEW_IDENTITY_LOGIN`) — with `review_identity_exclusion_ok` making an
#      unprovisioned login a NOT-healthy identity (AC3, AC6), and
#   5. the guards: the light row is the ONLY authority for an APPROVE event (asserted on
#      the resolved event, not on prose), and no classification criteria anywhere in the
#      approval flow (D18).
#
# Per the gate-tooling ADL (2026-07-13) these shell assets are verified with a smoke
# test, never a vitest unit test; the CONTENT invariants of the same surfaces are
# asserted in packages/knowledge-hub/src/conformance/review-identity.test.ts.
source "$(dirname "$0")/../lib/utils.sh"
ensure_tmp_dir

TEST_NAME="Dedicated Review Identity + Light Auto-Approval"
echo "=== Running $TEST_NAME ==="

REPO_ROOT="${REPO_ROOT:-$(cd "$(dirname "$0")/../../.." && pwd)}"
DATASET="$REPO_ROOT/packages/knowledge-hub/dataset"
IDENTITY="$DATASET/.pair/knowledge/assets/review-identity.sh"
EVALUATOR="$DATASET/.pair/knowledge/assets/pr-state.sh"
TIER_RESOLVER="$DATASET/.pair/knowledge/assets/tier-resolve.sh"
GUIDELINE="$DATASET/.pair/knowledge/guidelines/collaboration/project-management-tool/pr-states.md"
GITHUB_GUIDE="$DATASET/.pair/knowledge/guidelines/collaboration/project-management-tool/github-implementation.md"
REVIEW="$DATASET/.skills/process/review/SKILL.md"
PUBLISH_PR="$DATASET/.skills/capability/publish-pr/SKILL.md"
WOW_TEMPLATE="$DATASET/.pair/adoption/tech/way-of-working.md"
ADR="$REPO_ROOT/.pair/adoption/tech/adr/adr-018-pr-state-flow-required-checks.md"
RISK_MATRIX="$REPO_ROOT/.pair/adoption/tech/risk-matrix.md"

FAILED=0
check() { # check <description> <expected> <actual>
  if [ "$2" = "$3" ]; then log_succ "$1 => $3"; else log_fail "$1: expected '$2' got '$3'"; FAILED=1; fi
}
audit() { # audit <description> <file> <pattern...>
  local desc="$1" file="$2"
  shift 2
  local pat
  for pat in "$@"; do
    if ! grep -q "$pat" "$file"; then
      log_fail "$desc — missing '$pat' in $(basename "$file")"
      FAILED=1
      return
    fi
  done
  log_succ "$desc"
}
# yields/blocks: the light row is an exit-status contract, not an echo contract.
yields() { # yields <description> <labels> <declared> <tier> <state>
  if light_auto_approve_allowed "$2" "$3" "$4" "$5" 2>/dev/null; then
    log_succ "$1 => approve"
  else
    log_fail "$1: expected approve, got no-op"; FAILED=1
  fi
}
blocks() { # blocks <description> <labels> <declared> <tier> <state>
  if light_auto_approve_allowed "$2" "$3" "$4" "$5" 2>/dev/null; then
    log_fail "$1: expected no-op, got approve"; FAILED=1
  else
    log_succ "$1 => no-op"
  fi
}

for f in "$IDENTITY" "$EVALUATOR" "$TIER_RESOLVER" "$GUIDELINE" "$GITHUB_GUIDE" "$REVIEW" \
  "$PUBLISH_PR" "$WOW_TEMPLATE" "$ADR" "$RISK_MATRIX"; do
  assert_file "$f" || exit 1
done

# shellcheck source=/dev/null
source "$TIER_RESOLVER"
# shellcheck source=/dev/null
source "$EVALUATOR"
# shellcheck source=/dev/null
source "$IDENTITY"

# ==============================================================================
# AC1/AC4 — the identity adapter: three modes, and no fourth
# ==============================================================================
check "no identity configured ⇒ today's degraded session mode" session \
  "$(resolve_identity_mode 0 '' 2>/dev/null)"
check "no identity configured, healthy flag irrelevant"        session \
  "$(resolve_identity_mode 0 1 2>/dev/null)"
check "nothing passed at all ⇒ session (zero-configuration default)" session \
  "$(resolve_identity_mode '' '' 2>/dev/null)"
check "identity configured AND usable ⇒ identity"              identity \
  "$(resolve_identity_mode 1 1 2>/dev/null)"
check "identity configured, credential invalid ⇒ HALT"         halt \
  "$(resolve_identity_mode 1 0 2>/dev/null)"
check "identity configured, health UNKNOWN ⇒ HALT (fail-safe)" halt \
  "$(resolve_identity_mode 1 '' 2>/dev/null)"
check "identity configured, health malformed ⇒ HALT"           halt \
  "$(resolve_identity_mode 1 maybe 2>/dev/null)"

# The HALT must carry the setup pointer, and must never name the session user as a
# route: silently acting as the human whose token happened to be loaded is the one
# outcome AC4 forbids.
HALT_MSG="$(resolve_identity_mode 1 0 2>&1 >/dev/null)"
if printf '%s' "$HALT_MSG" | grep -q 'Dedicated review identity'; then
  log_succ "HALT points at the KB guide section (Dedicated review identity)"
else
  log_fail "HALT lost the setup pointer: $HALT_MSG"; FAILED=1
fi
if printf '%s' "$HALT_MSG" | grep -qi 'never falls back\|no fallback'; then
  log_succ "HALT states there is no session-user fallback"
else
  log_fail "HALT does not state the no-fallback rule"; FAILED=1
fi

# ==============================================================================
# AC1 — native verdict with an identity; the degraded forms are preserved
# ==============================================================================
# THE APPROVE EVENT IS GATED. A native APPROVE satisfies a host
# `required_approving_review_count >= 1` on its own, so the light row — the third
# argument — is its only authority. Ungating this is the regression these rows exist for.
check "identity + approved + light row AUTHORIZED ⇒ native APPROVE" APPROVE \
  "$(identity_verdict_event identity approved 1 2>/dev/null)"
check "identity + approved + row did NOT authorize ⇒ COMMENT, never APPROVE" COMMENT \
  "$(identity_verdict_event identity approved 0 2>/dev/null)"
check "identity + approved + authority ARGUMENT ABSENT ⇒ COMMENT (fail-safe)" COMMENT \
  "$(identity_verdict_event identity approved 2>/dev/null)"
check "identity + approved + malformed authority ⇒ COMMENT (fail-safe)" COMMENT \
  "$(identity_verdict_event identity approved yes 2>/dev/null)"
check "identity + changes-requested ⇒ REQUEST_CHANGES (ungated: a block never unlocks)" REQUEST_CHANGES \
  "$(identity_verdict_event identity changes-requested 0 2>/dev/null)"
check "identity + no decision ⇒ COMMENT (fail-safe, not APPROVE)" COMMENT \
  "$(identity_verdict_event identity '' 1 2>/dev/null)"
check "identity + unknown verdict ⇒ COMMENT (fail-safe) even when authorized" COMMENT \
  "$(identity_verdict_event identity banana 1 2>/dev/null)"
check "unknown mode ⇒ COMMENT (never a native verdict on an unresolved actor)" COMMENT \
  "$(identity_verdict_event '' approved 1 2>/dev/null)"

# SESSION MODE IS NOT UNIFORMLY A COMMENT. `session` is the DEFAULT (no identity
# configured), and COMMENT there is the workaround for ONE host rule: a self-authored
# APPROVE / REQUEST_CHANGES is rejected. On a two-person team the reviewer is NOT the
# author — the host accepts the native event, and collapsing it would record NO change
# request (the merge button stays unblocked, no blocking reviewer) and NO approval the
# host counts toward `required_approving_review_count`. The fourth argument is what tells
# the two cases apart; unknown authorship is self-authored (fail-safe COMMENT).
check "session + NOT self-authored + changes-requested ⇒ native REQUEST_CHANGES" REQUEST_CHANGES \
  "$(identity_verdict_event session changes-requested 0 0 2>/dev/null)"
check "session + NOT self-authored + approved ⇒ native APPROVE" APPROVE \
  "$(identity_verdict_event session approved 0 0 2>/dev/null)"
check "session + SELF-authored + changes-requested ⇒ COMMENT (host rejects it)" COMMENT \
  "$(identity_verdict_event session changes-requested 0 1 2>/dev/null)"
check "session + SELF-authored + approved ⇒ COMMENT (host rejects a self-approval)" COMMENT \
  "$(identity_verdict_event session approved 0 1 2>/dev/null)"
check "session + authorship ARGUMENT ABSENT ⇒ COMMENT (fail-safe)" COMMENT \
  "$(identity_verdict_event session approved 0 2>/dev/null)"
check "session + authorship malformed ⇒ COMMENT (fail-safe)" COMMENT \
  "$(identity_verdict_event session changes-requested 0 maybe 2>/dev/null)"
check "session + NOT self-authored + no decision ⇒ COMMENT (fail-safe)" COMMENT \
  "$(identity_verdict_event session '' 0 0 2>/dev/null)"
# The light row governs the IDENTITY's approval, not the session account's own review:
# in `session` mode the third argument is inert.
check "session + NOT self-authored + approved, no light authority ⇒ still APPROVE" APPROVE \
  "$(identity_verdict_event session approved 0 0 2>/dev/null)"
# ROUND 6. `identity` mode never consulted the 4th argument, and nothing forbade the
# identity from being the SAME account that opens the pull requests (an unattended loop
# that runs implement/publish-pr as `acme-bot` and then provisions `acme-bot` as
# `Review identity: bot-user`). Health passes, the mode resolves `identity`, and the host
# then REJECTS the native event — `422 Can not request changes on your own pull request` —
# so the verdict never lands as a review while Step 5.4 still publishes `pair-review`: an
# APPROVED verdict leaves a `success` check on a PR carrying no review body at all.
# The setup rule (the identity must not author PRs) is the primary containment; this arm
# is the mechanical one. The DEFAULTS are per-mode and deliberately asymmetric: in
# `session` mode unknown authorship is SELF-authored (the acting account routinely IS the
# author), in `identity` mode it is NOT (setup forbids it, and defaulting the other way
# would collapse every identity verdict to COMMENT and delete the feature).
check "identity + SELF-authored + approved & authorized ⇒ COMMENT (host rejects it)" COMMENT \
  "$(identity_verdict_event identity approved 1 1 2>/dev/null)"
check "identity + SELF-authored + changes-requested ⇒ COMMENT (422 otherwise)" COMMENT \
  "$(identity_verdict_event identity changes-requested 0 1 2>/dev/null)"
check "identity + provably NOT self-authored ⇒ native REQUEST_CHANGES" REQUEST_CHANGES \
  "$(identity_verdict_event identity changes-requested 0 0 2>/dev/null)"
check "identity + authorship ABSENT ⇒ native event (setup forbids a PR-authoring identity)" APPROVE \
  "$(identity_verdict_event identity approved 1 2>/dev/null)"
IDENT_SELF_MSG="$(identity_verdict_event identity approved 1 1 2>&1 >/dev/null)"
if printf '%s' "$IDENT_SELF_MSG" | grep -qi 'author'; then
  log_succ "the identity-mode COMMENT names self-authorship as its reason"
else
  log_fail "identity-mode self-authored COMMENT does not name authorship: $IDENT_SELF_MSG"; FAILED=1
fi

SELF_MSG="$(identity_verdict_event session approved 0 1 2>&1 >/dev/null)"
if printf '%s' "$SELF_MSG" | grep -qi 'author'; then
  log_succ "the session-mode COMMENT names self-authorship as its reason"
else
  log_fail "session-mode COMMENT does not name self-authorship: $SELF_MSG"; FAILED=1
fi

# The refusal must NAME the missing authority, or an operator cannot tell it from a
# session-mode degradation.
UNAUTH_MSG="$(identity_verdict_event identity approved 0 2>&1 >/dev/null)"
if printf '%s' "$UNAUTH_MSG" | grep -qi 'light row'; then
  log_succ "an unauthorized APPROVED verdict names the light row as the missing authority"
else
  log_fail "unauthorized APPROVE refusal does not name the light row: $UNAUTH_MSG"; FAILED=1
fi

# ==============================================================================
# AC3/AC6 — `review_identity_exclusion_ok`: the identity must be MECHANICALLY excluded
# from the 🔴 predicate before it is allowed to act at all.
# ==============================================================================
excluded() { # excluded <description> <kind> <login>
  if review_identity_exclusion_ok "$2" "$3" 2>/dev/null; then
    log_succ "$1 => excluded"
  else
    log_fail "$1: expected excluded, got NOT excluded"; FAILED=1
  fi
}
not_excluded() { # not_excluded <description> <kind> <login>
  if review_identity_exclusion_ok "$2" "$3" 2>/dev/null; then
    log_fail "$1: expected NOT excluded, got excluded"; FAILED=1
  else
    log_succ "$1 => not excluded (identity is not healthy)"
  fi
}
excluded     "App identity — user.type is \"Bot\", the type clause covers it" app ''
excluded     "bot-user identity WITH its login provisioned"                    user acme-review-bot
not_excluded "bot-user identity with NO login provisioned"                     user ''
not_excluded "identity of unknown kind (fail-safe: assume not excluded)"       banana acme-review-bot
not_excluded "identity kind absent entirely"                                   '' ''
# THE VOCABULARY THE SKILLS ACTUALLY PASS. `/pair-process-review` Step 5.3 reads
# `Review identity:` from way-of-working and forwards that LITERAL as <kind>; adoption
# spells the machine-account form `bot-user`, not `user`. A kind the adapter does not
# accept is a not-healthy identity ⇒ every review on a correctly provisioned bot-user
# repository would HALT forever. Both spellings must resolve identically.
excluded     "bot-user (the ADOPTION literal) WITH its login provisioned"      bot-user acme-review-bot
not_excluded "bot-user (the ADOPTION literal) with NO login provisioned"       bot-user ''
# ==============================================================================
# AC4 (ROUND 6) — `healthy` HAS A RUNTIME SOURCE. `resolve_identity_mode`'s second
# argument is the single signal separating `identity` from `halt`, and nothing computed
# it: the guide's step-6 snippet carried an inert `PROBES_PASSED=0  # set to 1 by
# whatever ran step 5's probes` and nothing in the corpus ever set it. Following the
# guide literally (probes are setup-time, nothing persists the result) left
# PROBES_PASSED=0 on every run ⇒ `resolve_identity_mode 1 0` ⇒ halt ⇒ EVERY review and
# every publish-pr on a CORRECTLY provisioned repository halted forever. The health
# determination is now one adapter entry point fed by per-run, artifact-free probes.
# ==============================================================================
check "app + credential valid + grants observed ⇒ healthy"            1 \
  "$(review_identity_health app 1 1 '' 2>/dev/null)"
check "app + credential probe FAILED ⇒ not healthy"                   0 \
  "$(review_identity_health app 0 1 '' 2>/dev/null)"
check "app + permission probe FAILED (403/422) ⇒ not healthy"         0 \
  "$(review_identity_health app 1 0 '' 2>/dev/null)"
check "app + probes NOT RUN (arguments absent) ⇒ not healthy"         0 \
  "$(review_identity_health app 2>/dev/null)"
check "app + malformed probe outcome ⇒ not healthy (fail-safe)"       0 \
  "$(review_identity_health app maybe 1 '' 2>/dev/null)"
check "bot-user + probes green + login provisioned ⇒ healthy"         1 \
  "$(review_identity_health bot-user 1 1 acme-review-bot 2>/dev/null)"
check "bot-user + probes green, login UNSET ⇒ not healthy (🔴 gate open)" 0 \
  "$(review_identity_health bot-user 1 1 '' 2>/dev/null)"
check "user (short form) + probes green + login ⇒ healthy"            1 \
  "$(review_identity_health user 1 1 acme-review-bot 2>/dev/null)"
check "unknown kind, probes green ⇒ not healthy"                      0 \
  "$(review_identity_health banana 1 1 acme-review-bot 2>/dev/null)"
check "nothing passed at all ⇒ not healthy"                           0 \
  "$(review_identity_health 2>/dev/null)"
# End to end: the health answer is what `resolve_identity_mode` consumes.
check "healthy identity ⇒ identity mode"  identity \
  "$(resolve_identity_mode 1 "$(review_identity_health app 1 1 '' 2>/dev/null)" 2>/dev/null)"
check "a 403 on the permission probe ⇒ halt, never a session fallback" halt \
  "$(resolve_identity_mode 1 "$(review_identity_health app 1 0 '' 2>/dev/null)" 2>/dev/null)"
HEALTH_MSG="$(review_identity_health app 1 0 '' 2>&1 >/dev/null)"
if printf '%s' "$HEALTH_MSG" | grep -qi 'permission'; then
  log_succ "the not-healthy reason names which probe failed"
else
  log_fail "not-healthy reason does not name the failed probe: $HEALTH_MSG"; FAILED=1
fi

EXCL_MSG="$(review_identity_exclusion_ok user '' 2>&1 >/dev/null)"
if printf '%s' "$EXCL_MSG" | grep -q 'REVIEW_IDENTITY_LOGIN'; then
  log_succ "the not-excluded reason names the variable that must be provisioned"
else
  log_fail "not-excluded reason does not name REVIEW_IDENTITY_LOGIN: $EXCL_MSG"; FAILED=1
fi

# The Checks API is App-only; every other combination stays a commit status.
check "App identity ⇒ pair-review via the Checks API"        checks-api \
  "$(pair_review_publication_mode identity app 2>/dev/null)"
check "bot-user identity ⇒ commit status (no checks: write)" commit-status \
  "$(pair_review_publication_mode identity user 2>/dev/null)"
check "bot-user (ADOPTION literal) ⇒ commit status"          commit-status \
  "$(pair_review_publication_mode identity bot-user 2>/dev/null)"
check "identity of unknown kind ⇒ commit status (fail-safe)" commit-status \
  "$(pair_review_publication_mode identity '' 2>/dev/null)"
check "session mode ⇒ commit status (today's documented form)" commit-status \
  "$(pair_review_publication_mode session app 2>/dev/null)"

# ==============================================================================
# AC2/AC3 — the adoption-gated light row.
# The full matrix: light (declared+tagged / tagged-undeclared / untagged / declared
# -untagged) x tier (green/yellow/red/untagged) x synthesis (merge-enabling or not).
# ==============================================================================
LIGHT_LABELS="risk:green light"
yields "declared + tagged + 🟢 + ready-to-merge"        "$LIGHT_LABELS" 1 green  ready-to-merge
yields "declared + tagged + 🟡 + ready-to-merge"        "risk:yellow light" 1 yellow ready-to-merge
# Comma-separated label lists are the other common host rendering.
yields "declared + tagged (comma-separated labels)"     "risk:green,light,user story" 1 green ready-to-merge
# ROUND 4. NEWLINE-separated is the third, and it is what the NATURAL host read produces
# (`gh pr view <n> --json labels -q '.labels[].name'`). Normalising commas only refused
# every correctly tagged PR, with a stderr denying a `light` tag the PR visibly carries.
yields "declared + tagged (newline-separated labels)"   "$(printf 'risk:green\nlight\nuser story\n')" 1 green ready-to-merge
blocks "newline-separated but no whole-label light"     "$(printf 'risk:green\nlightweight\n')" 1 green ready-to-merge

# Adoption is the gate — a hand-applied label on a repo declaring no projection is inert.
blocks "tagged but adoption declares NO light family"   "$LIGHT_LABELS" 0 green ready-to-merge
blocks "tagged, declaration flag absent entirely"       "$LIGHT_LABELS" '' green ready-to-merge
blocks "tagged, declaration flag malformed"             "$LIGHT_LABELS" yes   green ready-to-merge
# The label must be the light tag itself, not a substring of another label.
blocks "declared but PR carries no light tag"           "risk:green user story" 1 green ready-to-merge
blocks "declared, a label merely CONTAINING 'light'"    "risk:green lightweight" 1 green ready-to-merge
blocks "declared, no labels at all"                     "" 1 green ready-to-merge
# ROUND 12. Code-host label NAMES may themselves contain spaces (`good first issue`,
# `help wanted`), so collapsing every shape to spaces made `ui: light theme` — a label
# many UI projects already carry — indistinguishable from the `light` TAG: a risk:green PR
# carrying only it reached APPROVE, and the audit comment named a `Tag: light` the PR does
# not carry. The two UNAMBIGUOUS shapes are now matched as WHOLE FIELDS.
blocks "declared, a MULTI-WORD label containing 'light' (line form)" \
  "$(printf 'risk:green\nui: light theme\n')" 1 green ready-to-merge
blocks "declared, a MULTI-WORD label containing 'light' (comma form)" \
  "risk:green,ui: light theme" 1 green ready-to-merge
blocks "declared, 'not light' as one whole label (line form)" \
  "$(printf 'risk:green\nnot light\n')" 1 green ready-to-merge
yields "declared + tagged alongside a multi-word sibling (line form)" \
  "$(printf 'risk:green\nui: light theme\nlight\n')" 1 green ready-to-merge
yields "declared + tagged, comma form with padding around the field" \
  "risk:green, light , user story" 1 green ready-to-merge

# Most restrictive wins: light never bypasses the 🔴 gate, and never invents a tier.
blocks "declared + tagged + 🔴 (light never applies at red)" "risk:red light" 1 red ready-to-merge
blocks "declared + tagged + UNTAGGED tier (fail-safe red)"   "light" 1 '' ready-to-merge
blocks "declared + tagged + malformed tier (fail-safe red)"  "light" 1 banana ready-to-merge

# The synthesis must already be merge-enabling — the row never re-decides it.
blocks "declared + tagged + 🟢 but state to-be-reviewed" "$LIGHT_LABELS" 1 green to-be-reviewed
blocks "declared + tagged + 🟢 but state not-approved"   "$LIGHT_LABELS" 1 green not-approved
blocks "declared + tagged + 🟢 but state unknown"        "$LIGHT_LABELS" 1 green ''

# Composed end-to-end the way the flow does it: labels -> resolve_tier ->
# resolve_pr_state -> light row. `resolve_pr_state` itself is NOT modified.
compose() { # compose <labels> <declared> <gates> <verdict> <approval>
  local labels="$1" declared="$2" tier state
  tier="$(resolve_tier "$labels" 2>/dev/null)"
  state="$(resolve_pr_state "$3" "$4" "$tier" "$5" 2>/dev/null)"
  if light_auto_approve_allowed "$labels" "$declared" "$tier" "$state" 2>/dev/null; then
    echo "approve"
  else
    echo "no-op:$state"
  fi
}
check "composed: 🟢 light, green gates, approved review"   approve \
  "$(compose "risk:green light" 1 pass approved 0)"
check "composed: 🟢 light, RED gates (gate is the first filter)" "no-op:to-be-reviewed" \
  "$(compose "risk:green light" 1 fail approved 0)"
check "composed: 🟢 light, review pending"                 "no-op:to-be-reviewed" \
  "$(compose "risk:green light" 1 pass pending 0)"
check "composed: 🟢 light, changes-requested"              "no-op:not-approved" \
  "$(compose "risk:green light" 1 pass changes-requested 0)"
check "composed: 🔴 light, everything green, human approved" "no-op:ready-to-merge" \
  "$(compose "risk:red light" 1 pass approved 1)"
check "composed: untagged + light (fail-safe red), approved" "no-op:to-be-reviewed" \
  "$(compose "light" 1 pass approved 0)"
check "composed: 🟢 light on a repo with NO declaration"   "no-op:ready-to-merge" \
  "$(compose "risk:green light" 0 pass approved 0)"

# The shipped table is regression surface: identical inputs, identical outputs.
check "regression: 🟢 gates green + approved"   ready-to-merge "$(resolve_pr_state pass approved green 0 2>/dev/null)"
check "regression: 🔴 approved, no human"       to-be-reviewed "$(resolve_pr_state pass approved red 0 2>/dev/null)"
check "regression: untagged ⇒ 🔴 fail-safe"     to-be-reviewed "$(resolve_pr_state pass approved '' 0 2>/dev/null)"
check "regression: changes-requested"           not-approved   "$(resolve_pr_state pass changes-requested green 0 2>/dev/null)"

# THE SYNTHESIS IS UNCONDITIONAL. Step 5.4 applies exactly one `pr-state:*` label on every
# run, so the single `resolve_pr_state` call it publishes must be reachable in EVERY mode
# and for EVERY verdict — a synthesis scoped to `identity` mode + APPROVED leaves a
# session-mode review (every project today) with no state label at all, losing the
# #234/#390 state view. `resolve_pr_state` takes no mode argument, by design.
label_for() { # label_for <gates> <verdict> <tier> <explicit-approval>
  local state
  state="$(resolve_pr_state "$1" "$2" "$3" "$4" 2>/dev/null)"
  case "$state" in
  to-be-reviewed | ready-to-merge | not-approved) echo "pr-state:$state" ;;
  *) echo "pr-state:MISSING" ;;
  esac
}
check "session-mode run, approving verdict ⇒ exactly one pr-state label" pr-state:ready-to-merge \
  "$(label_for pass approved green 0)"
check "session-mode run, CHANGES-REQUESTED ⇒ exactly one pr-state label" pr-state:not-approved \
  "$(label_for pass changes-requested green 0)"
check "session-mode run, no decision yet ⇒ exactly one pr-state label" pr-state:to-be-reviewed \
  "$(label_for pass pending green 0)"
check "identity-mode run, CHANGES-REQUESTED ⇒ exactly one pr-state label" pr-state:not-approved \
  "$(label_for pass changes-requested red 0)"

# The no-op reason must be legible — which of the four conditions failed.
if light_auto_approve_allowed "$LIGHT_LABELS" 0 green ready-to-merge 2>&1 | grep -qi 'Tag Projection'; then
  log_succ "undeclared no-op names the adoption declaration it wanted"
else
  log_fail "undeclared no-op does not name '## Tag Projection'"; FAILED=1
fi
if light_auto_approve_allowed "risk:red light" 1 red ready-to-merge 2>&1 | grep -qi 'human'; then
  log_succ "🔴 no-op names the human-approval requirement"
else
  log_fail "🔴 no-op does not name the human-approval requirement"; FAILED=1
fi

# ==============================================================================
# AC2/AC5 — the audit comment states the TAG-based reason, never a merit judgment
# ==============================================================================
AUDIT="$(identity_audit_comment approve light 1 green ready-to-merge 2>/dev/null)"
for token in 'light' 'green' 'ready-to-merge' 'Tag Projection' 'D18'; do
  if printf '%s' "$AUDIT" | grep -q "$token"; then
    log_succ "audit comment states '$token'"
  else
    log_fail "audit comment lost '$token': $AUDIT"; FAILED=1
  fi
done
if printf '%s' "$AUDIT" | grep -q 'user.type'; then
  log_succ "audit comment restates that the identity never satisfies the 🔴 predicate"
else
  log_fail "audit comment does not restate the 🔴 exclusion"; FAILED=1
fi
BLOCK_AUDIT="$(identity_audit_comment block '' 0 red not-approved 2>/dev/null)"
if printf '%s' "$BLOCK_AUDIT" | grep -q 'block'; then
  log_succ "a block is audited with the same writer (AC5: approval OR block)"
else
  log_fail "block audit did not render"; FAILED=1
fi

# ==============================================================================
# AC3/AC6 — the 🔴 predicate is INTACT: an identity approval never satisfies it.
# Executed against the committed reviews fixture, extended with a bot-user and an
# App (`type: "Bot"`) approving review on the head commit.
# ==============================================================================
FIXTURE="$REPO_ROOT/scripts/smoke-tests/fixtures/github-pr-reviews.json"
assert_file "$FIXTURE" || exit 1
if command -v jq >/dev/null 2>&1; then
  FILTER="$(human_approval_jq_filter)"
  HEAD='cc1fba122f0c912ba01288fe90ab2632e7e41057'
  count_approvals() { HEAD_SHA="$1" PR_AUTHOR="$2" jq -r "$FILTER" "$FIXTURE" | grep -c . || true; }
  # `sergiou87` is the fixture's only human-on-head approver; naming it as the PR
  # author leaves ONLY non-`User` reviews on that head — the identity's own shape.
  check "identity approval (Bot) does not satisfy the 🔴 predicate" 0 \
    "$(count_approvals "$HEAD" sergiou87)"
  check "the human non-author approval still counts (gate not broken)" 1 \
    "$(count_approvals "$HEAD" pr-author)"
  # A GitHub App types as `Bot`, so the TYPE clause covers it.
  BOT_TYPES="$(jq -r '[.[] | select(.user.type != "User") | .user.type] | unique | join(",")' "$FIXTURE")"
  if [ -n "$BOT_TYPES" ]; then
    log_succ "fixture carries a non-User reviewer to reject ($BOT_TYPES)"
  else
    log_fail "fixture has no non-User reviewer — the exclusion is untested"; FAILED=1
  fi

  # THE CASE THE TYPE CLAUSE DOES NOT COVER, and the reason the login clause exists.
  # A `Review identity: bot-user` is an ordinary machine account: GitHub returns
  # `user.type == "User"` for it (only App identities type as "Bot"). Asserting only
  # "a non-User review exists" would never exercise it — this fixture is that account.
  MACHINE_FIXTURE="$TMP_DIR/machine-user-approval.json"
  cat >"$MACHINE_FIXTURE" <<'JSON'
[
  {
    "id": 9001,
    "state": "APPROVED",
    "commit_id": "cc1fba122f0c912ba01288fe90ab2632e7e41057",
    "user": { "login": "acme-review-bot", "type": "User" }
  }
]
JSON
  count_in() { # count_in <fixture> <head> <author> <identity-login>
    HEAD_SHA="$2" PR_AUTHOR="$3" REVIEW_IDENTITY_LOGIN="$4" jq -r "$FILTER" "$1" | grep -c . || true
  }
  check "bot-USER machine approval, login provisioned ⇒ does NOT satisfy the 🔴 gate" 0 \
    "$(count_in "$MACHINE_FIXTURE" "$HEAD" some-author acme-review-bot)"
  check "the login clause is exact — a DIFFERENT login is not excluded (gate not over-broad)" 1 \
    "$(count_in "$MACHINE_FIXTURE" "$HEAD" some-author another-bot)"
  # Regression on the whole point: with the login provisioned, a red PR carrying ONLY a
  # machine approval must not reach a merge-enabling state.
  MACHINE_APPROVALS="$(count_in "$MACHINE_FIXTURE" "$HEAD" some-author acme-review-bot)"
  check "🔴 + gates green + APPROVED verdict + only a machine approval ⇒ still blocked" to-be-reviewed \
    "$(resolve_pr_state pass approved red "$([ "$MACHINE_APPROVALS" -ge 1 ] && echo 1 || echo 0)" 2>/dev/null)"
  # And the human path is untouched by the new clause.
  check "a human non-author approval still counts with the identity login set" 1 \
    "$(count_in "$FIXTURE" "$HEAD" pr-author acme-review-bot)"
else
  log_warn "🔴-predicate assertions skipped — jq not installed"
fi
# The predicate text itself: the two clauses that make the exclusion mechanical.
audit "the 🔴 predicate excludes non-User accounts AND the identity's login" "$EVALUATOR" \
  'user.type=="User"' 'commit_id==env.HEAD_SHA' 'user.login!=env.PR_AUTHOR' \
  'user.login!=env.REVIEW_IDENTITY_LOGIN'
# The host guide must thread that variable into the job that evaluates the predicate —
# an unthreaded clause is an inert one.
audit "the host guide threads REVIEW_IDENTITY_LOGIN into the explicit-approval job" "$GITHUB_GUIDE" \
  'REVIEW_IDENTITY_LOGIN: \${{ vars.REVIEW_IDENTITY_LOGIN }}' 'gh variable set REVIEW_IDENTITY_LOGIN'

# ==============================================================================
# DoD grep guards — the two the story names, both grep-verifiable
# ==============================================================================
# 1. No auto-approval path outside the adoption-gated light row. This is asserted on the
#    RESOLVED EVENT, not on prose: the only way a host records an approval is an APPROVE
#    event, so enumerating the event across the matrix IS the behavioral guard.
DEFS="$(grep -c '^light_auto_approve_allowed()' "$EVALUATOR")"
check "exactly one light-row definition" 1 "$DEFS"
event_for() { # event_for <labels> <declared> <gates> <verdict> <approval>
  local tier state auth=0
  tier="$(resolve_tier "$1" 2>/dev/null)"
  state="$(resolve_pr_state "$3" "$4" "$tier" "$5" 2>/dev/null)"
  light_auto_approve_allowed "$1" "$2" "$tier" "$state" 2>/dev/null && auth=1
  identity_verdict_event identity "$4" "$auth" 2>/dev/null
}
check "event: 🟢 light, declared, all green ⇒ APPROVE (the row's own review)" APPROVE \
  "$(event_for "risk:green light" 1 pass approved 0)"
check "event: 🟢 light TAGGED but UNDECLARED ⇒ COMMENT, not APPROVE" COMMENT \
  "$(event_for "risk:green light" 0 pass approved 0)"
check "event: 🟡 approved, NO light tag ⇒ COMMENT (this is the Major-finding regression)" COMMENT \
  "$(event_for "risk:yellow" 1 pass approved 0)"
check "event: 🟢 approved, no light tag, declared family ⇒ COMMENT" COMMENT \
  "$(event_for "risk:green" 1 pass approved 0)"
check "event: 🔴 light, human approved, ready-to-merge ⇒ COMMENT (light never at red)" COMMENT \
  "$(event_for "risk:red light" 1 pass approved 1)"
check "event: 🟢 light declared but gates RED ⇒ COMMENT" COMMENT \
  "$(event_for "risk:green light" 1 fail approved 0)"
check "event: changes-requested is ungated ⇒ REQUEST_CHANGES" REQUEST_CHANGES \
  "$(event_for "risk:green light" 1 pass changes-requested 0)"
# DOCUMENTATION guard (not behavioral — the behavior is the matrix above): the flow
# surfaces must not describe an auto-approval that is not qualified by 'light'.
for doc in "$REVIEW" "$PUBLISH_PR"; do
  if grep -in 'auto-approv' "$doc" | grep -qvi 'light'; then
    log_fail "$(basename "$(dirname "$doc")") DOCUMENTS an auto-approval not qualified by 'light'"
    grep -in 'auto-approv' "$doc" | grep -vi 'light'
    FAILED=1
  else
    log_succ "$(basename "$(dirname "$doc")") documents no auto-approval outside the light row"
  fi
done
# 2. No classification criteria in the approval flow (D18) — the same audit the PR
#    state flow already runs, extended to the new adapter.
CRITERIA='\b(schema|migration|git diff|--numstat|lines?[ -]changed|loc\b|files?[ -]changed|complexity|churn)\b'
for asset in "$IDENTITY" "$EVALUATOR"; do
  if grep -Eiq "$CRITERIA" "$asset"; then
    log_fail "$(basename "$asset") leaks classification criteria"; grep -Ein "$CRITERIA" "$asset"; FAILED=1
  else
    log_succ "$(basename "$asset") contains no classification criteria"
  fi
done
if grep -Eiq 'lightness|compute[sd]? .{0,20}light|how light' "$EVALUATOR" "$IDENTITY"; then
  log_fail "the light row computes lightness instead of reading a tag"; FAILED=1
else
  log_succ "the light row never computes 'lightness' — it reads a tag (D18)"
fi

# ==============================================================================
# Doc/skill wiring — the adapter is only real if the flow composes it
# ==============================================================================
audit "review resolves the acting identity and HALTs rather than falling back" "$REVIEW" \
  'review-identity.sh' 'resolve_identity_mode' 'identity_verdict_event' 'HALT' \
  'review_identity_exclusion_ok'
audit "publish-pr requires the identity to be mechanically excluded before it acts" "$PUBLISH_PR" \
  'review_identity_exclusion_ok'
audit "pr-states.md states the exclusion as TWO clauses, not one" "$GUIDELINE" \
  'REVIEW_IDENTITY_LOGIN' 'review_identity_exclusion_ok'
audit "the ADR amendment records the predicate change and the APPROVE authority" "$ADR" \
  'REVIEW_IDENTITY_LOGIN' 'identity_verdict_event'
audit "review publishes pair-review through the resolved mode + audits the action" "$REVIEW" \
  'pair_review_publication_mode' 'identity_audit_comment' 'light_auto_approve_allowed'
audit "publish-pr resolves the identity for its own host writes" "$PUBLISH_PR" \
  'review-identity.sh' 'resolve_identity_mode' 'Dedicated review identity'
audit "pr-states.md carries the identity actor + the 🔴 one-liner" "$GUIDELINE" \
  'Dedicated review identity' 'never counts as the explicit human approval' 'light'
audit "github guide carries the per-host setup (App recommended + bot user)" "$GITHUB_GUIDE" \
  'Dedicated review identity' 'GitHub App' 'bot user' 'pull_requests: write' 'checks: write'
audit "way-of-working template declares the Review identity key" "$WOW_TEMPLATE" \
  'Review identity' 'none'
# ROUND 12. "all three modes" was false for one of the three it enumerated: `halt` ends the
# review in step 1 of the same list ("No host write happens on this path"), so the
# synthesis cannot run there. The claim it needs to make is the one about NESTING.
audit "the state synthesis is unconditional across the modes that CONTINUE" "$REVIEW" \
  'in \*\*both modes that continue (`session` and `identity`) and for every verdict\*\*'
if grep -q 'all three modes and for every verdict' "$REVIEW"; then
  log_fail "review still claims the synthesis runs in halt mode, which ends the review"
  FAILED=1
else
  log_succ "no surface claims the synthesis runs in halt mode"
fi

# ==============================================================================
# The shipped ADOPTION-KIND EXTRACTION is EXECUTED here, not grepped.
# ==============================================================================
# The step-6 snippet reads `Review identity` out of way-of-working itself. Adoption ships
# that key as a markdown bullet with bold markers, so an extraction anchored at
# `^Review identity:` matches NOTHING: IDENTITY_KIND falls back to `none`, a correctly
# provisioned App resolves `session` ⇒ `commit-status`, the `checks-api` guard never fires,
# and the identity publishes nothing at all — with no error surfaced. Run the shipped lines
# against the REAL files rather than asserting their text.
# ROUND 4. The extraction recognised ONLY the exact bullet+bold form and defaulted every
# other result to `none`. `none` is not neutral: it means NO identity ⇒ `session` ⇒ the
# review (and, where the host counts it, the APPROVE) is written with the SESSION token on
# a repository that DID provision one — and no HALT, because the flow never learns an
# identity was configured. The read is now two questions (presence, then value), so the
# whole slab is eval-ed, not one line.
KIND_EXTRACT="$(grep -m1 -F 'IDENTITY_KIND="$(sed -n' "$GITHUB_GUIDE")"
KIND_READ="$(awk '/# 1a\. PRESENCE/{f=1} f&&/# 2\. IDENTITY_CONFIGURED/{exit} f' "$GITHUB_GUIDE")"
extract_kind() { # extract_kind <way-of-working-file> — echoes the kind, exits 1 on the HALT
  # shellcheck disable=SC2034  # WOW is consumed by the shipped lines under eval
  local WOW="$1" IDENTITY_KIND='' IDENTITY_KEY_PRESENT=0
  eval "$KIND_READ"
  printf '%s' "$IDENTITY_KIND"
}
halts_on_kind() { # halts_on_kind <label> <way-of-working-file>
  local out
  if out="$(extract_kind "$2" 2>/dev/null)"; then
    log_fail "$1: expected HALT, got kind '$out'"; FAILED=1
  else
    log_succ "$1 => HALT (configured-but-unusable, never 'none')"
  fi
}
if [ -z "$KIND_EXTRACT" ] || [ -z "$KIND_READ" ]; then
  log_fail "the step-6 snippet no longer assigns IDENTITY_KIND — the extraction is untestable"
  FAILED=1
else
  printf -- '- **Review identity**: `app` — a GitHub App.\n' >"$TMP_DIR/wow-app.md"
  printf -- '- **Review identity**: `bot-user` — a machine account.\n' >"$TMP_DIR/wow-bot.md"
  printf -- '- **Review identity**: app\n' >"$TMP_DIR/wow-bare.md"
  printf -- '- **Something else**: nope\n' >"$TMP_DIR/wow-absent.md"
  # The two present-but-unparseable shapes an adopter hand-editing adoption produces.
  printf -- '- Review identity: app\n' >"$TMP_DIR/wow-nobold.md"
  printf -- '**Review identity**: bot-user\n' >"$TMP_DIR/wow-nobullet.md"
  check "extraction on THIS repo's way-of-working (bullet form) ⇒ none" none \
    "$(extract_kind "$REPO_ROOT/.pair/adoption/tech/way-of-working.md")"
  check "extraction on the dataset TEMPLATE every adopter receives ⇒ none" none \
    "$(extract_kind "$WOW_TEMPLATE")"
  check "a configured App adoption ⇒ app"               app "$(extract_kind "$TMP_DIR/wow-app.md")"
  check "a configured bot-user adoption ⇒ bot-user" bot-user "$(extract_kind "$TMP_DIR/wow-bot.md")"
  check "the key written without backticks ⇒ app"       app "$(extract_kind "$TMP_DIR/wow-bare.md")"
  check "the key absent ⇒ none (the documented default)" none \
    "$(extract_kind "$TMP_DIR/wow-absent.md" 2>/dev/null)"
  halts_on_kind "the key without the BOLD markers ⇒ HALT" "$TMP_DIR/wow-nobold.md"
  halts_on_kind "the key without the leading BULLET ⇒ HALT" "$TMP_DIR/wow-nobullet.md"
  # ROUND 6. PRESENCE was a bare `grep -qi 'Review identity'` over the WHOLE file, so any
  # PROSE occurrence of the phrase set IDENTITY_KEY_PRESENT=1 and the empty extraction
  # then HALTed instead of resolving `none`. A project that runs no identity, deletes the
  # key and keeps one explanatory sentence under `## Quality Gates` gets a permanent
  # review outage — and a HALT telling it to declare an identity it deliberately has not
  # got. The probe is anchored to the KEY SHAPE (the phrase, then a colon).
  printf -- '## Quality Gates\n\nwe use no dedicated review identity — reviews run with the session token\n' \
    >"$TMP_DIR/wow-prose.md"
  printf -- 'we plan to add a dedicated review identity later\n' >"$TMP_DIR/wow-prose2.md"
  check "PROSE mentioning the phrase, no key ⇒ none (never a HALT)" none \
    "$(extract_kind "$TMP_DIR/wow-prose.md" 2>/dev/null)"
  check "PROSE, second shape ⇒ none" none \
    "$(extract_kind "$TMP_DIR/wow-prose2.md" 2>/dev/null)"
  # ROUND 8. The round-6 anchor `(^|[^[:alnum:]])` was not a LINE anchor: it matched the
  # phrase-then-colon anywhere in a line, so an ordinary sentence that happens to introduce
  # the topic with a colon answered PRESENT on a project running the zero-configuration
  # default — and the empty extraction then HALTed every review and every PR publication.
  printf -- 'A note on review identity: we deliberately run none, reviews use the session token.\n' \
    >"$TMP_DIR/wow-prose3.md"
  check "PROSE with the phrase FOLLOWED BY A COLON mid-sentence ⇒ none (never a HALT)" none \
    "$(extract_kind "$TMP_DIR/wow-prose3.md" 2>/dev/null)"
  # The adapter owns the vocabulary the guide validates against.
  for k in app user bot-user none; do
    review_identity_kind_ok "$k" 2>/dev/null ||
      { log_fail "review_identity_kind_ok rejects the documented kind '$k'"; FAILED=1; }
  done
  for k in '' App bot_user session; do
    review_identity_kind_ok "$k" 2>/dev/null &&
      { log_fail "review_identity_kind_ok accepts '$k', which is not a documented kind"; FAILED=1; }
  done
  log_succ "review_identity_kind_ok accepts exactly the documented vocabulary"
  # The extracted value must be one the ADAPTER accepts: decoration left in it would make a
  # provisioned identity an unknown kind ⇒ not excluded ⇒ halt on every review.
  check "the extracted App kind routes to the Checks API" checks-api \
    "$(pair_review_publication_mode identity "$(extract_kind "$TMP_DIR/wow-app.md")" 2>/dev/null)"
  excluded "the extracted bot-user kind is accepted by the exclusion check" \
    "$(extract_kind "$TMP_DIR/wow-bot.md")" acme-review-bot
fi

# ==============================================================================
# The per-run APP HEALTH PROBES are EXECUTED here, not grepped.
# ==============================================================================
# ROUND 9. Two probes claimed more than they tested.
#   Probe 1 said "the credential authenticates AND the identity is scoped to THIS repo" and
#   tested `.total_count` only. An installation token is valid for the INSTALLATION, which
#   is org-wide: on a repo the App was never installed on the endpoint still answers 200,
#   health passes, the whole review runs, and the FIRST host write 404s.
#   Probe 3 read the PR author under "it catches the provisioning mistake before any host
#   write" and compared it to nothing — while the bot-user twin gates on it. One App used
#   as both PR publisher (`<app-slug>[bot]`) and reviewer therefore passed health and then
#   HALTed mid-write on every review it ever ran.
# Run the shipped lines with a stubbed `gh`, rather than asserting their text.
AUTH_PROBE="$(awk '/# 1\. AUTH_OK/{f=1} f&&/# 2\. PERMS_OK/{exit} f' "$GITHUB_GUIDE")"
AUTHOR_PROBE="$(awk "/# 3\. The identity must not be the PR/{f=1} f&&/^[[:space:]]*\`\`\`$/{exit} f" "$GITHUB_GUIDE")"
app_auth_ok() { # app_auth_ok <repo> <repos in the installation, newline separated>
  # shellcheck disable=SC2034  # REPO is consumed by the shipped lines under eval
  local REPO="$1" INSTALL_REPOS="$2" AUTH_OK=
  gh() { printf '%s\n' "$INSTALL_REPOS"; }
  eval "$AUTH_PROBE" || true
  unset -f gh
  printf '%s' "$AUTH_OK"
}
app_author_perms() { # app_author_perms <app-slug> <pr author> — PERMS_OK after probe 3
  # shellcheck disable=SC2034  # PR is consumed by the shipped lines under eval
  local APP_SLUG="$1" AUTHOR="$2" PERMS_OK=1 PR=1
  gh() { printf '%s\n' "$AUTHOR"; }
  eval "$AUTHOR_PROBE" 2>/dev/null || true
  unset -f gh
  printf '%s' "$PERMS_OK"
}
app_author_reason() { # app_author_reason <app-slug> <pr author> — probe 3's OWN stderr
  # shellcheck disable=SC2034  # PR is consumed by the shipped lines under eval
  local APP_SLUG="$1" AUTHOR="$2" PERMS_OK=1 PR=1
  gh() { printf '%s\n' "$AUTHOR"; }
  eval "$AUTHOR_PROBE" 2>&1 >/dev/null || true
  unset -f gh
}
if [ -z "$AUTH_PROBE" ] || [ -z "$AUTHOR_PROBE" ]; then
  log_fail "the step-6 App health probes are no longer extractable — the probes are untestable"
  FAILED=1
else
  check "App AUTH probe: this repo IS in the installation ⇒ healthy" 1 \
    "$(app_auth_ok acme/pair "$(printf 'acme/pair\nacme/other\n')")"
  check "App AUTH probe: the App was never installed on THIS repo ⇒ NOT healthy" 0 \
    "$(app_auth_ok acme/late "$(printf 'acme/pair\nacme/other\n')")"
  check "App AUTH probe: a prefix match is not membership" 0 \
    "$(app_auth_ok acme/pair "$(printf 'acme/pair-website\n')")"
  # ROUND 10. `grep -qx "$REPO"` read $REPO as a BASIC REGEX. Repo names routinely carry a
  # `.`, so `acme/pair.js` matched the listed `acme/pairXjs` ⇒ membership asserted on a repo
  # the App was never installed on, straight back into the mid-write 404.
  check "App AUTH probe: a regex metachar in the repo name is not membership" 0 \
    "$(app_auth_ok 'acme/pair.js' "$(printf 'acme/pairXjs\n')")"
  check "App author probe: an unrelated author leaves the identity healthy" 1 \
    "$(app_author_perms acme-review rucka)"
  # ROUND 10. The round-9 gate compared against `<slug>[bot]` ONLY, while the probe reads the
  # author with `gh pr view --json author` — GraphQL, which renders a Bot actor as
  # `app/<slug>`. Measured: `gh pr view 14276 --repo cli/cli --json author -q .author.login`
  # ⇒ `app/dependabot`; `gh api repos/cli/cli/pulls/14276 --jq .user.login` ⇒
  # `dependabot[bot]`. One shape only ⇒ the gate never fired on the path it guards.
  check "App author probe: the App opened the PR, GraphQL shape ⇒ NOT healthy" 0 \
    "$(app_author_perms acme-review 'app/acme-review')"
  check "App author probe: the App opened the PR, REST shape ⇒ NOT healthy" 0 \
    "$(app_author_perms acme-review 'acme-review[bot]')"
  check "App author probe: the slug unknown ⇒ unknown health ⇒ NOT healthy" 0 \
    "$(app_author_perms '' rucka)"
  # ROUND 12. Probe 3 encodes a THIRD, distinct failure ("the identity is this PR's
  # author") by zeroing PERMS_OK — the flag that means "the required grants were
  # OBSERVED". `review_identity_health` then emits the grant-shaped diagnostic
  # ("the identity's required permissions were not observed on this run"), so the operator
  # of the one-credential pipeline the guide calls the likeliest misconfiguration
  # re-inspects the App's `pull_requests`/`checks` grants, finds them correct, and has
  # nothing in the trail naming authorship. The probe must say why it fired.
  AUTHOR_REASON="$(app_author_reason acme-review 'app/acme-review')"
  if printf '%s' "$AUTHOR_REASON" | grep -qi 'author'; then
    log_succ "App author probe names AUTHORSHIP as its own reason, not a missing grant"
  else
    log_fail "App author probe fires SILENTLY — health blames the grants: '$AUTHOR_REASON'"
    FAILED=1
  fi
  check "App author probe: an unrelated author prints no reason" "" \
    "$(app_author_reason acme-review rucka)"
fi

# ==============================================================================
# The per-run BOT-USER health probe is EXECUTED here, not grepped.
# ==============================================================================
# ROUND 12 (Major). The bot-user probe's `ACTING` comparison read
# `${REVIEW_IDENTITY_LOGIN:-}` — the AGENT'S AMBIENT ENVIRONMENT — while the clause it is
# meant to arm is evaluated in the `pair-explicit-approval` workflow from the REPOSITORY
# VARIABLE (`vars.REVIEW_IDENTITY_LOGIN`). Nothing verified the two agree. An operator who
# exports the login in the shell/CI env but never runs `gh variable set` (or sets it as a
# SECRET, or scopes it to an Environment the `pull_request_target` job does not use) gets a
# HEALTHY identity, the flow runs as `identity`, and the gate job resolves the variable to
# the empty string — so the shipped predicate's clause becomes `.user.login != ""`, true
# for every account, and an APPROVED review cast by the bot outside the flow (the
# maintainer using the bot PAT, a supervisor loop, a second automation) SATISFIES the
# explicit HUMAN approval on a `risk:red` head. The variable is now the health input.
BOT_PROBE="$(awk '/^ACTING="\$\(gh api user/{f=1} f&&/^```$/{exit} f' "$GITHUB_GUIDE")"
bot_probe() { # bot_probe <acting login> <repo-variable value> <pr author> [permission]
  # shellcheck disable=SC2034  # REPO/PR are consumed by the shipped lines under eval
  local REPO=acme/pair PR=1 ACTING= AUTH_OK= PERMS_OK= PERM= RV=
  local _acting="$1" _var="$2" _author="$3" _perm="${4:-write}"
  gh() {
    case "$*" in
    "api user --jq .login") printf '%s\n' "$_acting" ;;
    *actions/variables/REVIEW_IDENTITY_LOGIN*)
      [ -n "$_var" ] || return 1
      printf '%s\n' "$_var"
      ;;
    *collaborators*) printf '%s\n' "$_perm" ;;
    *) printf '%s\n' "$_author" ;;
    esac
  }
  eval "$BOT_PROBE" 2>/dev/null || true
  unset -f gh
  printf '%s:%s' "$AUTH_OK" "$PERMS_OK"
}
bot_probe_reason() { # bot_probe_reason <acting> <repo-variable> <pr author> — the stderr
  # shellcheck disable=SC2034
  local REPO=acme/pair PR=1 ACTING= AUTH_OK= PERMS_OK= PERM= RV=
  local _acting="$1" _var="$2" _author="$3" _perm=write
  gh() {
    case "$*" in
    "api user --jq .login") printf '%s\n' "$_acting" ;;
    *actions/variables/REVIEW_IDENTITY_LOGIN*)
      [ -n "$_var" ] || return 1
      printf '%s\n' "$_var"
      ;;
    *collaborators*) printf '%s\n' "$_perm" ;;
    *) printf '%s\n' "$_author" ;;
    esac
  }
  eval "$BOT_PROBE" 2>&1 >/dev/null || true
  unset -f gh
}
if [ -z "$BOT_PROBE" ]; then
  log_fail "the bot-user per-run health probe is no longer extractable — it is untestable"
  FAILED=1
else
  check "bot probe: the repo VARIABLE names the acting account ⇒ healthy" 1:1 \
    "$(bot_probe acme-bot acme-bot rucka)"
  # THE EXPLOIT, verbatim: the env var is exported and correct, the repository variable was
  # never set. Health must be 0 — the gate-side clause is inert in exactly this state.
  check "bot probe: variable UNSET but the AMBIENT env var matches ⇒ NOT healthy" 0:1 \
    "$(REVIEW_IDENTITY_LOGIN=acme-bot bot_probe acme-bot '' rucka)"
  check "bot probe: the variable names a DIFFERENT account ⇒ NOT healthy" 0:1 \
    "$(bot_probe acme-bot other-bot rucka)"
  check "bot probe: the PAT does not authenticate ⇒ NOT healthy" 0:1 \
    "$(bot_probe '' acme-bot rucka)"
  check "bot probe: read-only collaborator ⇒ grants not observed" 1:0 \
    "$(bot_probe acme-bot acme-bot rucka read)"
  check "bot probe: the identity IS the PR author ⇒ not usable" 1:0 \
    "$(bot_probe acme-bot acme-bot acme-bot)"
  BOT_AUTHOR_REASON="$(bot_probe_reason acme-bot acme-bot acme-bot)"
  if printf '%s' "$BOT_AUTHOR_REASON" | grep -qi 'author'; then
    log_succ "bot probe names AUTHORSHIP as its own reason, not a missing grant"
  else
    log_fail "bot author check fires SILENTLY: '$BOT_AUTHOR_REASON'"
    FAILED=1
  fi
fi
# The health input the guide's publication snippet passes must be the value READ BACK from
# the repository variable, never the ambient environment.
audit "the per-run probe READS the repository variable" "$GITHUB_GUIDE" \
  'actions/variables/REVIEW_IDENTITY_LOGIN'
audit "the health call is fed that read-back value" "$GITHUB_GUIDE" '"${RV:-}")"'
if grep -q '"\${REVIEW_IDENTITY_LOGIN:-}"' "$GITHUB_GUIDE"; then
  log_fail "the guide still feeds health from the AMBIENT REVIEW_IDENTITY_LOGIN env var"
  FAILED=1
else
  log_succ "no ambient REVIEW_IDENTITY_LOGIN reaches the health input"
fi
audit "both skills name the repository variable as the login's source" "$REVIEW" \
  'repository variable'
audit "publish-pr names the repository variable as the login's source" "$PUBLISH_PR" \
  'repository variable'
# ROUND 10. `pair-review` became DUAL-FORM (check run on `app`, commit status otherwise) and
# the form is resolved independently at publish time and at review time — so switching
# `Review identity` with PRs already open leaves TWO producers on one required context.
audit "the guide covers the identity SWITCH with pull requests already open" "$GITHUB_GUIDE" \
  'CHANGING `Review identity`' 'one required context' 'superseded by the pair-review check run'
audit "publish-pr carries the one-producer transition rule" "$PUBLISH_PR" 'producer per required context'
audit "review Step 5.4 carries the one-producer transition rule" "$REVIEW" 'producer per required context'
audit "ADR-018 amendment records adoption + what is NOT changed" "$ADR" \
  'Amendment (2026-08-28)' 'light_auto_approve_allowed' 'user.type == "User"' \
  'resolve_pr_state' 'review-identity.sh'
# This repository declares `Active: risk` only — the row ships INERT here (Assumption 6).
if grep -q '^Active: risk$' "$RISK_MATRIX"; then
  log_succ "this repo declares no light projection — the row is inert here"
else
  log_fail "risk-matrix Tag Projection changed: the light row is no longer inert on this repo"; FAILED=1
fi

# ==============================================================================
# T10 — an INSTALLED project carries the adapter, the light row and the guide
# ==============================================================================
if [ -n "${KB_SOURCE_PATH:-}" ] || [ -n "${TEST_BINARY:-}" ]; then
  SOURCE_PATH="${KB_SOURCE_PATH:-$DATASET}"
  INSTALL_DIR="$(setup_workspace "review-identity-install")"
  cd "$INSTALL_DIR" || exit 1
  if run_pair install --source "$SOURCE_PATH" --offline; then
    assert_file ".pair/knowledge/assets/review-identity.sh" || FAILED=1
    assert_file ".pair/knowledge/assets/pr-state.sh" || FAILED=1
    if grep -q 'light_auto_approve_allowed' ".pair/knowledge/assets/pr-state.sh"; then
      log_succ "installed project carries the light row"
    else
      log_fail "installed pr-state.sh has no light row"; FAILED=1
    fi
    INSTALLED_GUIDE=".pair/knowledge/guidelines/collaboration/project-management-tool/github-implementation.md"
    if grep -q 'Dedicated review identity' "$INSTALLED_GUIDE"; then
      log_succ "installed project carries the identity setup guide"
    else
      log_fail "installed github-implementation.md has no identity guide"; FAILED=1
    fi
    # The installed adapter must be EXECUTABLE, not just present.
    # shellcheck source=/dev/null
    (source ".pair/knowledge/assets/review-identity.sh" &&
      [ "$(resolve_identity_mode 1 1 2>/dev/null)" = identity ]) &&
      log_succ "installed adapter is sourceable and resolves the identity mode" ||
      { log_fail "installed adapter is not usable"; FAILED=1; }
  else
    log_warn "install step skipped — 'pair install' unavailable in this run"
  fi
  cd "$REPO_ROOT" || exit 1
else
  log_warn "installed-project assertions skipped — no KB source / CLI in this run"
fi

if [ "$FAILED" -ne 0 ]; then
  log_fail "$TEST_NAME had failures"; exit 1
fi
log_succ "$TEST_NAME passed"
