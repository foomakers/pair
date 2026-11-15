# Decision: process faults never spend card budgets; a catalogue classes every stop

## Date

2026-11-14

## Status

Active

## Category

Process

## Context

Story #646 (slice 2 of #641). 26 stalls on 10 cards were process problems (dirty, stale, contract identity, dead dispatch) recovered by hand.

## Decision

- `STOP_CATALOG` in `cycle-state.mjs` classes every blocked/failed/escalate status as process, finding or decision, with one scripted resume.
- A process fault spends `autoRecoveryRounds`, never `redRepairs`, `greenRetries` or `maxFixRounds`; `resolve` bounds them per phase; a spent budget parks with a resume token (`awaiting-human` in the batch driver, `needs-human` in `pair-cli run`).
- Publish re-hashes saved contract bytes against the dispatched hash; mismatch or attempt overwrite is a process fault and keeps the previous attempt. Same-bytes republish is idempotent.
- `reset-group --phase P` restarts a group from its last clean attempt; sealed attempts and the RED snapshot are never rewritten; the intervention is recorded.
- A moved base is merged, never rebased; `verify-chain --base-ref` follows.

## Consequences

No custody, HALT or contract rule is removed. Hand `supersede` chains are replaced by `reset-group`.
