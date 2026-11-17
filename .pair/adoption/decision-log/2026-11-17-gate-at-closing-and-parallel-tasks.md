# Decision: Full quality gate once at closing; independent tasks run in parallel

## Date

2026-11-17

## Status

Active

## Category

Process Decision

## Context

Card #601 ran one implement stage for over an hour: 51 `pnpm` runs, 6 of them the full `pnpm quality-gate` (4300 tests), for 7 commits. The implement how-to verifies quality per task. The `pre-push` hook already runs the full gate, and the task breakdown makes every task sequential even when tasks share no file.

## Decision

- Per task: targeted checks on the touched files only. Full `pnpm quality-gate` once at closing, before the PR; `pre-push` stays the backstop.
- Tasks with no dependency and no shared file run in parallel, within `## Max Parallelism`. The breakdown lists touched files per task.
- Local `pre-commit` runs `ts:check` and `docs:staleness` only when the staged files can affect them.

## Alternatives Considered

- Keep the gate per task: slow, redundant with `pre-push`.
- Drop the full gate: loses the floor; rejected.

## Consequences

Shorter implement stages. A task-level regression surfaces at closing instead of per task. CI and `pre-push` are unchanged.
