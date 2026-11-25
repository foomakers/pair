# Automation Policy — this project's delta

`.pair/adoption/tech/automation.md` — the schema is documented in full in
[`automation-policy.md`](../../knowledge/guidelines/collaboration/automation/automation-policy.md)
(D21, adoption-is-delta-only: this file records only this project's own values, never the
complete default schema).

## Autonomy

preset: full

## Workflow Configuration Tiers

This project's `pair.config.json` puts red, yellow and green in that order under `workflows.default.tiers`. The first matching card label selects the high, medium or cheap YAML configuration for the run's engine. Unlabelled cards use the existing medium configuration. YAML workflows use these entries in place of the legacy profile resolver's `byTier` settings. See [decision](../decision-log/2026-11-25-yaml-workflow-configuration-tiers.md).

## Recovery Budget Ordering

Recovery budgets use durable handoff publication identities and accepted maintainer reset references, not timestamp order. Archiving is not progress; unreadable evidence does not reopen a spent budget. Legacy records use conservative timestamp comparison. See [decision](../decision-log/2026-11-19-recovery-budget-event-identity.md).

## Blocking Severities

Minor

## Stop Predicate

tag:risk:red ⇒ Done

## Audit Location

automation/loop-audit.md

## Publish-PR Hooks

Optional commands that `publish-pr` executes at defined points. Each hook is a shell command string.

- `pre-publish` — runs after PR creation, before quality gate. Fails the publish if non-zero.
- `post-publish` — runs after quality gate passes, before review dispatch. Failure does not block (logs only).

- `pre-publish`: `pnpm mirrors:regenerate`

## Telemetry

Local delivery records under `.pair/working/telemetry/`. Absent setting defaults off; `pair-cli run --telemetry` or `--no-telemetry` wins for one run.

- enabled: true

Price table (USD per million tokens; maintained by hand, empty ⇒ cost reads `not measured`):

```json
{ "prices": {} }
```
