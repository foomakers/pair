# Decision: transient host recovery parks the cycle

## Date

2026-11-17

## Status

Active

## Category

Process

## Context

Story #601: a short host outage could end an unattended `pair run` after a stage had already written work.

## Decision

- Read-only host calls retry transient transport, rate-limit and 5xx failures at most four times, with 1/2/4-second backoff and a 30-second total bound. A `Retry-After` delay applies only when it fits that bound. Permanent failures do not retry.
- Mutations never replay from a failed response alone. Marker-keyed comments and head-pinned merges accept a successful read-back of the same identity; an absent or ambiguous read-back parks the cycle.
- Exhaustion records one `autoRecoveryRounds` round and immediately parks `awaiting-human` with a resume token. It does not repeat the exhausted read in the same run. The durable resolver decides the next step on re-run; story budgets stay unchanged.
- Retry diagnostics name the operation, attempt and outcome; exhausted errors retain the transport cause without copying host stderr into the audit.

## Consequences

Re-run `pair run --card <card>` after host recovery. The existing worktree and stage artifacts remain available to the resolver.

If the host is unavailable before the current PR branch can be verified and a worktree already exists, stop without spending a recovery round. Once the host returns, re-run the card so the resolver can verify ownership and continue. A missing worktree does not prevent the normal resumable host park.
