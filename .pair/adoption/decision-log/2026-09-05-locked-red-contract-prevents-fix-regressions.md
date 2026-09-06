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

On 2026-09-06, #434 exposed a second custody gap: a committed oracle fixture was required in the
snapshot but has no standalone failing command. The first RED author correctly supplied the
fixture and its consumer test, but the workflow rejected it by matching `/fail/i` against every
artifact's prose observation. Retries then changed the unsealed files and could not form a valid
snapshot.

## Decision

For every actionable behavioral fix, dispatch a dedicated test-only RED agent before GREEN. It
maps the canonical state owner and finite branch/boundary matrix and writes/runs failing tests. A
separate sealer verifies those artifacts and records their manifest and blobs in one local Git
snapshot, identified by PR, round and immutable base SHA. The source fixer commits only above
that snapshot and may not change test artifacts. Preflight finds the snapshot from Git history,
not an orchestrator prompt, then compares its blobs with HEAD; a changed comment, fixture,
expectation, missing or unlisted test artifact is a `contractBreach` that stops without an inner
repair or external re-review. Every manifest artifact is typed: a `test` supplies a RED command
and observation; a `fixture` names the declared RED test that consumes it. A fixture cannot
inherit proof from missing or green evidence. Pure documentation/formatting work may be
test-exempt only with an explicit rationale.

## Alternatives Considered

- **Prompt the existing fixer more strongly**: rejected; it still lets one session choose both
  the specification and its implementation.
- **Allow unlimited internal fix/preflight rounds**: rejected; it hides scope expansion and can
  loop indefinitely instead of surfacing a human decision.

## Consequences

Every behavioral fix adds bounded RED authoring and sealing sessions plus a Git-blob verification.
A missing, ambiguous or invalid RED snapshot fails closed before source code changes or an
external re-review. A fixture is frozen and verified like test source, while its test-specific
proof stays attributable to the named RED consumer. This reduces review churn; it does not claim
formal proof against bugs outside the declared contract.

## Adoption Impact

- `.pair/adoption/tech/way-of-working.md`: records sealed RED/GREEN and blob verification.
- `.claude/workflows/pair-implement-batch.js` and dataset mirror: dispatch and enforce it.
- `.claude/agents/pair-fix-test-author.md`, `pair-red-sealer.md` and dataset mirrors: define the
  isolated RED roles.
