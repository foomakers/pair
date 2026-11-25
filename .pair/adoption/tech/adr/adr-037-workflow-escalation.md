# ADR-037: Workflow escalation and status routing

## Status

Accepted

## Date

2026-11-25

## Context

Story #728 needs workflow authors to handle a failed attempt, a missing prerequisite, a human decision and loop exhaustion differently. The old `needs-human` result represented several of those cases and mixed a kind's result contract with what the run should do next.

## Options Considered

### Keep consequences in kind contracts

Each kind would own its response to each outcome. Authors would need new kind code for a different retry or stop policy.

### Declare consequences in the workflow

Each kind describes the outcomes it can return. The workflow controls continuation and stopping in file order, including a later step guarded by an earlier status.

## Decision

Use workflow-local policies and keep grammar version 1.

- Steps return `ok`, `failed`, `blocked` or `needs-decision` as allowed by the kind's `returns`. The engine records `exhausted` when a loop spends its budget and `skipped` when a condition fails. It reserves `status` for the outcome.
- A rule under `escalate` maps an outcome to `continue` or `stop`. The long form adds a card comment. The host interpolates `{reason}` and upserts the comment by run, step, round and outcome.
- A stopped failed step makes the run failed. Blocked and decision outcomes park by default and resume at the stopped step. Explicit exhaustion stops park and accept `--more-rounds`. `on-failed` preserves its stop or continue behavior. Legacy `on-max: escalate` parks and `on-max: fail` fails the run. Unconfigured loop children retain their convergence behavior.
- `when` can read `<step>.status` or `<loop>.status` after the producer. A skipped producer leaves that output absent. Execution stays in file order. A stronger retry is a later step with another alias. Jumps are invalid.
- First runtime reads migrate legacy `needs-human` in persisted state and telemetry to `needs-decision`. The step result contract rejects the old spelling. Telemetry schema 2 gains optional fired-rule metadata and a zero-token record for exhaustion. Compatible additions retain the schema number.
- The workflow validator reports rules that cannot fire, impossible status conditions and comments without host support. It lists declared returns handled by neither an escalation rule nor a shorthand, including when `escalate` is absent. Shipped workflows declare their existing actions to preserve warning parity. A workflow that continues past a block or decision and reaches a merge without prior approval gets a warning.

## Consequences

Workflows can declare retries, stops and follow-up routes without changing kind code. Workflows without explicit rules keep their default routing. Exhausted runs now expose an outcome separate from the run's failed or parked state. A comment failure is reported while the selected action still applies.

## Adoption Impact

- [Architecture](../architecture.md) identifies the workflow policy boundary.
- [ADR-032](adr-032-step-kinds-contracts-and-result-collection.md) uses the current result contract.
- [ADR-035](adr-035-bounded-workflow-loops.md) carries the loop exhaustion amendment.
