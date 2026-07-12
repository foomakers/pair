# Decision: One PR per story is the default

## Date

2026-07-12

## Status

Active

## Category

Process Decision

## Context

Story #199 (tech-debt ledger) was broken into inline tasks T1-T10 within a
single story issue. All ten tasks landed in one PR (#311). The review flagged
this as a deviation from the story's own "suggested batching" wording (which
implied smaller, incremental PRs per task or group of tasks).

The user confirmed, explicitly and generally (not just for #199), that
bundling a story's tasks into a single PR is correct and should be the
default going forward — not an exception that needs justifying case by case.

## Decision

A story's work lands in a single PR by default, even when the story is
broken into multiple inline tasks/findings. Splitting a story's work across
multiple PRs requires an explicit reason (e.g. the story is unusually large,
or parts of it are independently shippable/needed sooner) — it is not the
default.

The adopted convention is recorded in
`.pair/adoption/tech/way-of-working.md` (Delivery / PR granularity section);
this ADL is the historical record of why.

## Alternatives Considered

- **Task-per-PR granularity**: rejected — more review overhead (reviewer
  re-establishes context per PR), more merge-order coordination between
  dependent tasks, and no clear benefit when tasks are tightly related within
  one story.
- **Case-by-case judgment call with no default**: rejected — leaves
  implementers guessing at review time whether batching will be flagged;
  a stated default removes the ambiguity while still allowing exceptions.

## Consequences

- Reviewers see the full story diff at once — larger review surface per PR,
  but full context in one pass instead of piecemeal.
- Large stories may need a bigger review budget per PR; acceptable tradeoff
  per user direction.
- Story/task templates that read as "suggested batching" per task should be
  read as suggested internal commit structure (commit per task, per existing
  Commit History Policy in way-of-working.md), not as a mandate for separate
  PRs.

## Adoption Impact

- `.pair/adoption/tech/way-of-working.md`: added a PR granularity statement
  under the delivery/commit-history guidance making single-PR-per-story the
  default.
