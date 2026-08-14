# Decision: Agent Execution Layer (typed subagents + Workflow orchestrator)

## Date

2026-07-11 (amended 2026-07-18, 2026-08-13)

## Status

Active (amended 2026-08-13 — the execution layer now SHIPS in the dataset; the "not part of the shipped dataset/KB" clause below no longer holds. See `2026-08-13-the-agent-execution-layer-ships.md`)

## Category

Process / Tooling Decision

## Context

Executing Pair's own backlog in parallel (dogfood) needs an orchestration mechanism above the skills: something that drives a story through implement → PR → independent review → fix while keeping merge a human gate. Claude Code offers two primitives — **typed subagents** (`.claude/agents/*.md`) and a **Workflow** DSL (`.claude/workflows/*.js`) — that other assistants (e.g. Codex) do not have.

The question: are these part of Pair the framework, or a Claude-Code-specific add-on?

## Decision

**Introduce an optional agent execution layer, Claude-Code-specific and additive — NOT core.**

- **Roles** (`.claude/agents/`): `implementer` (implement + PR + fix; write-access; disciplined handoff via checkpoint; never merges) and `reviewer` (read-only; independent; **blind to the handoff** — reviews only story AC + PR diff + code; runs `/pair-process-review`).
- **Orchestrator** (`.claude/workflows/pair-implement-batch.js`): drives a mutex-safe batch of stories to PR-ready via the review↔fix loop; **never merges**.
- **Portability boundary:** the process *logic* stays in the **skills** (`SKILL.md`, portable cross-assistant, shipped in the dataset). Subagents + Workflow are an **execution layer** on top — opt-in, not required. One-story-at-a-time manual use of the skills remains fully valid.

Invariants baked into the layer:

- **Merge is always the human gate** — the orchestrator halts at PR-ready.
- **Review is independent and blind** — the handoff flows only in the authoring chain (implement → PR → fix), never into verification.
- **Isolation:** the authoring chain runs in a per-story worktree (`../pair-worktrees/<id>`); the reviewer inspects in a detached throwaway worktree — the main working tree is never mutated, so parallel batches don't collide.
- **All findings resolved:** the loop converges only when no *actionable* finding remains; by-design findings are marked `nonActionable` and surfaced to the human at the merge gate.
- **Escalation retry, not per-round check-in:** when a batch invocation escalates (round-cap reached, or `needsHumanDecision`) without a genuine design ambiguity or conflicting requirement, the operator re-invokes the same review↔fix cycle rather than pausing to ask permission for "another round" — the cycle runs to convergence. A pause for a human call is reserved for a real ambiguity, not routine continuation.
- **`nonActionable` still means fix it if it's fixable:** a finding marked `nonActionable`/by-design/out-of-scope is not an automatic pass — it means "don't force a fix that would be wrong for this specific reason" (e.g. would create a new inconsistency, contradicts an already-tracked deferred plan). A finding that is real and fixable, even if not strictly introduced by this story's stated scope, gets fixed as part of the same cycle rather than deferred to an unscheduled follow-up story. Only genuinely out-of-reasonable-size work (e.g. a repo-wide sweep touching many unrelated files) is deferred, and only after surfacing the scope call to the human rather than deciding unilaterally.

## Alternatives Considered

- **Put orchestration inside a skill/subagent**: rejected — a subagent cannot spawn subagents, so multi-story orchestration must live in the Workflow script (its `agent()` calls are the spawns).
- **Make it core framework content**: rejected — subagents/Workflow are Claude-Code-specific; the portable core is the skills. This layer is additive.
- **Let the orchestrator merge autonomously**: rejected — merge stays a human gate.

## Consequences

- Validated by smoke test on 2026-07-11 (story #248 → PR): implement → checkpoint handoff → PR → blind review → HALT; `nonActionable` and worktree-isolation behaviours confirmed.
- To be folded into the framework proper via #255 (`pair-capability-publish-pr`), #256 (`pair-process-implement` composes checkpoint + publish-pr via subagent), #219 (supervisor loop) — each with its own ADR/ADL as it lands. **#219 landed 2026-08-13** and is what makes the layer shipped rather than dogfood-only; see the amendment on Adoption Impact.
- `.pair/working/` is git-ignored (checkpoints are task-scoped runtime state, D14 / working-artifacts-task-scoped).
- Amended 2026-07-18: the wave-1 follow-up cleanup surfaced that the operator was pausing after every review round to ask whether to continue — the two added invariants above (escalation retry, `nonActionable` isn't an automatic pass) close that gap, per explicit correction from the repo owner.

## Adoption Impact

- ~~No downstream project configuration change. This layer lives under `.claude/` in this repo as an opt-in dogfood execution layer; it is not part of the shipped dataset/KB. Downstream projects continue to use the skills directly; the execution layer is offered separately once #255/#256/#219 formalize it.~~
  **Amended 2026-08-13 by #219** (`decision-log/2026-08-13-the-agent-execution-layer-ships.md`): #219 is the story this clause named,
  and it reopened the question the way the clause anticipated. The execution layer — the workflows AND the agent definitions they
  dispatch to — now ships in the dataset and installs into every adopter's `.claude/workflows/` and `.claude/agents/`,
  unconditionally and with no tool-gating. `pair install` therefore DOES write two directories in a downstream project. The
  decision itself stands: what changed is its distribution, not its design, which is why this record is amended rather than
  superseded.
