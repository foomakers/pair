#!/usr/bin/env bash
# pr-tree-resolve.sh — provider-agnostic tree/PR-state resolver for the local gate run.
#
# It answers the two questions a local quality-gate run must answer BEFORE it decides
# anything, and answers them separately:
#   1. WHICH PR do the classification tags come from? (its labels, fetched here)
#   2. WHICH CODE did the suites actually run against? (the checked-out tree vs. the
#      PR's HEAD COMMIT — a `Tree:` relation, never a tier)
#
# THIS FILE READS PR STATE AND LABELS ONLY. It contains NO classification criteria
# (D18): it never inspects the diff, the code, file paths, or change size, and it never
# decides a tier — that is `tier-resolve.sh` (`resolve_tier`), which consumes the
# `PR_LABELS` this script fills. Sibling of `pr-state.sh` in the same three-layer
# Automation role: it synthesizes already-produced signals and nothing else.
#
# Fail-safe: a relation this script could not establish is NEVER asserted as fact — an
# unreadable PR resolves `unknown`, a repo with no code-host remote resolves `no-remote`
# (a SKIPPED read, which is not a failed one), and a host that answers "no PR on this
# branch" resolves `none` (the pre-publish shape, the only state that may fall through to
# a story card's refinement tier). See:
#   .pair/knowledge/guidelines/quality-assurance/quality-model.md            (§3.2 fail-safe)
#   .pair/knowledge/guidelines/collaboration/project-management-tool/pr-states.md
#
# Usage (verify-quality Step 1.5, and any caller that must state which code it checked):
#   source .pair/knowledge/assets/pr-tree-resolve.sh
#   resolve_pr_tree "$pr"                 # empty ⇒ the checked-out branch's own PR
#   TREE_ROW="$(render_tree_row)"         # the report's `Tree:` value
#   source .pair/knowledge/assets/tier-resolve.sh
#   TIER="$(resolve_tier "$PR_LABELS")"   # tags only — no second round trip
#
# ANOTHER CODE HOST: override `pr_view_json` — the ONE read — and nothing else changes.
# It may be defined before sourcing (this file does not overwrite an existing definition)
# or after it (the resolver binds the name at call time). `headRefName`/`headRefOid` are
# GitHub's spelling of "the PR's head branch" / "the PR's head COMMIT SHA"; substitute the
# host's own field names and command per
#   .pair/knowledge/guidelines/technical-standards/ai-development/skill-conventions/way-of-working-pm-resolution.md

# pr_view_json <identifier|""> — the ONE code-host round trip, for EVERY field a caller
# needs from the PR: head ref (line 1), head sha (line 2), number (line 3), then one label
# per line. With no argument it resolves the CHECKED-OUT BRANCH's own PR, which is what
# makes one read point serve both resolution paths. Never split it in two: two calls cost
# two round trips and, on the unreadable path, return empty and drive a "NOT PR #N's head"
# row asserting a mismatch nothing established.
if ! command -v pr_view_json >/dev/null 2>&1; then
  pr_view_json() {
    if [ -n "${1:-}" ]; then
      gh pr view "$1" --json labels,headRefName,headRefOid,number \
        -q '.headRefName, .headRefOid, .number, (.labels[].name)'
    else
      gh pr view --json labels,headRefName,headRefOid,number \
        -q '.headRefName, .headRefOid, .number, (.labels[].name)'
    fi
  }
fi

# normalize_pr_id <identifier> — echoes the bare number every rendering assumes ("PR #N").
# The number comes from the `pull/<n>` PATH SEGMENT, never from the string TAIL:
# `…/pull/420/files` has no trailing digits and `…/pull/420#issuecomment-98765` ends in a
# comment id. A leading `#` is stripped rather than echoed — `#420` is the spelling this
# corpus writes PR references in, and echoing it verbatim would render the malformed
# `PR ##420 unreadable` and hand a non-GitHub host an identifier it may reject. An
# identifier in no recognized form is echoed VERBATIM, so a fail-safe reason can still name
# what was passed. Empty in, empty out ("this branch's PR").
normalize_pr_id() {
  local raw="${1:-}" n=""
  [ -n "$raw" ] || return 0
  n="$(printf '%s' "$raw" | sed -nE 's#.*/(pull|pull-requests|merge_requests)/([0-9]+).*#\2#p')"
  [ -n "$n" ] || n="$(printf '%s' "$raw" | grep -oE '^#?[0-9]+$' | tr -d '#')" || true
  [ -n "$n" ] || n="$raw"
  printf '%s' "$n"
}

# local_tree — assigns and echoes LOCAL_TREE, the COMMIT-PINNED local side of the row.
# Which code ran is a commit question on BOTH sides: `git rev-parse --abbrev-ref HEAD`
# alone is a BRANCH NAME, which moves — a row naming only `main` says which code was NOT
# run and not which code WAS — and it yields the literal "HEAD" when detached, the
# canonical independent-review/CI shape. Detached renders the short sha ALONE, so no row
# says the commit twice and none renders a name that identifies nothing.
local_tree() {
  LOCAL_SHA="$(git rev-parse --short HEAD)"
  LOCAL_REF="$(git rev-parse --abbrev-ref HEAD)"
  [ "$LOCAL_REF" = HEAD ] && LOCAL_REF="$LOCAL_SHA"
  LOCAL_TREE="$LOCAL_REF@$LOCAL_SHA"
  [ "$LOCAL_REF" = "$LOCAL_SHA" ] && LOCAL_TREE="$LOCAL_SHA"
  printf '%s' "$LOCAL_TREE"
}

# resolve_pr_tree [<identifier>] — the whole resolution, in one bounded round trip.
# Assigns (and INITIALIZES first — see below) every name its callers read:
#   TREE_MATCH  : match | ahead | mismatch | unknown | none | no-remote — never guessed
#   LOCAL_TREE  : the commit-pinned local side (`<branch>@<sha7>`, or `<sha7>` detached)
#   PR_ARG      : the identifier as PASSED (empty ⇒ "this branch's PR") — the arm selector
#   PR_NUM      : the NORMALIZED number; authoritative from the read once it succeeds
#   PR_HEAD_REF / PR_HEAD_SHA : the PR head, display half and the compare half
#   PR_LABELS   : the labels the same read already fetched (feeds resolve_tier)
#   PR_READ_OK / NO_PR_ON_BRANCH / NO_CODE_HOST : the three states one failing read hides
#   AHEAD_N     : unpushed commits, on the `ahead` arm
# Always exits 0: no arm of this resolution may fail a caller's gate.
#
# INITIALIZE EVERYTHING, because callers are idempotent and are re-invoked in shells where
# a previous run's variables survive: an unassigned read would resolve the PREVIOUS run's
# PR — a silent narrow on exactly the paths whose purpose is to fail safe (D17).
resolve_pr_tree() {
  PR_ARG="${1:-}"
  TREE_MATCH=none
  PR_FIELDS=""
  PR_LABELS=""
  PR_READ_OK=0
  NO_PR_ON_BRANCH=0
  NO_CODE_HOST=0
  PR_NUM=""
  PR_HEAD_REF=""
  PR_HEAD_SHA=""
  AHEAD_N=0
  # Resolved BEFORE the identifier guard: every rendering arm interpolates the local tree,
  # including the arms no PR read is reached from.
  local_tree >/dev/null

  PR_NUM="$(normalize_pr_id "$PR_ARG")"

  # stderr sink: its MESSAGE is what separates "no PR on this branch" from "host
  # unreachable". NO `trap … EXIT` here — that is a shell GLOBAL, and installing one would
  # silently discard the cleanup handler a caller already owns. No arm below exits early (a
  # failing command in an `if` condition does not exit, even under `set -e`), so the
  # explicit `rm -f` releases it on every path.
  PR_ERR="$(mktemp)"

  # SKIP the round trip when it cannot pay: no code-host remote ⇒ no PR to read. That
  # skipped read is its OWN state, never `unknown` (which asserts a read that WAS attempted
  # and failed) and never "the host is not reachable" — a host that is not CONFIGURED is a
  # different, fixable fact. No remote ⇒ provably no PR ⇒ the PRE-PUBLISH shape, so it
  # raises the same flag the host's no-PR message raises.
  # Where the host command offers a request-timeout knob, set it in `pr_view_json`, so an
  # offline or rate-limited session fails fast instead of hanging on every task gate —
  # GitHub's `gh` exposes none, so on the reference host the residual cost of an
  # unreachable (as opposed to unconfigured) host is `gh`'s own default timeout. Pay it
  # ONCE per session, not per task.
  if [ -z "$(git remote)" ]; then
    NO_CODE_HOST=1
    NO_PR_ON_BRANCH=1
    TREE_MATCH=no-remote
  elif PR_FIELDS="$(pr_view_json "$PR_NUM" 2>"$PR_ERR")"; then
    # The read consumes the NORMALIZED identifier, never the raw one: a host handed a URL
    # with a trailing segment or a fragment may reject it, and the failure would fail-safe
    # 🔴 blaming an unreachable host for a parsing problem.
    PR_READ_OK=1
    PR_HEAD_REF="$(printf '%s\n' "$PR_FIELDS" | sed -n 1p)"
    PR_HEAD_SHA="$(printf '%s\n' "$PR_FIELDS" | sed -n 2p)"
    PR_NUM="$(printf '%s\n' "$PR_FIELDS" | sed -n 3p)"
    PR_LABELS="$(printf '%s\n' "$PR_FIELDS" | sed '1,3d')"
    # Compare COMMITS, never branch names: a checkout ON the PR's branch at a DIFFERENT
    # commit is not the PR's head, and a DETACHED worktree at the head is. Branch names
    # stay the display half of the row, never the test.
    if [ "$(git rev-parse HEAD)" = "$PR_HEAD_SHA" ]; then
      TREE_MATCH=match
    elif git merge-base --is-ancestor "$PR_HEAD_SHA" HEAD 2>/dev/null; then
      # Strictly AHEAD — the canonical pre-push state the implement→review→fix loop hits on
      # EVERY task. Its own arm, with no ⚠️: warning on the normal expected state would
      # train the reader to ignore the ⚠️ that means OTHER code.
      TREE_MATCH=ahead
      AHEAD_N="$(git rev-list --count "$PR_HEAD_SHA"..HEAD)"
    else
      TREE_MATCH=mismatch # stale or divergent: genuinely different code ⇒ ⚠️
    fi
  elif [ -z "$PR_ARG" ] && grep -qi 'no pull requests found' "$PR_ERR"; then
    # Pre-publish: the host ANSWERED that this branch has no PR, so there is no relation to
    # state — `TREE_MATCH` stays `none`. This flag is the ONLY thing a caller may hang a
    # story-card (refinement-tier) fallback on. On another code host, match ITS message.
    NO_PR_ON_BRANCH=1
  else
    # The PR could not be read at all: the relation is UNKNOWN, not a mismatch — never
    # assert as fact something this read could not establish. A NAMED PR never falls
    # through to the no-PR arm either: it may exist and may carry a review-raised tag.
    TREE_MATCH=unknown
  fi
  rm -f "$PR_ERR"
  return 0
}

# render_tree_row — echoes the report's `Tree:` value for the resolved state: one arm per
# value, each interpolating only names `resolve_pr_tree` assigns. `unknown` has TWO
# spellings because `PR_NUM` may never have been assigned (the no-identifier path, where
# the read failed for a reason other than "no pull requests found"); a single numbered
# spelling would render the malformed `PR # unreadable` there — the same reason `no-remote`
# is kept apart from `unknown`: "not configured" is not "not reachable".
render_tree_row() {
  local sha7
  sha7="$(printf '%s' "$PR_HEAD_SHA" | cut -c1-7)"
  case "${TREE_MATCH:-}" in
  match) echo "$LOCAL_TREE — matches PR #$PR_NUM's head ($PR_HEAD_REF@$sha7)" ;;
  ahead) echo "$LOCAL_TREE — ahead of PR #$PR_NUM's head ($PR_HEAD_REF@$sha7, $AHEAD_N unpushed — expected pre-push)" ;;
  mismatch) echo "⚠️ NOT PR #$PR_NUM's head ($PR_HEAD_REF@$sha7) — the suites ran against $LOCAL_TREE" ;;
  none) echo "$LOCAL_TREE — no PR on this branch (pre-publish)" ;;
  no-remote) echo "$LOCAL_TREE — no code-host remote (no PR to read)" ;;
  *)
    # `unknown`, and any state a caller failed to resolve — the fail-safe rendering claims
    # no relation at all rather than inventing one.
    if [ -n "${PR_NUM:-}" ]; then
      echo "unknown — PR #$PR_NUM unreadable"
    else
      echo "unknown — the current-branch PR could not be read"
    fi
    ;;
  esac
}
