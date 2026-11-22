# ADR-036: No hidden rules — approvals and gates are steps

## Status

Accepted

## Date

2026-11-22

## Context

Story #680. Approval, escalation, deterministic gates and merge live in autonomy code (`hold-when`, presets, tier gate, closure), invisible in the workflow file. A project cannot see or change them.

## Decision

- Three kinds run by the host with no agent: `gate` (registry keys and four closed checks), `approval` (parks; answers by flag, card comment or native review), `merge` (merges, closes, cascades, cleans up; `head-moved` when the head changed).
- A gate entry is a Custom Gate Registry key, `target:<name>` (the registry rows of that target) or `command:<shell line>`. Shipped dataset workflows carry no `command:` entry: their gates come from the registry, so the shipped workflow hides no command. A workflow installed in a project may use `command:`; the project owns that file and its commands are visible in it.
- An approval counts only when the platform authorizes its author; the workflow holds no names.
- `when` (card facts, or an earlier step's output) on any step but a loop and its `until` step; a non-matching step is `skipped`. A transition is a deterministic `when`, not a prompt.
- The validator warns, never blocks, on a `merge` with no approval, review or `head-unchanged` gate before it.
- Required checks stay the platform's merge authority (ADR-018): `merge` fails with the platform's refusal.
- Autonomy code and sections stay until #700.

## Consequences

Every rule is a visible step a project edits. Hosts must supply platform fact readers and the approval/merge adapters; a host without them fails those steps (`no-platform-adapter`, `no-executor`) rather than assume.
