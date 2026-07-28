#!/usr/bin/env bash
# OFFLINE_SAFE=true
#
# PR state flow (gate ≠ review) + pair review as a required check — verification
# scenario (story #234).
#
# Exercises the shipped, provider-agnostic synthesis evaluator end-to-end and audits
# the flow surfaces for the non-negotiable properties:
#   1. gate FIRST: a non-green gate never yields a merge-enabling state (AC2, R5.4),
#   2. synthesis: green gates + approved review ⇒ ready-to-merge; changes-requested
#      ⇒ not-approved (AC3),
#   3. 🔴 needs an explicit HUMAN approval on top (AC4, D10), untagged ⇒ 🔴 fail-safe,
#   4. the pair review is a REQUIRED check — a pending/missing verdict blocks the
#      merge (AC5, R5.7), and
#   5. the flow reads TAGS only — no classification criteria (D18), grep-verifiable.
#
# Per the gate-tooling ADL (2026-07-13) this shell/doc surface is verified with a
# smoke test, not a vitest unit test; the content invariants of the same surfaces are
# asserted in packages/knowledge-hub/src/conformance/pr-state-flow.test.ts.
source "$(dirname "$0")/../lib/utils.sh"
ensure_tmp_dir

TEST_NAME="PR State Flow (gate != review)"
echo "=== Running $TEST_NAME ==="

REPO_ROOT="${REPO_ROOT:-$(cd "$(dirname "$0")/../../.." && pwd)}"
DATASET="$REPO_ROOT/packages/knowledge-hub/dataset"
EVALUATOR="$DATASET/.pair/knowledge/assets/pr-state.sh"
TIER_RESOLVER="$DATASET/.pair/knowledge/assets/tier-resolve.sh"
GUIDELINE="$DATASET/.pair/knowledge/guidelines/collaboration/project-management-tool/pr-states.md"
GITHUB_GUIDE="$DATASET/.pair/knowledge/guidelines/collaboration/project-management-tool/github-implementation.md"
PUBLISH_PR="$DATASET/.skills/capability/publish-pr/SKILL.md"
REVIEW="$DATASET/.skills/process/review/SKILL.md"
MERGE_CASCADE="$DATASET/.skills/process/review/merge-and-cascade.md"
SETUP_GATES="$DATASET/.skills/capability/setup-gates/SKILL.md"

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

for f in "$EVALUATOR" "$TIER_RESOLVER" "$GUIDELINE" "$GITHUB_GUIDE" "$PUBLISH_PR" "$REVIEW" "$MERGE_CASCADE" "$SETUP_GATES"; do
  assert_file "$f" || exit 1
done

# shellcheck source=/dev/null
source "$TIER_RESOLVER"
# shellcheck source=/dev/null
source "$EVALUATOR"

# --- AC3: the happy paths (green gates + approved review) ---
check "🟢 gates green + approved"        ready-to-merge "$(resolve_pr_state pass approved green 0 2>/dev/null)"
check "🟡 gates green + approved"        ready-to-merge "$(resolve_pr_state pass approved yellow 0 2>/dev/null)"
check "tech-debt verdict is approving"  ready-to-merge "$(resolve_pr_state pass tech-debt yellow 0 2>/dev/null)"

# --- AC3: a changes-requested verdict routes to a human ---
check "changes-requested"               not-approved "$(resolve_pr_state pass changes-requested green 0 2>/dev/null)"
check "changes-requested + red gate"    not-approved "$(resolve_pr_state fail changes-requested green 0 2>/dev/null)"

# --- AC2: the gate is the FIRST filter — judgment never unlocks a red gate (R5.4) ---
check "red gate + approved review"      to-be-reviewed "$(resolve_pr_state fail approved green 1 2>/dev/null)"
check "pending gate + approved review"  to-be-reviewed "$(resolve_pr_state pending approved green 1 2>/dev/null)"
check "unknown gate signal (fail-safe)" to-be-reviewed "$(resolve_pr_state '' approved green 1 2>/dev/null)"
if resolve_pr_state fail approved green 1 2>&1 >/dev/null | grep -q 'first filter'; then
  log_succ "red gate warns that the gate is the first filter"
else
  log_fail "red gate did not warn (gate-first invariant not surfaced)"; FAILED=1
fi

# --- AC5: a review that never produced a decision blocks the merge (R5.7) ---
check "review pending"                  to-be-reviewed "$(resolve_pr_state pass pending green 0 2>/dev/null)"
check "review missing"                  to-be-reviewed "$(resolve_pr_state pass missing green 0 2>/dev/null)"
check "review crashed/errored"          to-be-reviewed "$(resolve_pr_state pass error green 0 2>/dev/null)"

# --- AC4: 🔴 additionally requires an explicit human approval (D10) ---
check "🔴 approved, no human approval"  to-be-reviewed "$(resolve_pr_state pass approved red 0 2>/dev/null)"
check "🔴 approved + human approval"    ready-to-merge "$(resolve_pr_state pass approved red 1 2>/dev/null)"
check "🟡→🔴 raise re-blocks"           to-be-reviewed "$(resolve_pr_state pass approved red 0 2>/dev/null)"

# --- Fail-safe: untagged / malformed tier is treated as 🔴 ---
check "untagged tier (fail-safe red)"   to-be-reviewed "$(resolve_pr_state pass approved '' 0 2>/dev/null)"
check "malformed tier (fail-safe red)"  to-be-reviewed "$(resolve_pr_state pass approved banana 0 2>/dev/null)"
check "untagged + human approval"       ready-to-merge "$(resolve_pr_state pass approved '' 1 2>/dev/null)"
if resolve_pr_state pass approved '' 0 2>&1 >/dev/null | grep -q 'fail-safe'; then
  log_succ "untagged tier emits the fail-safe warning"
else
  log_fail "untagged tier did not warn"; FAILED=1
fi

# --- Per-tier requirement lookup (the quality-model §4 row, projected) ---
if explicit_approval_required red 2>/dev/null; then log_succ "🔴 requires explicit approval"; else log_fail "🔴 did not require explicit approval"; FAILED=1; fi
if explicit_approval_required green 2>/dev/null; then log_fail "🟢 wrongly requires explicit approval"; FAILED=1; else log_succ "🟢 does not require explicit approval"; fi
if explicit_approval_required yellow 2>/dev/null; then log_fail "🟡 wrongly requires explicit approval"; FAILED=1; else log_succ "🟡 does not require explicit approval"; fi
if explicit_approval_required '' 2>/dev/null; then log_succ "untagged requires explicit approval (fail-safe)"; else log_fail "untagged did not require explicit approval"; FAILED=1; fi

# --- merge_allowed: only ready-to-merge passes, never a silent pass ---
if merge_allowed ready-to-merge 2>/dev/null; then log_succ "ready-to-merge allows the merge"; else log_fail "ready-to-merge was blocked"; FAILED=1; fi
for state in to-be-reviewed not-approved '' garbage; do
  if merge_allowed "$state" 2>/dev/null; then
    log_fail "state '${state:-<empty>}' allowed a merge (silent pass)"; FAILED=1
  else
    log_succ "state '${state:-<empty>}' blocks the merge"
  fi
done

# --- The required `pair-review` check conclusion mapping (AC5) ---
check "approved => success"             success "$(review_check_conclusion approved 2>/dev/null)"
check "tech-debt => success"            success "$(review_check_conclusion tech-debt 2>/dev/null)"
check "changes-requested => failure"    failure "$(review_check_conclusion changes-requested 2>/dev/null)"
check "no decision => pending"          pending "$(review_check_conclusion '' 2>/dev/null)"
check "crashed => pending"              pending "$(review_check_conclusion crashed 2>/dev/null)"

# --- Tags-only composition: PR labels -> tier -> state (no criteria anywhere) ---
PR_LABELS="risk:red user story"
check "labels->tier->state (🔴, no approval)" to-be-reviewed \
  "$(resolve_pr_state pass approved "$(resolve_tier "$PR_LABELS" 2>/dev/null)" 0 2>/dev/null)"
PR_LABELS="risk:green"
check "labels->tier->state (🟢)"             ready-to-merge \
  "$(resolve_pr_state pass approved "$(resolve_tier "$PR_LABELS" 2>/dev/null)" 0 2>/dev/null)"
PR_LABELS=""
check "labels->tier->state (untagged ⇒ 🔴)"  to-be-reviewed \
  "$(resolve_pr_state pass approved "$(resolve_tier "$PR_LABELS" 2>/dev/null)" 0 2>/dev/null)"

# --- D18 grep audit: neither the evaluator nor the guideline's code blocks carry
# classification criteria. The flow decides nothing about risk — it reads the tag.
CRITERIA='\b(schema|migration|git diff|--numstat|lines?[ -]changed|loc\b|files?[ -]changed)\b'
if grep -Eiq "$CRITERIA" "$EVALUATOR"; then
  log_fail "evaluator leaks classification criteria"; grep -Ein "$CRITERIA" "$EVALUATOR"; FAILED=1
else
  log_succ "evaluator contains no classification criteria"
fi
# fenced code blocks only (prose legitimately names the invariant)
for doc in "$GUIDELINE" "$GITHUB_GUIDE"; do
  CODE="$(awk '/^```/{infb=!infb; next} infb' "$doc")"
  if printf '%s\n' "$CODE" | grep -Eiq "$CRITERIA"; then
    log_fail "$(basename "$doc") code blocks leak classification criteria"
    printf '%s\n' "$CODE" | grep -Ein "$CRITERIA"; FAILED=1
  else
    log_succ "$(basename "$doc") code blocks contain no classification criteria"
  fi
done

# --- Doc/skill wiring audits (the flow is only real if the skills compose it) ---
audit "pr-states.md defines the three states + the gate≠review split" "$GUIDELINE" \
  'to-be-reviewed' 'ready-to-merge' 'not-approved' 'zero judgment' 'zero mechanical' 'R5.4' 'R5.7' 'D10' 'D18'
audit "publish-pr registers pair-review pending + dispatches a clean-context review" "$PUBLISH_PR" \
  'pair-review' 'pr-state:to-be-reviewed' 'subagent' 'pr-states.md'
audit "review publishes the check + synthesizes the state via the shipped evaluator" "$REVIEW" \
  'pr-state.sh' 'resolve_pr_state' 'review_check_conclusion' 'pr-state:ready-to-merge' 'quality-model.md'
audit "merge is gated on ready-to-merge (HALT otherwise)" "$MERGE_CASCADE" \
  'merge_allowed' 'ready-to-merge' 'HALT'
audit "setup-gates wires both pair required checks + degraded mode" "$SETUP_GATES" \
  'pair-review' 'pair-explicit-approval' 'DEGRADED'
audit "github guide carries the status + branch-protection recipe" "$GITHUB_GUIDE" \
  'pair-review' 'pair-explicit-approval' 'required_status_checks' 'dismiss_stale_reviews' \
  'statuses/\$HEAD_SHA' 'user.type=="User"' 'gh label create "pr-state:' \
  'required_approving_review_count": 0'

# The publication command must be runnable with the ORDINARY token the skills hold:
# POST /check-runs is GitHub-App-only (403), so no command may call it, and the
# non-existent `author.is_bot` field must not be filtered on anywhere.
if grep -q 'repos/\$OWNER/\$REPO/check-runs' "$GITHUB_GUIDE"; then
  log_fail "github guide still publishes via the App-only check-runs API"; FAILED=1
else
  log_succ "github guide publishes pair-review via the commit-statuses API"
fi
if grep -q 'is_bot' "$GITHUB_GUIDE"; then
  log_fail "github guide still filters on the non-existent author.is_bot field"; FAILED=1
else
  log_succ "github guide does not rely on a non-existent is_bot field"
fi

# --- The `pair-explicit-approval` job must read the tag only and demand a HUMAN
# approval on the CURRENT head (a bot/self approval can never satisfy 🔴). ---
if grep -q 'resolve_tier' "$GITHUB_GUIDE" && grep -q 'explicit_approval_required' "$GITHUB_GUIDE" \
  && grep -q 'HEAD_SHA' "$GITHUB_GUIDE"; then
  log_succ "explicit-approval job resolves the tag and pins the approval to the current head"
else
  log_fail "explicit-approval job lost the tag resolution / head pinning"; FAILED=1
fi

# --- EXECUTED host assertions (read-only) -----------------------------------
# The recipe is only real if the host API behaves as documented; doc-content
# invariants alone cannot catch an endpoint that refuses the skills' token or a
# field that does not exist. These probes are READ-ONLY (no status published, no
# label created, no protection written) and are SKIPPED — never failed — without
# gh/token/network, so offline and unauthenticated CI runs stay green.
if [ "${IS_OFFLINE:-false}" != "true" ] && command -v gh >/dev/null 2>&1 &&
  gh auth status >/dev/null 2>&1; then
  PROBE_REPO="${PAIR_HOST_PROBE_REPO:-$(gh repo view --json nameWithOwner -q .nameWithOwner 2>/dev/null)}"
  if [ -z "$PROBE_REPO" ]; then
    log_warn "host probe skipped — no repository resolvable"
  else
    # 1. The commit-statuses surface (where `pair-review` is published) is reachable
    #    with the ordinary token. The Checks API is not — hence the statuses recipe.
    PROBE_SHA="$(git -C "$REPO_ROOT" rev-parse HEAD 2>/dev/null || true)"
    if [ -n "$PROBE_SHA" ] &&
      gh api "repos/$PROBE_REPO/commits/$PROBE_SHA/status" --jq '.state' >/dev/null 2>&1; then
      log_succ "host: commit-statuses API reachable with the agent token ($PROBE_REPO)"
    else
      log_warn "host probe skipped — commit-statuses read not available for $PROBE_SHA"
    fi

    # 2. The approval query's fields exist on the REST reviews payload
    #    (`commit_id` + `user.type`) — the only endpoint carrying both.
    #    Prefer a PR of this repo; fall back to a public reference PR whose review
    #    payload is immutable (override with PAIR_HOST_PROBE_REVIEW_REF=owner/repo#N).
    PROBE_PR="" PROBE_PR_REPO="$PROBE_REPO"
    for n in $(gh api "repos/$PROBE_REPO/pulls?state=all&per_page=10" --jq '.[].number' 2>/dev/null); do
      if [ "$(gh api "repos/$PROBE_REPO/pulls/$n/reviews?per_page=1" --jq 'length' 2>/dev/null)" = "1" ]; then
        PROBE_PR="$n"
        break
      fi
    done
    if [ -z "$PROBE_PR" ]; then
      REF="${PAIR_HOST_PROBE_REVIEW_REF:-cli/cli#13981}"
      PROBE_PR_REPO="${REF%%#*}" PROBE_PR="${REF##*#}"
      log_info "no reviewed PR on $PROBE_REPO — probing the reference payload $REF"
    fi
    SHAPE="$(gh api "repos/$PROBE_PR_REPO/pulls/$PROBE_PR/reviews?per_page=1" \
      --jq '.[0] | (has("commit_id") and has("state") and (.user | has("type")))' 2>/dev/null)"
    if [ -z "$SHAPE" ]; then
      log_warn "host probe skipped — reviews payload unreachable for $PROBE_PR_REPO#$PROBE_PR"
    else
      check "host: reviews REST payload carries commit_id + user.type" true "$SHAPE"
      # 3. The trap the recipe documents: `gh pr view --json reviews` carries NO bot
      #    flag, so a bot-exclusion filter there silently yields zero approvals.
      HAS_BOT_FLAG="$(gh pr view "$PROBE_PR" --repo "$PROBE_PR_REPO" --json reviews \
        --jq '.reviews[0].author | has("is_bot")' 2>/dev/null)"
      check "host: gh pr view reviews exposes no bot flag (trap confirmed)" false "$HAS_BOT_FLAG"
    fi
  fi
else
  log_warn "host probes skipped — offline or gh not authenticated (doc invariants still asserted)"
fi

if [ "$FAILED" -ne 0 ]; then
  log_fail "$TEST_NAME had failures"; exit 1
fi
log_succ "$TEST_NAME passed"
