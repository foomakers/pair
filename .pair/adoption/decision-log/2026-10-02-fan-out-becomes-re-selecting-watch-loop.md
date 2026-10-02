# Decision: The `run --parallel` fan-out becomes a re-selecting watch loop

## Date

2026-10-02

## Status

Active

## Category

Process Decision

## Context

US-522 (autonomy model B): `pair-cli run --parallel N` ran ONE batch. Unattended multi-card delivery outside Claude Code's `Workflow` tool needs the `pair-loop` iteration semantics on any engine.

## Decision

- The fan-out is wrapped by a pure loop core (`watch-loop.ts`) over the unchanged single iteration (select, plan, pool, batch line). Loop mode is entered only by `--watch` or `--max-iterations`; otherwise exactly one iteration, byte-identical (golden test).
- `--watch` / `--interval` require `--parallel` (`--parallel 1` = sequential). Interval `<n>s|m|h`, default `10m`, floor `60s`.
- Idle polls count toward the cap, which stays `min(--max-iterations, ## Stop Predicate max-iterations)`: each poll spawns an engine process.
- Workable = selected - escalated - locked - already driven in this run. Escalation is read through the selection process (required boolean `escalated` per candidate, autonomy model's marker); the driver holds no tracker credentials. A missing or non-boolean value makes the selection unusable (exit 1).
- The Stop Predicate is evaluated by the driver (port of `pair-loop.js` `evaluateStopPredicate`, parity-tested), from a snapshot returned by the same selection process; checked at every iteration boundary, the first included.
- Fail closed: a failed selection stops the loop, never retried; supervision of a dead watcher is out of pair.
- `watch` / `interval` take flags > KB default only: the shared `autonomy-policy.mjs` grammar (A) has no `watch:` / `interval:` keys, and B defines none of its own. Declaring them in `## Autonomy` is a follow-up on that script.

## Alternatives Considered

- A second selection call for the predicate snapshot: rejected, one engine call per iteration.
- Exclude idle polls from the cap: rejected, unbounded engine cost.

## Consequences

- Positive: same autonomy model runs unattended on any engine; default path unchanged.
- Negative: `--no-watch` / `--watch` conflict cannot be refused from argv (commander folds both into one key; last wins).
