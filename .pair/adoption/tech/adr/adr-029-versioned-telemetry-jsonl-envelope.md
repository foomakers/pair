# ADR-029: Versioned telemetry JSONL envelope (start/end/event/card)

## Status

Accepted

## Date

2026-11-16

## Context

- Story #661 (epic #605). Telemetry wrote one `stage` record when a stage settled and one `card` record at run end: a killed or running stage left nothing, a card spanning runs/runners/models carried a single `engine`.
- The file is append-only local JSONL (`.pair/working/telemetry/records.jsonl`); existing records and readers must keep working.

## Options Considered

1. Rewrite `stage` into the new shape — breaks append-only and legacy readers.
2. New kinds beside `stage`, a `schema` field, legacy read as `end` — chosen.
3. Per-run files — splits a card's history across files.

## Decision

- Kinds: `start` (before the engine spawns), `end` (outcome, cause, duration, tokens, cost), `event` (`recovery-round`, `park`, `halt`, `pr-opened`), `card`; v1 `stage` is read as an `end` and never rewritten. An `end` carries `legacyId`: the `stage` of the same dispatch is superseded in aggregation and reports (still written, so v1 readers keep working).
- Every v2 record carries the same keys (`schema: 2`, `id`, `ts`, `run`, `card`, `epic`, `pr`, `branch`, `step`, `phase`, `block`, `round`, `group`, `engine`, `model`, `effort`, `profile`, `tier`, `outcome`, `cause`; `null` when n/a). `id` is `run:card:step:phase:kind:seq`; `appendTelemetry` dedupes by `id`.
- Interruption: an open-stage registry; `onInterrupt` (now passing the signal) and `uncaughtExceptionMonitor` (observes a crash without changing its handling) close each open stage with one synchronous `end` (`interrupted`+`signal`, `crashed`). Orphan `start` with a dead pid on the same host → one synthetic `end` `lost`, timed at the stage's last record.
- Allow-listed fields only: no card text, prompts or secrets.

## Consequences

- Live and partial runs are visible; cost per card/runner/model is derivable from records alone.
- Limit: no heartbeat, so a SIGKILLed long stage is dated at its `start`/last event. Two records per dispatch until v1 readers are dropped.

## Adoption Impact

- `automation-policy.md` `## Telemetry` documents the contract; `automation.md` `## Telemetry` holds the price table (ADL 2026-11-16).
