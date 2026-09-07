# Decision: Rebase invalidates sealed fix custody

## Date

2026-09-07

## Status

Active

## Category

Process Decision

## Context

PR #471 exposed a conflict in the sealed fix loop. Preflight correctly requires a branch to be
rebased before a new attempt, but rebase creates new commit identities and changes each
snapshot's direct parent while preserving its old trailer. The prior workflow neither rejected
that mismatch nor defined which older snapshots a newer successful phase retired. A
SHA-scoped history decision also became ambiguous after rebase: equal patch-id proved content,
not authorization for replacement SHAs.

## Decision

Run a read-only Git custody probe before review. It verifies every RED snapshot's declared base
against its direct parent, and verifies that a history decision's `reviewedHead` and exact
subjects remain ancestors of the branch.

Any mismatch stops before review. A human may supply one `custodyReset` only for the complete
measured set of rewritten snapshots and an ancestral baseline. The first valid successor RED
snapshot records precisely that set in `supersedes=<full-sha,...>`; only a later still-valid
successor can retire an older invalid snapshot. A rebase of that successor invalidates the whole
chain again. P3 checks only its current snapshot transition; retired phases remain history, never
later blob breaches.

History decisions are never transported by patch-id or subject similarity. Those mappings may
inform a new explicit human decision, bound to the then-current reviewed baseline and exact
SHAs. Do not rebase inside a sealed RED→GREEN→P3 attempt.

## Alternatives Considered

- **Carry decisions via patch-id automatically**: rejected; equal content does not prove the
  human accepted a rewritten history identity.
- **Ignore old invalid snapshots after any later seal**: rejected; an invalid successor could
  hide a prior integrity failure.
- **Keep reset in a run prompt forever**: rejected; the successor trailer is auditable Git
  custody and avoids a reusable prose waiver.

## Consequences

- Rebase stops a PR earlier, with a precise `seal-invalidated` or stale-history result.
- A human reset is explicit, bounded and durable only after a valid successor seal.
- Existing PR #471 needs one fresh reset/decision on its current branch, then proceeds in its
  existing card; no new card is created.

## Adoption Impact

- `.pair/adoption/tech/way-of-working.md`: records rebase-sensitive sealed custody.
- `.claude/workflows/pair-implement-batch.js` and dataset mirror: validate custody before review,
  bind history decisions to `reviewedHead`, and write successor retirement trailers.
