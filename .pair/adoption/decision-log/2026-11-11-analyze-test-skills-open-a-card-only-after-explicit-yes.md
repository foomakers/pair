# Decision: `analyze-test-speed` and `analyze-test-prune` may open a card, only after an explicit yes

## Date

2026-11-11

## Status

Active

## Category

Tooling Preference

## Context

`analyze-*` skills are report-only ([2026-07-13-skill-naming-verb-taxonomy](./2026-07-13-skill-naming-verb-taxonomy.md)). Card #626 adds two that end with a proposal to open a card. The ban on filing cards ([2026-08-12-implementation-never-files-a-card-it-extends-the-story](./2026-08-12-implementation-never-files-a-card-it-extends-the-story.md)) binds implement and review, not a standalone analysis.

## Decision

- Both skills create nothing by themselves: production code, tests and everything but one report stay unchanged.
- At the end each asks "Open a card for these steps?", listing them. A card is opened only after an explicit yes, composing `/pair-capability-write-issue` (same deliberate-promotion path as `analyze-debt`).
- Never unattended: no yes, no card.
- Candidates are never deleted; mutation runs only in a clean, disposable worktree.

## Alternatives Considered

- Return the report only: rejected, the card step is the point of the follow-up (#627 consumes the prune report).
- Open the card automatically: rejected, breaks the report-only contract.

## Consequences

The exception is limited to these two skills; a conformance test pins the question, the steps and the no-yes-no-card rule.
