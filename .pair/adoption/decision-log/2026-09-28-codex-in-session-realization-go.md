# Decision: Codex in-session realization of the delivery cycle — go

## Date

2026-09-28

## Status

Active

## Category

Tooling Preference

## Context

Story #441 had to decide, on evidence, whether `pair-workflow-cycle`'s `codex` realization (the `collaboration.*` sub-agent tools) is worth keeping next to `pair-cli run --card --engine codex` (#487), or closed `superseded`. Probed against `codex-cli 0.157.1`, model `gpt-6-luna`.

## Decision

**Go.** The `codex` row of the realization table stays, bound by the probed `collaboration.spawn_agent` / `collaboration.followup_task`.

Evidence (details in `agent-harness/codex.md`):

- A Codex session's tool list exposes `collaboration.{spawn_agent, wait_agent, send_message, followup_task, interrupt_agent, list_agents}`; `cycle-dispatch.mjs realizations` binds `codex` from it.
- A Codex-coordinated cycle ran `resolve` → `packet` → a fresh `spawn_agent` stage whose sub-agent executed `pair-workflow-review-phase` on PR #516 and published its handoff, review comment, check and label; the second `resolve` continued from it.
- `followup_task` resumes the same agent with its session (it recalled a secret given in the earlier turn).
- Same stage through `pair-cli run --engine codex`: same verdict and findings, 21 min vs 18 min, one new process per stage and no resume.

## Alternatives Considered

- **Close `superseded`, keep only `pair-cli`.** Rejected: `pair-cli` cannot honour `next.context: reuse` (every stage is a new process), the in-session path can.

## Consequences

- Positive: Codex users get the same cycle in-session as Claude users, with same-agent resume.
- Negative: Codex's sub-agent surface has changed namespace before; the row keeps its aliases and the probe discipline, and `pair-cli` remains the fallback.
