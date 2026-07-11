# Decision: `.pair/working/` Artifacts Are Task-Scoped and Cleaned Up

## Date

2026-07-11

## Status

Active

## Category

Process Decision

## Context

Story #254 (`pair-capability-checkpoint`) writes checkpoints to `.pair/working/checkpoints/<story-id>.md`. During code review of PR #270, the concern raised was not _when_ checkpoints get written (writing them automatically — e.g. `/pair-process-implement` between tasks — is acceptable), but that a checkpoint's content must not **leak as context** into chats or activities unrelated to the task it describes, and that finished-story checkpoints should not linger.

D14 already governs distribution (`.pair/working/` is never touched by `install`/`update`). What was missing is a **runtime consumption-scope** policy.

## Decision

**A `.pair/working/` artifact is task-scoped, consumed only downstream, and cleaned up on completion.**

- **Scope:** a checkpoint (or report/handoff) belongs to exactly one task/story. It is consumed only when resuming or continuing _that_ task (downstream — the next session or subagent on the same work). It is NEVER loaded as ambient context into a chat or activity unrelated to that task.
- **Writing is unconstrained:** the file may be written automatically (e.g. between tasks) — the constraint is on consumption scope, not on write timing.
- **Cleanup:** when the story is Done (its closing phase, or PR merge), the checkpoint is removed so finished-story state never persists as stale context.

Division of responsibility: `AGENTS.md` (dataset-shipped → downstream projects inherit + this repo's root `AGENTS.md`/`CLAUDE.md`) carries only the minimal cross-cutting principle — `.pair/working/` is never loaded as context unless explicitly specified, and the skills that use it decide if and how. The task-scope, downstream-consumption, and cleanup detail lives in the `checkpoint` `SKILL.md` Core Rule "Task-Scoped, Cleaned Up" (dataset + installed mirror).

## Alternatives Considered

- **Make checkpoint writes opt-in / never automatic**: rejected — auto-write between tasks is a legitimate, useful default; the real risk is cross-task context leakage, not the write itself.
- **Rely on D14 only**: rejected — D14 covers distribution, not runtime consumption scope.
- **No cleanup (leave checkpoints in place)**: acceptable but weaker — stale finished-story checkpoints add noise and risk being picked up out of context; cleanup on completion is preferred.

## Consequences

- Composers that consume checkpoints (`/pair-process-implement` closing phase #256, `/pair-capability-publish-pr` #255, future supervisor #212) must scope reads to the active task and remove the checkpoint on story completion.
- Cleanup is enforced at merge now: `/pair-process-review` Phase 6.5 (Branch Cleanup) removes `.pair/working/checkpoints/<story-id>.md` when the story's PR merges (dataset + installed mirror). The `/pair-process-implement` closing phase (#256) remains responsible for cleanup when a story completes without going through review-merge.

## Adoption Impact

- No project-level configuration change. It is a cross-cutting agent/skill behavioral rule, documented in `AGENTS.md` (dataset-shipped + root) and the `checkpoint` `SKILL.md` (dataset + installed mirror). Downstream projects inherit it via the shipped `AGENTS.md`.
