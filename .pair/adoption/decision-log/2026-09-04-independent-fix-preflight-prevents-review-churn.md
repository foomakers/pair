# Decision: Independent fix preflight prevents review churn

## Date

2026-09-04

## Status

Active

## Category

Process Decision

## Context

The review loop sent a fixer directly to the next independent PR review. The evidence ledger and
collision instructions made required proof explicit, but no distinct actor reran that proof or
checked that a new test fixture was actually asserted. On #434 / PR #471, the latest fix closed
the prior findings but introduced a container reader with a one-way quote/list ordering, a
four-space-code/list ambiguity, and declared `github` fields no assertion consumed. These were
new fix-delta defects, not reopened prior findings.

## Decision

After every fix, run one narrow, independent, read-only preflight on its delta and directly
changed producer/consumer boundaries before the external re-review. It receives the original
finding acceptance conditions and returned evidence ledger, reruns each oracle, traces fixture
values to assertions, and checks paired ordering plus the minimal interaction/collision matrix.

The preflight can return concrete findings to one internal TDD fix. A second failed preflight
stops as `failed-preflight`; it neither posts a PR review nor consumes/inflates an external review
round. Every actionable reviewer recommendation ends with executable `VERIFY`, `ORACLE`, and
`ASSERT` clauses.

## Alternatives Considered

- **Trust fixer self-review**: rejected — the same framing that made the change misses its own
  implicit order and unconsumed test data.
- **Only strengthen the outer review prompt**: rejected — it still discovers fix defects one
  external round later and makes the finding trend look non-convergent.
- **Retry preflight until clean**: rejected — it hides churn; one repair exposes a real missing
  contract and the next miss must stop with evidence.

## Consequences

- Each fix costs one short, delta-bounded read-only pass and sometimes one additional TDD repair.
- A PR reaches external re-review with its new helper/test/claim surface independently checked.
- `failed-preflight` is a diagnostic stop, not approval or a new card; the existing PR and
  working log remain the continuation point.

## Adoption Impact

- `.pair/adoption/tech/way-of-working.md`: records preflight and executable finding clauses.
- `.claude/workflows/pair-implement-batch.js` and
  `packages/knowledge-hub/dataset/.workflows/pair-implement-batch.js`: dispatch and enforce it.
- `.claude/agents/pair-fix-verifier.md` and
  `packages/knowledge-hub/dataset/.agents/pair-fix-verifier.md`: ship the read-only verifier.
