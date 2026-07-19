# ADR-017: Automation loop architecture — pair-loop over the pair-next atom, implement-batch as its batch engine, workflows shipped in the dataset

## Status

Accepted

## Date

2026-07-19

## Context

- Epic #212 (supervised automation) needs a loop that drives many backlog cards to delivery with minimal human involvement. Two backlog stories framed the loop divergently: **#250** as `--steps/--until` flags **on** `pair-next`, and **#219** as a **supervisor loop** over `pair-next`. They are two framings of the same behavior (repeat until a stop condition), split across the selector and a separate supervisor.
- `pair-next` is a pure, re-evaluated-each-step **selector** — one recommendation per call, no cached plan, no criteria of its own (D18). Putting loop state (`--steps/--until`) on it would break that atomicity and mix selection with control flow.
- A multi-card loop that runs inside a single agent's context **exhausts the context window** (each card's tool output accumulates). The proven alternative — used throughout this project's own delivery — is a **fan-out orchestrator** (`.claude/workflows/implement-batch.js`, ADL `2026-07-11-agent-execution-layer`): a deterministic workflow that spawns a **fresh subagent per card**, keeping the orchestrator context lean (only compact per-card results flow back).
- Workflows are Claude-Code-specific JS orchestration; the shipped KB dataset is portable, tool-agnostic markdown — a portability question for any automation the product ships.
- The per-tier gate/approval policy already exists in the quality model (🟢 self-merge at green checks; 🟡/🔴 require review/approval — D10) and `tech/risk-matrix.md`. What is missing is an explicit **automation policy** (which tags auto-advance unattended, stop predicate, audit) and a home for it.
- **Hard to reverse**: shipping workflows + the agent-execution-layer as installable product changes what the dataset *is*; unwinding later means pulling published tool-specific content back out.
- **Surprising without context**: that `pair-next` deliberately does NOT loop, that the loop is a workflow composing another workflow, and that the dataset now carries Claude-Code-only artifacts, are all non-obvious from the code.
- **Real trade-off**: the rejected alternatives kept automation dogfood-only and/or put the loop flags on `pair-next`. Rejected to make automation a shippable product feature while preserving pair-next's atomicity.

## Options Considered

### Option 1: `--steps/--until` on `pair-next`; the atom loops itself
Rejected — breaks pair-next's atomicity (it would hold loop state), and if realized as in-context iteration it burns the context window on many cards.

### Option 2: the loop as a skill executed in-context (LLM re-reads instructions each turn)
Rejected — an LLM "looping" in one context is fragile, non-deterministic, non-auditable, and accumulates context. Control flow belongs in deterministic orchestration.

### Option 3 (chosen): the loop is a fan-out workflow composing a generalized batch workflow; pair-next frozen; a thin portable skill fronts it; workflows shipped in the dataset; policy in a dedicated adoption file
See Decision.

## Decision

1. **`pair-next` stays a frozen atom** — selection/scoping only (`--root`, `--filter`), re-evaluated per step, no loop state. `--steps/--until` do **not** go on it.

2. **The loop is a workflow, not in-context iteration. Two workflows, one per story:**
   - **#219 — `implement-batch` generalized**: the existing batch orchestrator, generalized beyond pair-specifics and shipped, drives N mutex-safe cards to review-approved PRs (fresh subagent per card; never merges past the human/policy gate).
   - **#250 — `pair-loop`**: the loop engine. Per iteration it selects eligible cards via `pair-next`, runs a **dependency analysis**, and **composes `implement-batch`** to drive a mutex-safe batch in parallel when warranted (else sequential); enacts the automation policy; evaluates the stop predicate. `pair-loop` **absorbs the supervised behaviour** (eligibility + audit) — #219 is no longer a separate "supervisor".
   - **Sequencing: #219 before #250** (pair-loop composes implement-batch).

3. **Context isolation is an architectural invariant, not an implementation detail**: the loop MUST fan out to fresh per-card subagents; it must NEVER iterate multiple cards in one context. The audit trail is written to a file (`.pair/working/`), not held in context. Checkpoints (#254) make it resumable.

4. **A thin `pair-loop` skill ships in the dataset** as the discoverable entry + contract + degradation guard. Its **Realization** rule: if a fan-out runner exists (Claude Code `Workflow`), delegate the unattended loop to the workflow; otherwise (any other tool) run **exactly one** eligible card to its gate this invocation, write the audit/checkpoint, then stop and report a continue-token for the caller (human/CI/cron) to re-invoke. Never iterate multiple cards in-context portably.

5. **Workflows ship in the dataset, installed for everyone — no tool-gating mechanism now.** Workflows are Claude-Code-specific but are distributed in the dataset and installed unconditionally; non-Claude-Code users get a **documentation note** on how to configure/run them (or use the skill's degraded path). No install-time tool-gating is built now — a future tool-selection/config mechanism may add it. Keeps the change simple and additive; does not break portability (other tools just don't run the workflow).

6. **Automation policy lives in a dedicated adoption file `tech/automation.md`** (not way-of-working): the **eligibility filter** over classification tags (which tiers auto-advance unattended, e.g. `risk:green`), the **gates required** for auto-advance (referencing the quality-model per-tier policy), the **stop-predicate/step** defaults, and the **audit** location. Auto-advance **enacts the tier policy that already exists** (quality model D10): `risk:green` + green checks ⇒ push+merge unattended; higher tiers halt for the human. No second source of truth.

## Consequences

### Benefits
- pair-next stays pure/deterministic; automation is a thin declarative loop over it, with no criteria of its own (D18 preserved).
- Context-safe by construction (fan-out per card) — scales to many cards without context burn, proven by this project's own delivery.
- Automation becomes a shippable product feature (pair-loop + generalized implement-batch), not just a dogfood tool.
- One coherent model: #250 and #219 stop being two framings of a loop — #250 composes #219.
- Auto-advance reuses the existing per-tier quality-model policy.

### Trade-offs and Limitations
- The dataset now carries Claude-Code-specific artifacts (workflows + the agent-execution-layer they spawn), installed for all tools; non-Claude-Code users receive content they can't run unattended until they follow a docs-configured path or use the degraded skill. Accepted for simplicity; tool-gating is a deferred follow-up.
- Generalizing implement-batch (#219) depends on shipping the agent-execution-layer (implementer/reviewer agents) as product — a larger surface than the original story.
- No portable unattended loop: portable tools get one-card-per-invocation, re-triggered externally.

## Related
- Supersedes the framing of **#250** (loop flags on pair-next) and **#219** (standalone supervisor); both reformulated under this ADR.
- ADL `2026-07-11-agent-execution-layer` (the workflow/agent substrate). Quality model D10 (per-tier policy). Epic #212 (supervised automation), #204 (pair-next), #254 (checkpoints).
