# Automation Policy — this project's delta

`.pair/adoption/tech/automation.md` — the schema is documented in full in
[`automation-policy.md`](../../knowledge/guidelines/collaboration/automation/automation-policy.md)
(D21, adoption-is-delta-only: this file records only this project's own values, never the
complete default schema).

## Eligibility

risk:green

## Auto-Advance

(none)

## Stop Predicate

tag:risk:red ⇒ Done
max-iterations: 20

## Max Parallelism

3

## Audit Location

automation/loop-audit.md

## Publish-PR Hooks

Optional commands that `publish-pr` executes at defined points. Each hook is a shell command string.

- `pre-publish` — runs after PR creation, before quality gate. Fails the publish if non-zero.
- `post-publish` — runs after quality gate passes, before review dispatch. Failure does not block (logs only).

- `pre-publish`: `pnpm mirrors:regenerate`
