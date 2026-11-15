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
- A process fault spends `autoRecoveryRounds`, never `redRepairs`, `greenRetries` or `maxFixRounds`; `resolve` bounds them per phase; every driver routes a stage's process fault (typed `processFault`, a process refusal or reason, a dead or stalled dispatch) through one recovery path before any stage failure check; a spent budget parks `awaiting-human` with a resume token, never `failed-*`. A process-budget park clears once a recovery round is recorded after it, the PR/base head moves, or an explicit re-run records `recover --kind resume` (once per re-run, at most `autoRecoveryRounds` per run). A `stale` preparation is retried only after a base merge (`base-sync`, never a rebase) and `verify-chain --base-ref` on a sealed cycle. An automatic `reset-group` never sets aside a genuine rejection, and `autoRecoveryRounds` counts across resets.
- Publish re-hashes saved contract bytes against the dispatched hash; mismatch or attempt overwrite is a process fault and keeps the previous attempt. Same-bytes republish is idempotent.
- `reset-group --phase P` restarts a group from its last clean attempt; sealed attempts and the RED snapshot are never rewritten; the intervention is recorded.
- A moved base is merged, never rebased; `verify-chain --base-ref` follows.

## Consequences

No custody, HALT or contract rule is removed. Hand `supersede` chains are replaced by `reset-group`.
