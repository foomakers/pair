#!/usr/bin/env bash
# OFFLINE_SAFE=true
#
# pr-tree-resolve.sh — the shipped tree/PR-state resolver, EXECUTED end-to-end (story #382).
#
# `verify-quality` Step 1.5 answers two independent questions before it runs a gate:
# WHICH PR the tier tags come from, and WHICH CODE the suites actually ran against. That
# resolution used to live as a ~90-line snippet inline in the skill's markdown, where
# nothing could execute it — every property (the commit compare, the `ahead` arm, the
# skipped read with no remote, the two `unknown` spellings) was only ever asserted as
# TEXT. It now ships as an executable asset next to `pr-state.sh` / `tier-resolve.sh`,
# and this scenario runs it against real git repositories with a stubbed code-host read.
#
# Per the gate-tooling ADL (2026-07-13) a shipped shell asset is verified by a smoke
# test, never by a vitest unit test; the asset's CONTENT invariants (it is cited by the
# skill, both KB trees carry the same bytes, the value set matches the report's arms)
# are asserted in packages/knowledge-hub/src/conformance/verify-quality.test.ts.
source "$(dirname "$0")/../lib/utils.sh"
ensure_tmp_dir

TEST_NAME="PR tree/state resolution (verify-quality Step 1.5)"
echo "=== Running $TEST_NAME ==="

REPO_ROOT="${REPO_ROOT:-$(cd "$(dirname "$0")/../../.." && pwd)}"
DATASET="$REPO_ROOT/packages/knowledge-hub/dataset"
RESOLVER="$DATASET/.pair/knowledge/assets/pr-tree-resolve.sh"
INSTALLED="$REPO_ROOT/.pair/knowledge/assets/pr-tree-resolve.sh"
TIER_RESOLVER="$DATASET/.pair/knowledge/assets/tier-resolve.sh"

FAILED=0
check() { # check <description> <expected> <actual>
  if [ "$2" = "$3" ]; then log_succ "$1 => $3"; else log_fail "$1: expected '$2' got '$3'"; FAILED=1; fi
}
contains() { # contains <description> <needle> <haystack>
  case "$3" in
  *"$2"*) log_succ "$1" ;;
  *)
    log_fail "$1: '$3' does not contain '$2'"
    FAILED=1
    ;;
  esac
}

for f in "$RESOLVER" "$INSTALLED" "$TIER_RESOLVER"; do
  assert_file "$f" || exit 1
done

# The two KB trees ship the SAME resolver: the skill's link resolves to the installed
# copy, so a drift between them would run different code than the one under test here.
if diff -q "$RESOLVER" "$INSTALLED" >/dev/null; then
  log_succ "dataset and installed copies of pr-tree-resolve.sh are byte-equal"
else
  log_fail "pr-tree-resolve.sh differs between the dataset and the installed KB"
  FAILED=1
fi

# shellcheck source=/dev/null
source "$RESOLVER"
# shellcheck source=/dev/null
source "$TIER_RESOLVER"

# --- Identifier normalization: every form this corpus writes a PR reference in ---
check "bare number"                 420 "$(normalize_pr_id 420)"
check "the #N spelling"             420 "$(normalize_pr_id '#420')"
check "a PR url"                    420 "$(normalize_pr_id 'https://github.com/o/r/pull/420')"
check "a url with a trailing path"  420 "$(normalize_pr_id 'https://github.com/o/r/pull/420/files')"
check "a url with a fragment"       420 "$(normalize_pr_id 'https://github.com/o/r/pull/420#issuecomment-98765')"
check "gitlab merge_requests"       7 "$(normalize_pr_id 'https://gitlab.com/o/r/-/merge_requests/7')"
check "bitbucket pull-requests"     9 "$(normalize_pr_id 'https://bitbucket.org/o/r/pull-requests/9')"
check "unrecognized ⇒ verbatim"     not-a-pr "$(normalize_pr_id 'not-a-pr')"
check "empty ⇒ empty"               "" "$(normalize_pr_id '')"

# --- A repository with NO code-host remote: the read is SKIPPED, not failed ---
WORK="$(setup_workspace pr-tree-resolve)"
NO_REMOTE="$WORK/no-remote"
mkdir -p "$NO_REMOTE"
(
  cd "$NO_REMOTE" || exit 1
  git init -q -b main .
  git config user.email smoke@example.com
  git config user.name smoke
  echo one >a.txt && git add a.txt && git commit -qm one
) || exit 1

cd "$NO_REMOTE" || exit 1
# A stub that would EXPLODE if called: the whole point of the arm is that no read happens.
pr_view_json() {
  echo "the read must be skipped with no remote" >&2
  return 1
}
resolve_pr_tree ""
check "no remote ⇒ its own tree state"   no-remote "$TREE_MATCH"
check "no remote ⇒ the flag is raised"   1 "$NO_CODE_HOST"
check "no remote ⇒ provably no PR"       1 "$NO_PR_ON_BRANCH"
check "no remote ⇒ nothing was read"     0 "$PR_READ_OK"
contains "no-remote row names the missing configuration" "no code-host remote (no PR to read)" "$(render_tree_row)"
contains "no-remote row pins the local commit" "$(git rev-parse --short HEAD)" "$(render_tree_row)"

# --- A repository WITH a remote: every arm of the compare, against a stubbed host ---
REPO="$WORK/repo"
mkdir -p "$REPO"
(
  cd "$REPO" || exit 1
  git init -q -b feature/US-382 .
  git config user.email smoke@example.com
  git config user.name smoke
  echo one >a.txt && git add a.txt && git commit -qm one
  echo two >a.txt && git add a.txt && git commit -qm two
  git remote add origin https://example.invalid/o/r.git
  git checkout -q -b divergent HEAD~1
  echo other >b.txt && git add b.txt && git commit -qm divergent
  git checkout -q feature/US-382
) || exit 1

cd "$REPO" || exit 1
HEAD_SHA="$(git rev-parse HEAD)"
PARENT_SHA="$(git rev-parse HEAD~1)"
DIVERGENT_SHA="$(git rev-parse divergent)"
CALL_LOG="$WORK/pr_view_json.calls"

# The override hook the routing table needs: another code host (or this test) replaces the
# ONE read, and the resolver binds it at call time — nothing else has to be rewritten.
stub_read() { # stub_read <head-sha> [label...]
  local sha="$1"
  shift
  local labels="$*"
  eval "pr_view_json() {
    printf '%s\n' \"\${1:-<no-arg>}\" >>'$CALL_LOG'
    printf '%s\n' 'feature/US-382' '$sha' '420'
    for l in $labels; do printf '%s\n' \"\$l\"; done
  }"
}

: >"$CALL_LOG"
stub_read "$HEAD_SHA" risk:yellow pr-state:to-be-reviewed
resolve_pr_tree ""
check "checked out AT the PR head ⇒ match" match "$TREE_MATCH"
check "the read succeeded"                 1 "$PR_READ_OK"
check "the PR number comes from the read"  420 "$PR_NUM"
check "exactly ONE round trip"             1 "$(wc -l <"$CALL_LOG" | tr -d ' ')"
contains "match row names the PR head" "matches PR #420's head (feature/US-382@$(printf '%s' "$HEAD_SHA" | cut -c1-7))" "$(render_tree_row)"
# The labels the ONE read already fetched feed the tier resolver — no second round trip.
check "the labels feed resolve_tier"       yellow "$(resolve_tier "$PR_LABELS" 2>/dev/null)"

# The cost the record STATES, executed: nothing is memoized between calls. Two calls make
# two reads — so the price is one read per RUN (one host timeout per task gate when the host
# is configured but unreachable), never "once per session". A record promising a bound this
# loop disproves would be asking the merge gate to accept a cost nothing implements.
: >"$CALL_LOG"
stub_read "$HEAD_SHA" risk:yellow
resolve_pr_tree ""
resolve_pr_tree ""
check "no memoization: two calls ⇒ two reads" 2 "$(wc -l <"$CALL_LOG" | tr -d ' ')"

# …and the mitigation the skill DOES point at works: a session that must run against a
# configured but unreachable host installs its own fail-fast `pr_view_json` (the resolver
# binds the name at call time, so no fork of the asset) and lands on `unknown`, which
# changes no gate.
: >"$CALL_LOG"
pr_view_json() {
  printf 'fail-fast\n' >>"$CALL_LOG"
  return 1
}
resolve_pr_tree '#420'
check "fail-fast override ⇒ unknown, no host wait" unknown "$TREE_MATCH"
check "…and the override is what ran" fail-fast "$(head -n1 "$CALL_LOG")"

# Being ON the PR's branch is not being AT its head: the canonical pre-push state.
stub_read "$PARENT_SHA" risk:yellow
resolve_pr_tree ""
check "locally committed, unpushed ⇒ ahead" ahead "$TREE_MATCH"
check "and it counts the unpushed commits"  1 "$AHEAD_N"
contains "ahead row is warning-free"        "ahead of PR #420's head" "$(render_tree_row)"
case "$(render_tree_row)" in
*⚠️*)
  log_fail "the ahead arm must NOT render ⚠️ — it is the expected pre-push state"
  FAILED=1
  ;;
*) log_succ "no ⚠️ on the expected pre-push state" ;;
esac

# Stale or divergent: genuinely OTHER code ⇒ the ⚠️ arm.
stub_read "$DIVERGENT_SHA" risk:red
resolve_pr_tree ""
check "divergent checkout ⇒ mismatch"      mismatch "$TREE_MATCH"
contains "mismatch row warns"              "⚠️ NOT PR #420's head" "$(render_tree_row)"
contains "mismatch row names the code that DID run" "the suites ran against" "$(render_tree_row)"

# A detached worktree AT the head is a match (the review/CI shape), and its local side is
# a bare commit — never the literal "HEAD", which names no code at all.
git checkout -q --detach HEAD
stub_read "$HEAD_SHA" risk:green
resolve_pr_tree ""
check "detached AT the head ⇒ match"       match "$TREE_MATCH"
check "detached local side is the commit"  "$(git rev-parse --short HEAD)" "$LOCAL_TREE"
git checkout -q feature/US-382

# The read consumes the NORMALIZED identifier, never the raw argument: a host handed a URL
# may reject it, and the failure would fail-safe 🔴 blaming an unreachable host.
: >"$CALL_LOG"
stub_read "$HEAD_SHA" risk:yellow
resolve_pr_tree 'https://github.com/o/r/pull/420/files'
check "the host read gets the bare number" 420 "$(head -n1 "$CALL_LOG")"

# --- The two failure states hiding behind ONE non-zero exit ---
# (c1) the host ANSWERED "no PR on this branch": the pre-publish shape, the only case that
# may fall through to the story card's refinement tier.
pr_view_json() {
  echo "no pull requests found for branch \"feature/US-382\"" >&2
  return 1
}
resolve_pr_tree ""
check "host says no PR ⇒ none"             none "$TREE_MATCH"
check "…and raises the pre-publish flag"   1 "$NO_PR_ON_BRANCH"
check "…without claiming a missing remote" 0 "$NO_CODE_HOST"
contains "none row says pre-publish"       "no PR on this branch (pre-publish)" "$(render_tree_row)"

# (c2) the read FAILED: the relation is unknown — never asserted as a mismatch, and never
# the pre-publish fallback (the PR may exist and may carry a review-raised tag, D17).
pr_view_json() {
  echo "error connecting to api.github.com" >&2
  return 1
}
resolve_pr_tree ""
check "unreadable ⇒ unknown"               unknown "$TREE_MATCH"
check "…never the pre-publish fallback"    0 "$NO_PR_ON_BRANCH"
check "…and no number was ever assigned"   "" "$PR_NUM"
check "…so the row is the NUMBERLESS spelling" "unknown — the current-branch PR could not be read" "$(render_tree_row)"

# Same failure WITH a named `$pr`: the number is known, so the row names it.
resolve_pr_tree '#420'
check "named-but-unreadable keeps its number" 420 "$PR_NUM"
check "…and renders the numbered spelling" "unknown — PR #420 unreadable" "$(render_tree_row)"

# --- No leaked temp files from the stderr sink, on any arm ---
if [ -n "${PR_ERR:-}" ] && [ -e "$PR_ERR" ]; then
  log_fail "the stderr sink was not released: $PR_ERR"
  FAILED=1
else
  log_succ "the stderr sink is released on every arm (no EXIT trap taken over)"
fi

cd "$REPO_ROOT" || exit 1

echo ""
if [ "$FAILED" = "0" ]; then
  log_succ "$TEST_NAME: all checks passed"
  exit 0
else
  log_fail "$TEST_NAME: FAILED"
  exit 1
fi
