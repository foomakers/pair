# Decision: `pair-loop`'s fan-out path resumes from its own audit file, not from `/pair-capability-checkpoint`

## Date

2026-08-23

## Status

Active

## Category

Convention Adoption

## Context

Story #250's AC10 states: "a killed run, re-invoked, resumes from the checkpoints written by
`/pair-capability-checkpoint` without re-running completed cards." `/pair-capability-checkpoint`
is a **per-story** artifact (`.pair/working/checkpoints/<story-id>.md`), written by the story's
own implement/publish-pr cycle — it describes one story's progress, not a loop run's cross-card
selection/exclusion state across many stories in one policy scope.

The fan-out `pair-loop` workflow drives potentially many different stories per run, each of
which may or may not ever reach `/pair-process-implement` (a card can be excluded by
eligibility, dependency, or mutex analysis before any story-level checkpoint would exist). A
loop-level notion of "what has this run already decided about card X" — halted (escalated,
failed, already merged, or parked awaiting human) — has no natural home in a per-story
checkpoint file, and inventing a second, loop-scoped checkpoint file duplicates state the
workflow already writes for a different, better reason: the audit trail (`## Audit Location`,
AC4/AC10's own transparency requirement).

## Decision

`pair-loop`'s fan-out path resumes by reading its own prior audit file at the start of a run and
excluding every card id previously recorded as `escalate`, a `failed-*` status, `autoAdvance:
true` (already merged), or `parked: true` (review-approved but awaiting human, per Auto-Advance
policy). This is the append-only, on-disk record AC10 already requires the loop to maintain —
reused as the resume source instead of a second, loop-scoped checkpoint file.

`/pair-capability-checkpoint` is unaffected: `pair-implement-batch` and `/pair-process-implement`
still write and consume it exactly as before, per-story, once a card reaches that pipeline. This
decision is scoped to the loop orchestrator's own cross-card resume state only.

## Alternatives Considered

- **A loop-level checkpoint file** (`.pair/working/checkpoints/loop-<run-id>.md`), written and
  read by `/pair-capability-checkpoint`: rejected — that skill's contract is explicitly
  story-scoped (branch, tasks done, decisions for ONE story); stretching it to also carry
  cross-card loop state would either violate its own contract or require a second, incompatible
  schema inside the same skill.
- **No resume at all** (always restart at iteration 0): rejected — this is exactly the
  regression AC10 exists to prevent; a killed run on a large eligible set would silently
  re-implement already-escalated or already-parked cards forever.

## Consequences

- The audit file is now load-bearing for correctness, not only for the human-readable trail
  AC4 already required — an audit write failure already HALTs the run (M5), which is now also
  the right failure mode for resume-state loss.
- AC10/T2's checklist wording ("resume via `/pair-capability-checkpoint`") describes the
  degraded, one-card skill path's mechanism (which DOES call `/pair-capability-checkpoint` for
  the single story it drives), not the fan-out workflow's — the two paths resume differently,
  and this ADL is the record of that split for future readers of the story.

## Adoption Impact

- None — this is a workflow-internal design decision, not an adoption-file schema change.
  `tech/automation.md`'s `## Audit Location` already documents the audit file this decision
  reuses.
