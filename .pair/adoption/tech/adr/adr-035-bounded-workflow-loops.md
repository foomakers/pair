# ADR-035: Bounded workflow loops

## Status

Accepted (amended 2026-11-25 — exhausted outcome in [ADR-037](adr-037-workflow-escalation.md))

## Date

2026-11-21 (amended 2026-11-25)

## Context

Story #670 needs review and fix to repeat from the workflow file. The linear engine of ADR-031 stops after one pass; `on-failed` of #708 can continue once but cannot return to a prior step.

## Decision

- A `loop` has an ordered child map, a required `until` child, a positive `max`, and either an `escalate.exhausted` rule or `on-max: escalate | fail`. Nested loops are invalid.
- `until: ok` exits immediately. By default, its failed result passes outputs to following children, and failure of another child starts the next round. `blocked` and `needs-decision` park at the child and resume in the same round. Explicit child rules can change whether the run continues.
- Rounds started count against `max`. On `exhausted`, the loop retains the last `until` outputs. Use `escalate.exhausted` to continue or park. Legacy `on-max: escalate` parks and `on-max: fail` fails the run. `--more-rounds <n>` extends a parked exhausted loop and records the requester and time.
- Child executions have prefixed ids and round-specific results. State and telemetry carry the round. Telemetry schema 2 adds `round`; the reader accepts historical schema 1 and schema 2.
- A configuration may change only `steps.<loop-id>.max`. The frozen configuration sets the initial bound; `--reconfigure` may replace it.

## Consequences

The workflow owns its retry budget and stopping rule. A run can resume without repeating earlier completed steps. Later workflow inclusion work must reject an expansion that nests loops.
