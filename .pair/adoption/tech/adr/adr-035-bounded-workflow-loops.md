# ADR-035: Bounded workflow loops

## Status

Accepted

## Date

2026-11-21

## Context

Story #670 needs review and fix to repeat from the workflow file. The linear engine of ADR-031 stops after one pass; `on-failed` of #708 can continue once but cannot return to a prior step.

## Decision

- A `loop` is one outer step with an ordered child map, a required `until` child, positive `max`, and `on-max: escalate | fail`. No expression language or nested loop.
- `until: ok` exits immediately. Its failed result passes outputs to following children. Failure of another child starts the next round. `needs-human` resumes at that child in the same round.
- Rounds started count against `max`. Escalation parks with the last `until` outputs; failure stops. Only `--more-rounds <n>` extends a parked exhausted loop, with requester and time in state.
- Child executions have prefixed ids and round-specific results. State and telemetry carry the round. Telemetry schema 2 adds `round`; the reader accepts historical schema 1 and schema 2.
- A configuration may change only `steps.<loop-id>.max`. The frozen configuration sets the initial bound; `--reconfigure` may replace it.

## Consequences

The workflow owns its retry budget and stopping rule. A run can resume without repeating earlier completed steps. Later workflow inclusion work must reject an expansion that nests loops.
