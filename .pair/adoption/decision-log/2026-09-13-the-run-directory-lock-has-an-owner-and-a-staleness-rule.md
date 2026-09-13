# Decision: the run-directory lock records its owner, breaks a dead writer's lock and refuses a stale live one out loud

## Date

2026-09-13

## Status

Active

## Category

Process Decision

## Context

`cycle-state.mjs publish` and `apply-scope-decisions` serialize writes to a run directory with an
atomic `mkdir .lock`, released in `finally`. The delivery workflow's supervisor kills an agent after
180 s without progress — `finally` never runs then — and the lock carried no owner, no time and no
staleness rule, so every later `publish` answered `{ published: false, reason: 'locked' }` after the
wait, forever (T-9 fourth round, t9d-7). No skill documented a recovery.

## Decision

1. **The holder records itself** inside the lock (`.lock/owner.json`: `pid`, `host`, `startedAt`).
2. **A dead writer's lock is broken mechanically**: an owner on the same host whose pid no longer
   exists, or an ownerless (legacy) lock older than `LOCK_STALE_MS` (10 minutes). The publish then
   proceeds and reports `brokeStaleLock: { reason: dead-owner | orphan-stale, owner, ageMs }` — never
   silently.
3. **A live (or unverifiable, other-host) owner is never removed by another process.** Younger than
   the bound it is `locked` as before; older, it is a typed refusal `stale-lock` naming the owner and
   the age — a human decides.

## Alternatives Considered

- **Break any lock older than a bound**: rejected — a slow but live writer would lose its write.
- **Leave it to an operator (`rm -r .lock`)**: rejected — the case the bound exists for is the
  unattended loop, where nobody is watching, and the failure looked like a busy peer.

## Consequences

- `publish`/`apply-scope-decisions` results may carry `brokeStaleLock`, `owner`, `ageMs`; the
  `locked` result now names what holds the lock.
- Tests: dead owner broken; ownerless-stale broken, ownerless-young respected; live owner respected
  young and `stale-lock` old; the owner record while held.

## References

- `.claude/skills/pair-workflow-*/scripts/cycle-state.mjs` (`inspectLock`, `withLock`); ADR-024 T-16/DT-24
