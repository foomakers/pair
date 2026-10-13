# Decision: `mode: doc` remediation groups; the loop retries only transient failures

## Date

2026-10-06

## Status

Active (amends the remediation grouping of ADR-024's delivery workflow; refines the retry rule of the 2026-10-06 card-drive ADL)

## Category

Process Decision

## Context

Two skill/KB-text cards (#253, #252) ended `failed-contract`: their findings were about prose, and the executable witnesses red-spec had to write were text-matching tests. The validator kept finding correct rephrasings the tests rejected or classes they missed; the `redRepairs` budget ran out. Separately, the loop retried such a durable terminal like a transient failure.

## Decision

Maintainer decision (2026-10-06):

- **AE — `fixScope.mode: doc`.** For findings fixed by prose alone, red-spec plans a doc group: `allowedPaths` are prose files only, and the contract is an acceptance `checklist` (what the text must state, per finding, against its authority) instead of executable witnesses. red-verify validates inventory, scope and checklist (no reproduction; handoff carries `contractMode: doc` + `checklistValidated`) and seals the manifest alone. green-fix edits only within `fixScope` and returns an evidence ledger per checklist item. review-phase verifies the checklist against the diff and the authority. A doc group never carries executable tests; a finding that touches behaviour stays behavioral. Single owner: `.pair/knowledge/guidelines/collaboration/automation/doc-remediation-groups.md`. Custody (`red-snapshot.mjs`) and routing (`cycle-state.mjs`) treat it like any group, so `pair-cli` and the batch/loop workflows consume it unchanged.
- **AD — transient-only retry.** `pair-cli run --watch` and `pair-loop.js` retry a failure only when it is transient (no cycle status reported — a crash or engine/API error; a dead dispatch, a stall; a card the batch returned no outcome for) and within the per-run budget. A durable cycle terminal (`failed-contract`, any `failed-*`, `escalate` awaiting a human) is reported with its reason and excluded.

## Alternatives Considered

- Keep text-matching witnesses and give the validator more repair rounds: rejected, the failure is structural (a prose fix has no discriminating executable witness).
- Re-plan a failed-contract round into a doc group automatically in `resolve`: not done — recovery is explicit (supersede the rejected tail), see the recovery commands.

## Consequences

- Prose findings converge through a reviewable checklist instead of looping on test phrasing.
- A durable failure no longer costs a second full cycle.
