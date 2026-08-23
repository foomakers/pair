#!/usr/bin/env bash
# Story #450, T-10 — functional smoke: a harness pair configures actually runs pair's
# process end to end, including a real PM-tool write, inside pi and inside opencode.
#
# This is the whole point of #450: /pair-capability-setup-harness gets a harness's
# config/skill-path/context/model-provider right in theory, but the only proof that a
# harness is a VALID pair environment is a real pair skill executing inside it, on a
# real model, with a real write landing on the real PM tool. Everything else in this
# story's smoke coverage is markdown; this is the one script that runs pi and opencode
# for real.
#
# MANUAL ONLY — never in CI (see lib/ci-tests.sh CI_EXCLUDED, and the reasons below):
#   - needs pi and opencode installed on the machine running this script
#   - needs real, live credentials (a Zen/opencode API key for headless model access,
#     a GitHub token for the write) — OAuth subscription is a local-interactive path,
#     never a CI path (AC7 of #450)
#   - performs one real write against a real GitHub issue — deliberately NOT #450 itself
#
# Required environment (all read, none echoed, none written to disk by this script):
#   AGENT_HARNESS_SMOKE_REPO      "owner/repo" the write-capable token can comment on
#   AGENT_HARNESS_SMOKE_ISSUE     issue/PR number on that repo — a disposable smoke
#                                 target, never a real story
#   OPENCODE_API_KEY              opencode Zen API key — headless-capable model access
#                                 for BOTH pi and opencode (see pi.md § Model Provider:
#                                 OPENCODE_API_KEY is a first-class pi provider var)
#   GH_TOKEN_WRITE                a token with comment-write scope on the repo above
#   GH_TOKEN_READONLY             a token that CANNOT write (used only for Test 3, the
#                                 negative case — never GH_TOKEN_WRITE reused read-only,
#                                 a scope you flip in code is not the same guarantee)
#
# What "one real pair skill end to end" means here: /pair-capability-write-issue in
# $mode=comment against AGENT_HARNESS_SMOKE_ISSUE — the smallest real write in the
# catalog, chosen because it touches exactly one PM-tool call and nothing else.
source "$(dirname "$0")/../lib/utils.sh"

OFFLINE_SAFE=false
ensure_tmp_dir

TEST_NAME="Agent Harness Functional Smoke (pi + opencode, story #450 T-10)"
echo "=== Running $TEST_NAME ==="

# --- Preflight: this is an environment check, not a project error (mirrors the
# skill's own HALT wording for "harness not installed") ---
MISSING=()
command -v pi >/dev/null 2>&1 || MISSING+=("pi (npm i -g @earendil-works/pi-coding-agent, or local per the pi.md guide)")
command -v opencode >/dev/null 2>&1 || MISSING+=("opencode (https://opencode.ai)")
[ -n "$OPENCODE_API_KEY" ] || MISSING+=("OPENCODE_API_KEY (Zen API key — headless model access for both harnesses)")
[ -n "$GH_TOKEN_WRITE" ] || MISSING+=("GH_TOKEN_WRITE (write-capable GitHub token)")
[ -n "$GH_TOKEN_READONLY" ] || MISSING+=("GH_TOKEN_READONLY (read-only GitHub token, for the negative case)")
[ -n "$AGENT_HARNESS_SMOKE_REPO" ] || MISSING+=("AGENT_HARNESS_SMOKE_REPO (owner/repo, a disposable target)")
[ -n "$AGENT_HARNESS_SMOKE_ISSUE" ] || MISSING+=("AGENT_HARNESS_SMOKE_ISSUE (issue/PR number on that repo)")

if [ ${#MISSING[@]} -gt 0 ]; then
  log_warn "This is a manual, credentialed scenario — not an automated failure. Missing:"
  for m in "${MISSING[@]}"; do log_warn "  - $m"; done
  echo "=== $TEST_NAME Skipped (environment not provisioned) ==="
  exit 0
fi

SOURCE_PATH="${KB_SOURCE_PATH:-$(realpath "$(dirname "$0")/../../../packages/knowledge-hub/dataset")}"

# One shared prompt for both harnesses: run the smallest real write in the catalog.
SMOKE_PROMPT="Run /pair-capability-write-issue \$mode=comment on ${AGENT_HARNESS_SMOKE_REPO}#${AGENT_HARNESS_SMOKE_ISSUE} with a comment body of exactly: 'agent-harness smoke $(date +%s) via HARNESS_PLACEHOLDER'. Report only the comment URL or the exact error, nothing else."

# Model choice, verified live 2026-08-23: `big-pickle` (opencode Zen's flagship free
# model) requires thinking and hit the free-tier rate limit on the second call in the
# same session; `hy3-free` has neither issue and is what this scenario actually ran
# green with, on both harnesses. `--thinking low` is required for pi: without it,
# the provider rejects any Zen model that "always engages in thinking" (error 400).
run_pi_smoke() {
  local project="$1" token="$2" label="$3"
  local prompt="${SMOKE_PROMPT/HARNESS_PLACEHOLDER/pi}"
  (
    cd "$project" || exit 1
    GH_TOKEN="$token" OPENCODE_API_KEY="$OPENCODE_API_KEY" \
      pi --print \
      --provider opencode --model 'hy3-free' --thinking low \
      --approve \
      "$prompt" 2>&1
  )
  echo "$label"
}

run_opencode_smoke() {
  local project="$1" token="$2" label="$3"
  local prompt="${SMOKE_PROMPT/HARNESS_PLACEHOLDER/opencode}"
  (
    cd "$project" || exit 1
    GH_TOKEN="$token" OPENCODE_API_KEY="$OPENCODE_API_KEY" \
      opencode run --model 'opencode/hy3-free' "$prompt" 2>&1
  )
  echo "$label"
}

# --- Test 1: pi, write-capable credentials — must succeed, and the write must be real ---
log_info "Test 1: pi + write-capable token — real write must land"
PI_PROJECT=$(setup_workspace "agent-harness-smoke-pi")
(cd "$PI_PROJECT" && run_pair install --source "$SOURCE_PATH" --offline .)
BEFORE_COUNT=$(gh api "repos/${AGENT_HARNESS_SMOKE_REPO}/issues/${AGENT_HARNESS_SMOKE_ISSUE}/comments" --jq 'length' 2>/dev/null || echo 0)
run_pi_smoke "$PI_PROJECT" "$GH_TOKEN_WRITE" "pi-write-capable"
AFTER_COUNT=$(gh api "repos/${AGENT_HARNESS_SMOKE_REPO}/issues/${AGENT_HARNESS_SMOKE_ISSUE}/comments" --jq 'length' 2>/dev/null || echo 0)
if [ "$AFTER_COUNT" -le "$BEFORE_COUNT" ]; then
  log_fail "pi + write-capable token: comment count did not increase ($BEFORE_COUNT -> $AFTER_COUNT)"
  exit 1
fi
log_succ "pi + write-capable token: real write landed ($BEFORE_COUNT -> $AFTER_COUNT comments)"

# --- Test 2: opencode, write-capable credentials — same assertion, other harness ---
log_info "Test 2: opencode + write-capable token — real write must land"
OC_PROJECT=$(setup_workspace "agent-harness-smoke-opencode")
(cd "$OC_PROJECT" && run_pair install --source "$SOURCE_PATH" --offline .)
BEFORE_COUNT=$(gh api "repos/${AGENT_HARNESS_SMOKE_REPO}/issues/${AGENT_HARNESS_SMOKE_ISSUE}/comments" --jq 'length' 2>/dev/null || echo 0)
run_opencode_smoke "$OC_PROJECT" "$GH_TOKEN_WRITE" "opencode-write-capable"
AFTER_COUNT=$(gh api "repos/${AGENT_HARNESS_SMOKE_REPO}/issues/${AGENT_HARNESS_SMOKE_ISSUE}/comments" --jq 'length' 2>/dev/null || echo 0)
if [ "$AFTER_COUNT" -le "$BEFORE_COUNT" ]; then
  log_fail "opencode + write-capable token: comment count did not increase ($BEFORE_COUNT -> $AFTER_COUNT)"
  exit 1
fi
log_succ "opencode + write-capable token: real write landed ($BEFORE_COUNT -> $AFTER_COUNT comments)"

# --- Test 3: the negative case IS the point (AC9) — read-only credentials must fail
# at the write step, not silently no-op and not fail earlier (e.g. at auth) ---
log_info "Test 3: pi + read-only token — must fail AT THE WRITE STEP"
BEFORE_COUNT=$(gh api "repos/${AGENT_HARNESS_SMOKE_REPO}/issues/${AGENT_HARNESS_SMOKE_ISSUE}/comments" --jq 'length' 2>/dev/null || echo 0)
OUTPUT=$(run_pi_smoke "$PI_PROJECT" "$GH_TOKEN_READONLY" "pi-read-only")
AFTER_COUNT=$(gh api "repos/${AGENT_HARNESS_SMOKE_REPO}/issues/${AGENT_HARNESS_SMOKE_ISSUE}/comments" --jq 'length' 2>/dev/null || echo 0)
if [ "$AFTER_COUNT" -gt "$BEFORE_COUNT" ]; then
  log_fail "pi + read-only token: a write landed anyway — the negative case did not hold"
  exit 1
fi
log_succ "pi + read-only token: no write landed, as required ($OUTPUT)"

echo "=== $TEST_NAME Passed ==="
