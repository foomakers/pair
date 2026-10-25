---
'@pair/pair-cli': minor
'@pair/knowledge-hub': minor
'@pair/website': patch
---

`pair run` recovers instead of parking or exiting ([#575](https://github.com/foomakers/pair/issues/575)): a merge-time tier gate that comes back red is re-run once on the same reviewed head after `worktree-setup-command`, then routed to the fix stage with the failing gates as findings (or parked `needs-human` once `maxFixRounds` is spent); a durable failure recorded on a PR or base head that has since moved is stale and retried; a review on a head that is no longer the PR head is re-verified; a branch that conflicts with its base is synced mechanically (`Pair-Base-Sync` trailer, checked by custody; a generated mirror takes the side its dataset source took); a failed CI run is re-run once; prerequisites are read deterministically through the PM adapter (`blocked by #<id> (<reason>)`, fail closed; only an issue closed as completed counts as merged). Budgets `autoRecoveryRounds` (default 5) and `maxFixRounds` (default 10, was 3) are `## Autonomy` keys; a spent budget parks the card `needs-human: <reason>` and the run continues; a new run lists earlier exclusions and re-evaluates them.

Also in this release:

- CI still red after its re-run goes to the fix stage with the failing checks and their log tail as findings.
- A preparation refused for a dirty story worktree stashes the stray files (`pair-recovery: …`, kept) and retries; a validation stopped with `seal-not-pushed` is dispatched again; the seal push is no longer killed by a pre-push hook printing over 1 MB.
- `autoRecoveryRounds` counts only the rounds since the last step that advanced; a durable failure (`failed-preparation`, `failed-contract`…) is driven again once the base or the PR head moved.
- A GREEN that a gate rejects on a path outside its fixScope reports `contractGaps`; `resolve` routes a revision of the group's contract that may widen the scope by exactly those paths.
- `implement-phase` resumes the story's own uncommitted work left by an interrupted attempt instead of stopping on it.
- Generated mirrors are never a contract gap: custody judges a mirror byte-identical to its dataset file by its origin, and `pnpm mirrors:regenerate` also copies the workflow suites into `.claude/workflows/`.
