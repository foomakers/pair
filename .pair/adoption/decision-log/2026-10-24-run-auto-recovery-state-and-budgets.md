# Decision: Auto-Recovery Lives in cycle-state, Beside the Handoffs, Bounded by Two Budgets

## Date

2026-10-24

## Status

Active

## Category

Process Change

## Context

`pair run` parked or exited on failures whose cause was gone or mechanical: a merge-time tier gate that went `BLOCKED — 1 gates failing` and was green on re-run (#568, PR #574), a `failed-implement` recorded before the base moved, a branch that only needed the base merged, a transient CI failure, a prerequisite the selection agent claimed merged (#575, absorbing #572 B9, E15, I19-23, J).

## Decision

- **Recovery state is `<run dir>/recovery.json`**, written by `cycle-state.mjs` beside the handoffs, never a handoff: `failures` (each durable-failure handoff → the PR/base heads it was first seen on, plus `stale` once they moved), `rounds` (every recovery spent), `gateRed` (the merge-time gates that stayed red on a reviewed head). A stale verdict sticks for its handoff, so a stage's own Step 0 `resolve`, which passes no heads, agrees with the driver's.
- **Stale rule**: `failed-preparation` / `failed-implement` / `failed-custody` recorded with heads that have since moved ⇒ `resolve` re-derives the step (one more attempt, or a re-verification). Same keys ⇒ durable. No heads ⇒ today's behaviour.
- **Budgets**: `autoRecoveryRounds` (default 5) bounds gate re-runs, base syncs and CI re-runs beyond the first; `maxFixRounds` (default 10, was 3) bounds completed corrective cycles. Both are `## Autonomy` keys (`autonomy-policy.mjs`), KB defaults pinned equal to `cycle-state.mjs POLICY_DEFAULTS` by a test. A spent budget parks the card `needs-human: <reason>`; `maxFixRounds` keeps `reason: escalate` (its consumers, the batch engine included, already treat it as a human-owed terminal) and adds a `needsHuman` field.
- **Merge-time gate**: one re-run per merge stage, after `worktree-setup-command` in the story worktree; still red ⇒ `gate-red` routes the approved card to the fix stage with the failing gates as findings.
- **Base sync is ownership-mechanical**: story-owned (the paths the story changed, or a declared `owned` list) keep ours, everything else takes theirs; a generated mirror takes the side its dataset source took (ours when its dataset source is story-owned, theirs otherwise); a sealed test conflict aborts to `needs-human`. The merge commit's `Pair-Base-Sync` trailer is the record custody checks.
- **Prerequisites** are a `cycle-state.mjs prereq-state` subcommand (it reuses the host binding), not a separate `prereq-state.mjs`: PM adapter only (merged only when closed as `COMPLETED`; any other closure — not planned, duplicate, no reason — blocks as closed not merged; `needs-review` / `pr-state:not-approved` ⇒ parked), fail closed.

## Alternatives Considered

- **A `recovery` handoff kind**: the handoff grammar (`NAME_RE`, `REQUIRED_BY_SKILL`, the transition table) is keyed by agent stages; a driver-written record would have needed a step of its own in `deriveNextStep`. Rejected for a side file.
- **Stamping heads at `publish`**: the stage agents would have had to pass the base head; the first `resolve` that sees the failure already has both heads.
- **Renaming the `maxFixRounds` reason to `needs-human`**: churns every consumer of `escalate` for a label change.
- **More gate re-runs per merge stage**: the observed flake needs one; a second red is a real failure for the fix stage.

## Consequences

- A re-run after a fixed cause never needs `cycle-state.mjs supersede`.
- Every budget is printed with its source and spent rounds are visible in `recovery.json` and `resolve`'s `recovery` field.
- `pair-cli run --card` does not check prerequisites itself; the loop / `--parallel` planner does, before a card is driven.

## Adoption Impact

None required: the defaults apply with no `## Autonomy` declaration. A project declares `autoRecoveryRounds` / `maxFixRounds` only to differ.
