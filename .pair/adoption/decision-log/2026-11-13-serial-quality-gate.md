# Decision: Run the quality gate serially

## Date

2026-11-13

## Status

Active

## Category

Process Decision

## Context

The pre-push quality gate ran package tests, workflow tests, and formatting concurrently. Repeated runs timed out unrelated CLI integration tests and a Vitest worker RPC under local resource contention. The 3,883 CLI tests passed when run alone. A red pre-push hook prevented a branch push.

## Decision

Run the same package, workflow, formatting, and follow-up checks in sequence. Limit Turbo package task concurrency to one. Keep every check and the pre-push hook.

## Alternatives Considered

- Raise test timeouts: did not resolve the Vitest worker RPC timeout.
- Retry the parallel gate: repeated runs failed on different tests.

## Consequences

Cold gate runs take longer. Test results no longer depend on concurrent workloads on a developer machine.

## Adoption Impact

`tech/way-of-working.md` records serial execution of the adopted `pnpm quality-gate` command.
