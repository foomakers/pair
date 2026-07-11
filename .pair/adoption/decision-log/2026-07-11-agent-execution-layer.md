# Decision: Agent Execution Layer (typed subagents + Workflow orchestrator)

## Date

2026-07-11

## Status

Active

## Category

Process / Tooling Decision

## Context

Executing Pair's own backlog in parallel (dogfood) needs an orchestration mechanism above the skills: something that drives a story through implement → PR → independent review → fix while keeping merge a human gate. Claude Code offers two primitives — **typed subagents** (`.claude/agents/*.md`) and a **Workflow** DSL (`.claude/workflows/*.js`) — that other assistants (e.g. Codex) do not have.

The question: are these part of Pair the framework, or a Claude-Code-specific add-on?

## Decision

**Introduce an optional agent execution layer, Claude-Code-specific and additive — NOT core.**

- **Roles** (`.claude/agents/`): `implementer` (implement + PR + fix; write-access; disciplined handoff via checkpoint; never merges) and `reviewer` (read-only; independent; **blind to the handoff** — reviews only story AC + PR diff + code; runs `/pair-process-review`).
- **Orchestrator** (`.claude/workflows/implement-batch.js`): drives a mutex-safe batch of stories to PR-ready via the review↔fix loop; **never merges**.
- **Portability boundary:** the process *logic* stays in the **skills** (`SKILL.md`, portable cross-assistant, shipped in the dataset). Subagents + Workflow are an **execution layer** on top — opt-in, not required. One-story-at-a-time manual use of the skills remains fully valid.

Invariants baked into the layer:

- **Merge is always the human gate** — the orchestrator halts at PR-ready.
- **Review is independent and blind** — the handoff flows only in the authoring chain (implement → PR → fix), never into verification.
- **Isolation:** the authoring chain runs in a per-story worktree (`../pair-worktrees/<id>`); the reviewer inspects in a detached throwaway worktree — the main working tree is never mutated, so parallel batches don't collide.
- **All findings resolved:** the loop converges only when no *actionable* finding remains; by-design findings are marked `nonActionable` and surfaced to the human at the merge gate.

## Alternatives Considered

- **Put orchestration inside a skill/subagent**: rejected — a subagent cannot spawn subagents, so multi-story orchestration must live in the Workflow script (its `agent()` calls are the spawns).
- **Make it core framework content**: rejected — subagents/Workflow are Claude-Code-specific; the portable core is the skills. This layer is additive.
- **Let the orchestrator merge autonomously**: rejected — merge stays a human gate.

## Consequences

- Validated by smoke test on 2026-07-11 (story #248 → PR): implement → checkpoint handoff → PR → blind review → HALT; `nonActionable` and worktree-isolation behaviours confirmed.
- To be folded into the framework proper via #255 (`pair-capability-publish-pr`), #256 (`pair-process-implement` composes checkpoint + publish-pr via subagent), #219 (supervisor loop) — each with its own ADR/ADL as it lands.
- `.pair/working/` is git-ignored (checkpoints are task-scoped runtime state, D14 / working-artifacts-task-scoped).

## Adoption Impact

- No downstream project configuration change. This layer lives under `.claude/` in this repo as an opt-in dogfood execution layer; it is not part of the shipped dataset/KB. Downstream projects continue to use the skills directly; the execution layer is offered separately once #255/#256/#219 formalize it.
