# Decision: Map the RED domain before tests

## Date

2026-09-07

## Status

Active

## Category

Process Decision

## Context

PR #471 had three consecutive pre-GREEN stops. The RED verifier correctly found a missing state
or grammar boundary each time, including the ordinary complement and a comment/fence interaction.
One bounded RED repair closed only the first sampled omission; the second verifier found another.
No source fixer ran, so this is a specification-discovery defect, not a GREEN-model regression.

## Decision

Before RED authors tests, a distinct read-only mapper returns a typed finite domain for every
target: the actual owner, one named discriminator, mutually exclusive/exhaustive rows, the
ordinary complement, authoritative oracle and smallest necessary rule-interaction cross-product.

The mapper cannot edit. The RED author must turn every mapped row into a failing assertion or a
fixture consumed by one. The independent verifier rejects any missing row. An absent or invalid
map is `failed-red-domain` before RED, sealing or GREEN. The existing single RED-repair budget
remains; a second rejected contract is still terminal.

## Alternatives Considered

- **Put each verifier finding into `requiredFindings` manually**: rejected; it confuses product
  evidence with a test-contract omission and keeps the orchestrator in the completeness loop.
- **Retry the same author until it happens to enumerate the row**: rejected; it is sampling, not
  a contract.
- **Allow unbounded RED repair**: rejected; it hides a missing domain model behind retries.

## Consequences

- The verifier checks a prior independent completeness boundary rather than discovering one edge
  at a time from an illustrative matrix.
- The workflow has one additional read-only stage before source work, and fails earlier when it
  cannot establish the domain.
- PR #471 must begin a fresh P1 cycle after its rejected unsealed test files are verified and
  removed; no rejected contract is reused.

## Adoption Impact

- `.pair/adoption/tech/way-of-working.md`: records map → author → verifier ordering.
- `.claude/agents/pair-red-domain-mapper.md` and dataset mirror: add the read-only role.
- `.claude/workflows/pair-implement-batch.js` and dataset mirror: require and thread the map.
- `apps/website/content/docs/reference/batch-engine.mdx`: documents the ninth agent and fail-closed stage.
