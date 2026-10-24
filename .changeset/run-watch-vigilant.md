---
'@pair/pair-cli': patch
'@pair/knowledge-hub': patch
---

`pair-cli run --watch`: an idle poll never spends the iteration cap — only an iteration that ran a card counts — so a watch loop waiting for new cards (or for a human) stays on until Ctrl-C or the Stop Predicate. `cycle-state.mjs resolve`: a GREEN that reports `contractGaps` (a gate rejecting a path outside its fixScope) routes a revision of its group's contract instead of a dead `failed-fix` stop.
The loop's status row on a live terminal: `Checking for cards (…)…` while it selects, `Waiting for new cards — next check in 10m` while idle. Local smoke-test runs write under `.pair/working/smoke-tests/`.
A contract-gap revision dispatches its group with `widen: true`: red-spec may add exactly the paths the gap requires, red-verify accepts only those.
`implement-phase`: uncommitted changes in the story worktree are a previous interrupted attempt of the same story — resumed and committed, never a stop as foreign work.
`pnpm mirrors:regenerate` also copies the dataset workflow suites into `.claude/workflows/` — excluded from the install yet guarded byte-identical, they no longer need a manual copy.
Custody (`red-snapshot.mjs verify`): a generated mirror byte-identical to its dataset file is never `out-of-scope` nor an unlisted test — its origin carries the verdict; `green-fix` realigns mirrors instead of reporting them as a contract gap.
