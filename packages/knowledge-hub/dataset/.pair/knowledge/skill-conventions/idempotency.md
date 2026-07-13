# Idempotency Convention

Re-invoking a skill that already produced its output is always safe: the skill **detects** the existing artifact (file, adoption section, PM-tool state, prior report) and **confirms** it rather than blindly redoing the work. Redo only happens on an **explicit** request — never as the default.

This is the general shape:

1. **Check**: Does the artifact this invocation would produce already exist (in whole or in part)?
2. **Skip**: If it doesn't exist yet, proceed with the normal (first-run) algorithm.
3. **Act**: If it exists, present it and confirm it's still valid/current — do not regenerate.
4. **Verify**: Confirmed → exit (or resume from the first missing piece, for multi-part artifacts). Explicit redo request → proceed with regeneration.

## What stays in the skill (the delta)

The **generic shape above never needs restating**. Every skill keeps only the one line that says what the artifact is and how re-invocation detects it — e.g. "detects existing files by filename", "shows current state instead of re-creating", "task-level: appends only missing tasks". That one line is the entire per-skill delta; write it as a single Notes bullet:

> **Idempotent** — see [idempotency convention](../../../.pair/knowledge/skill-conventions/idempotency.md). This skill's check: `<what is detected and how>`.

## Orchestrators (multi-phase skills)

The three orchestrators (`/bootstrap`, `/implement`, `/review`) resume **per-phase/per-task**, not as a single artifact check. They keep their own itemized resume list (which phase/task is detected as done and skipped) — that list is genuinely skill-specific and is not duplicated elsewhere. Only the generic framing sentence ("re-invoking `/X` on a partially completed run is safe and expected") and the closing "idempotency ensures correct state" reminder are boilerplate — those point here instead of restating the convention.
