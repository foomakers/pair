# Decision: Preserve assignment on card updates

## Date

2026-11-25

## Status

Active — amends [2026-11-23 assign on start](2026-11-23-assign-on-start.md).

## Category

Process Decision

## Context

The previous decision left `default-assignee` active on item updates. Refining an unassigned card therefore assigned it before development began, contradicting the purpose of assignment on start.

## Decision

Issue creation and updates use an assignee only when explicitly supplied. Otherwise creation leaves the card unassigned and updates preserve its current assignment, including no assignee. Starting development remains responsible for taking an unassigned card in charge. Pull request assignment and maintainer identity retain their existing defaults.

## Alternatives Considered

- **Keep default on updates**: refinement would continue to assign cards before development.

## Consequences

Refinement and task breakdown do not change assignment. Existing assignees remain intact and explicit assignment remains available.

## Adoption Impact

- `tech/way-of-working.md`: document the same rule for create and update.
- `write-issue` and the shared assignee resolution convention: preserve assignment on update.
