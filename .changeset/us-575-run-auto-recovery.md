---
'@pair/pair-cli': minor
'@pair/knowledge-hub': minor
'@pair/website': patch
---

`pair run` recovers instead of parking or exiting ([#575](https://github.com/foomakers/pair/issues/575)): a merge-time tier gate that comes back red is re-run once on the same reviewed head after `worktree-setup-command`, then routed to the fix stage with the failing gates as findings; a durable failure recorded on a PR or base head that has since moved is stale and retried; a review on a head that is no longer the PR head is re-verified; a branch that conflicts with its base is synced mechanically (`Pair-Base-Sync` trailer, checked by custody); a failed CI run is re-run once; prerequisites are read deterministically through the PM adapter (`blocked by #<id> (<reason>)`, fail closed). Budgets `autoRecoveryRounds` (default 5) and `maxFixRounds` (default 10, was 3) are `## Autonomy` keys; a spent budget parks the card `needs-human: <reason>` and the run continues; a new run lists earlier exclusions and re-evaluates them.
