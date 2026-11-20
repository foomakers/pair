# Decision: Order Recovery Budgets by Durable Events

## Date

2026-11-19

## Status

Active

## Category

Process Decision

## Context

Handoff filesystem timestamps have finer precision than the millisecond timestamps stored for recovery rounds. A handoff and a retry in the same millisecond can therefore leave a spent budget appearing unused. Reset decisions also need to survive interruption between decision recording and recovery audit updates.

## Decision

Stamp qualifying handoffs with a script-generated publication identity. Recovery rounds record the observed progress identities and accepted maintainer reset references; a new qualifying identity or reset advances the corresponding budget. Archiving alone is not progress. Reset decisions are recorded atomically and recovery audit entries are reconciled from the durable decision. Legacy rounds use conservative timestamp comparison; corrupt evidence does not prove progress.

## Alternatives Considered

- **Round filesystem timestamps:** equal timestamps cannot establish event order.
- **Compare the current set hash:** archival or deletion would falsely look like progress.

## Consequences

Handoff and recovery records gain backward-compatible metadata. Existing ambiguous legacy records may require a maintainer reset. A missing or unreadable proof does not reopen a spent budget.

## Adoption Impact

`adoption/tech/automation.md` records recovery budget ordering and fallback behavior.
