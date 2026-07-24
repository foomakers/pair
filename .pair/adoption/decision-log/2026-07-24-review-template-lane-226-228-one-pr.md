# Decision: AC3 of #226 delivered in the #228 PR (shared review-template lane)

## Date

2026-07-24

## Status

Active

## Category

Process Decision

## Context

Story #228 (verdict-first code-review template) and story #226 (AC3:
review-side cost section + classify-on-review floor) both mutate the same
exclusive lane — the code-review template plus `/pair-process-review`'s output
and classification-on-review behaviour. Splitting them into two PRs would put
two changes on the same files in flight at once, forcing merge-order
coordination and a near-guaranteed rebase conflict on `code-review-template.md`
and the review SKILL.

A scope directive (from the orchestrator driving the batch) folded #226's AC3
into the single #228 PR (#376) for this reason. Per the one-PR-per-story
default (`2026-07-12-one-pr-per-story-default.md`), crossing a story boundary
needs an explicit reason; this records it, since the rationale otherwise lived
only in the PR description and would not outlive the PR (CLAUDE.md requires
project decisions to be recorded as ADR/ADL).

## Decision

Deliver AC3 of #226 (review-side cost section + classify-on-review raise-only
floor) inside the #228 PR (#376), not a separate PR. The two stories share one
exclusive review-template lane; co-delivering them avoids a self-inflicted
merge conflict on identical files. #226's remaining ACs (if any) stay tracked
on #226.

## Alternatives Considered

- **One PR per story (the default)**: rejected here — both stories edit the
  same template + review-skill files, so parallel PRs would conflict and need
  serialized merge ordering with a rebase in between, for no isolation benefit
  (the two changes are one coherent edit to the review artifact).
- **Defer #226 AC3 to a follow-up PR after #228 merges**: rejected — leaves the
  cost section half-specified in the template between merges and duplicates the
  review-skill edit surface.

## Consequences

- PR #376 closes #228 and satisfies #226 AC3; the #226 issue is updated to
  reference #376 for that AC.
- Reviewers see both changes in one diff — larger surface, single coherent
  review of the review artifact.
- This is an explicit exception to the one-PR-per-story default, scoped to the
  shared-lane rationale above; it does not loosen the default generally.
