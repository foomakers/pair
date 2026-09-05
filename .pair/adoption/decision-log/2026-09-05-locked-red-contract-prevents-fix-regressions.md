# Decision: Locked RED contract prevents fix regressions

## Date

2026-09-05

## Status

Active

## Category

Process Decision

## Context

Story 434 repeatedly produced regressions inside otherwise TDD-labelled fixes. The RED tests covered
the reported example but omitted neighbouring state transitions; the same agent then changed
test and source in one session. `blockStart` consequently used a laziness predicate rather than
the state owner and split valid paragraphs. Existing post-fix preflight stopped those regressions
before external review, but only after a commit/push and one incomplete repair cycle.

## Decision

For every actionable behavioral fix, dispatch a dedicated test-only RED agent before GREEN. It
maps the canonical state owner and finite branch/boundary matrix, writes/runs failing tests, and
returns hashes of every changed test artifact. The separate source fixer receives that immutable
contract and may not change test artifacts. Preflight recomputes the hashes, rejects changed or
unlisted test artifacts, and traces a derived predicate/event to the transition that owns its
state. Pure documentation/formatting work may be test-exempt only with an explicit rationale.

## Alternatives Considered

- **Prompt the existing fixer more strongly**: rejected; it still lets one session choose both
  the specification and its implementation.
- **Allow unlimited internal fix/preflight rounds**: rejected; it hides scope expansion and can
  loop indefinitely instead of surfacing a human decision.

## Consequences

Every behavioral fix adds one bounded RED session and a hash verification. A missing or invalid
RED contract fails closed before source code changes or an external re-review. This reduces
review churn; it does not claim formal proof against bugs outside the declared contract.

## Adoption Impact

- `.pair/adoption/tech/way-of-working.md`: records locked RED/GREEN and hash verification.
- `.claude/workflows/pair-implement-batch.js` and dataset mirror: dispatch and enforce it.
- `.claude/agents/pair-fix-test-author.md` and dataset mirror: define the isolated RED role.
