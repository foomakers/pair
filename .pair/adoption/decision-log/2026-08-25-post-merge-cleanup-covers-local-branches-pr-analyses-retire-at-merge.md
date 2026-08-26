# Decision: Post-merge cleanup covers local branches and worktrees; PR analyses retire at merge

## Date

2026-08-25

## Status

Active

## Category

Process Decision

## Context

`/pair-process-review` Phase 6 (`merge-and-cascade.md` Step 6.5) prescribes deleting the **remote** feature branch and removing the story checkpoint. Real closures on this repo surfaced two gaps:

1. Local clones keep the feature branch alive in agent worktrees (`.claude/worktrees/agent-*`, `pair-worktrees/*`) after the remote deletion — stale branches accumulate and block `git branch -D`.
2. PR analyses under `.pair/working/pr-analyses/` have no stated retention rule: analyses of merged PRs lingered as if the PR were still open.

## Decision

1. **Branch cleanup is both-sided**: post-merge cleanup deletes the feature branch on the code host **and** locally (`git worktree remove` for any worktree holding it, then `git branch -D`). The skill's Step 6.5 "branch deleted" verification includes the local copy.
2. **PR analyses retire at merge**: an analysis in `.pair/working/pr-analyses/` describes one head of one open PR; when the PR merges, its analysis is deleted in the same closure pass as the checkpoint. An incomplete PR's analysis may also be dropped and rewritten fresh once the PR completes — the file is operational state, not history (D14).

## Consequences

- Closure runs must enumerate local worktrees before `git branch -D`; a worktree still holding the branch fails loudly rather than silently keeping it.
- `.pair/working/pr-analyses/` holds exactly the analyses of open PRs; anything else is drift.
- No change to the merge mechanics themselves (strategy, message template, story/board writes stay governed by Steps 6.1–6.4).
