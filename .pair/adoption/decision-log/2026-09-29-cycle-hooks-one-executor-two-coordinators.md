# Decision: cycle hooks run through one shared script the two portable coordinators call; the batch engine reports its own skip once per run

## Date

2026-09-29

## Status

Active

## Category

Tooling Preference

## Context

US-489 generalizes `## Publish-PR Hooks` to every stage boundary of the delivery cycle (`## Cycle Hooks` in `tech/automation.md`). Two coordinators must give identical blocking/logging semantics (AC7): `pair-workflow-cycle` (an agent following a skill) and `pair-cli run --card` (TypeScript). `pair-implement-batch.js` runs in a Workflow sandbox with no shell and cannot execute a hook at all (AC8).

## Decision

1. **One executor, `pair-workflow-cycle/scripts/cycle-hooks.mjs`** (dependency-free, like `blocking-severities.mjs`). It parses the section, names hooks by pattern from `cycle-state.mjs`'s `STEPS` (never a list kept beside it), decides blocking (`pre-*`) vs logging (`post-*`, `on-halt`), and gates `on-halt` to `failed-*`/`escalate`. The skill calls its CLI; pair-cli spawns the installed script the same way it spawns every other cycle script. Neither realization carries a hook rule, so there is no parity test to keep (contrast `blocking-severities`, ported twice).
2. **A blocking hook's failure is the terminal `failed-hook`**, with the command's own output verbatim, so `on-halt` and `post-cycle` fire on it through the ordinary `failed-*` rule.
3. **`post-cycle` runs when the cycle reaches a terminal status, not when an invocation merely stops at the `--rounds` bound** (`rounds-bound-reached`), nor on the statuses `resolve` answers without a `next` (`incompatible`, `invalid`, `other-run`).
4. **pair-cli and an installed skill older than this story**: a missing `cycle-hooks.mjs` is silent when no `## Cycle Hooks` is declared and a typed `skill-outdated` error when one is — a declared hook never becomes a quiet no-op.
5. **The batch engine cannot read the adoption file**, so its once-per-run notice ("cycle hooks are NOT executed by pair-implement-batch") is unconditional, and the result carries `cycleHooks: { executed: false }`. AC6's "no line about a skipped hook" is honoured by the two coordinators, where the section can be read.

## Consequences

Adding a stage (e.g. `merge`, #490) yields `pre-merge`/`post-merge` with no edit here. Changing hook semantics is one script plus its test.
