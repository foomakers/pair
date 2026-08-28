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
check "session mode + approved ⇒ COMMENT (self-approval rejected by the host)" COMMENT \
  "$(identity_verdict_event session approved 1 2>/dev/null)"
check "session mode + changes-requested ⇒ COMMENT"           COMMENT \
  "$(identity_verdict_event session changes-requested 0 2>/dev/null)"
check "unknown mode ⇒ COMMENT (never a native verdict on an unresolved actor)" COMMENT \
  "$(identity_verdict_event '' approved 1 2>/dev/null)"

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

# Adoption is the gate — a hand-applied label on a repo declaring no projection is inert.
blocks "tagged but adoption declares NO light family"   "$LIGHT_LABELS" 0 green ready-to-merge
blocks "tagged, declaration flag absent entirely"       "$LIGHT_LABELS" '' green ready-to-merge
blocks "tagged, declaration flag malformed"             "$LIGHT_LABELS" yes   green ready-to-merge
# The label must be the light tag itself, not a substring of another label.
blocks "declared but PR carries no light tag"           "risk:green user story" 1 green ready-to-merge
blocks "declared, a label merely CONTAINING 'light'"    "risk:green lightweight" 1 green ready-to-merge
blocks "declared, no labels at all"                     "" 1 green ready-to-merge

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
