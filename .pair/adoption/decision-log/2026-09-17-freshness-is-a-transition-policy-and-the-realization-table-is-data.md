# Decision: subagent freshness is a transition policy the cycle state owns, and the harness realization is a probed table of data

## Date

2026-09-17

## Status

Active

## Category

Process Decision

## Context

US-486 adds `/pair-workflow-cycle`, an in-session coordinator that drives one card's delivery cycle
from a Claude Code or Codex session instead of from the `Workflow` tool. Two questions had no
recorded answer, and both are the kind that quietly becomes a second state machine if each
realization answers it for itself.

**(1) Who decides whether a stage gets a new subagent?** Engine 4.0.1 spawns a fresh subagent for
every dispatch, so the question never had to be asked. A coordinator that can also *resume* a
subagent (`SendMessage`, `resume_agent`) suddenly has a choice — and a choice taken in skill prose
is a choice each realization takes differently. It is also a correctness question, not an
optimization one: a `validate` or `verify` stage that inherits the author's context is no longer an
independent verifier (ADR-017 §3, ADL 2026-07-11 reviewer blindness).

**(2) How does the coordinator know which harness it is running on?** #441's probe discipline and
ADR-021 already say availability is established by probing, never inferred from a product name. The
Codex tool surface is the repository's most volatile external contract (v1/v2 namespaces, one
default-off, a removed mechanism), so whatever holds it must be cheap to change.

## Decision

1. **`next.context` is a field of the cycle state, returned by `resolve` on every transition.**
   `CONTEXT_TABLE` in `cycle-state.mjs` holds the rule as data: the default is `fresh` everywhere,
   and `reuse` is admissible only for `prepare→prepare`, `implement→green` and `green→green`. A
   transition's `from` is the last step played by the SAME agent role — `reuse` resumes the previous
   subagent of that role, so `implement→green` spans the verification that sits between them.

2. **`reuse` into `validate` or `verify` is refused fail-closed, in the script.** `--contextPolicy`
   (the knob #488's profile will drive) is validated as a whole before any state is read; asking
   `reuse` where the table forbids it is `context-policy-invalid`, never a silent downgrade to
   `fresh`. A downgrade would hide a wrong profile until a review turned out not to be independent.

3. **The KB default stays `fresh` on every transition.** The baseline is frozen before it is
   optimized (ADR-024): `reuse` ships as an admissible answer, not as a behaviour anyone gets today.

4. **The realization table is one array of data in `cycle-dispatch.mjs`**, keyed by the DISPATCH
   primitive (`Agent` → Claude, `spawn_agent` → Codex) with its resume primitive and how the role
   travels. The coordinator binds the row whose primitive its own toolset actually exposes. A
   product name or a version string binds nothing — it is reported in the HALT as what *claimed* to
   be there, and never as evidence.

5. **No row ⇒ HALT `realization-unavailable` before any dispatch**, printing the `pair-cli run
   --card N [--pr P]` fallback (#487), with the optional `--pr` omitted when there is no PR. Also
   the answer when the skill is itself running inside a subagent and the host forbids nesting.

## Alternatives Considered

- **Freshness decided by the coordinator skill, from the step name**: rejected — two realizations
  would read the same prose and diverge, and the one rule that must not be got wrong (independent
  verification) would live in prose rather than in the authority that already owns every other
  transition.
- **`reuse` silently downgraded to `fresh` where the table forbids it**: rejected — it makes a
  misconfigured profile indistinguishable from a correct one, which is exactly the class of failure
  the reviewer-blindness rule exists to prevent.
- **Binding the harness from a product/version string**: rejected by ADR-021 and #441 AC1. A name is
  a claim about the host; a present tool is evidence of it, and the Codex surface renames often
  enough that a name check would be wrong within a release.
- **A Codex-specific return format so the coordinator can read a stage's answer**: unnecessary — the
  handoff on disk is the contract between stages (ADR-024 (b)), so a dispatch primitive with no
  guaranteed typed return is a perfectly good realization.

## Consequences

- `resolve` output gains `next.context`, `policy` (with `deadDispatchRetries`) and `caps`. Additive:
  the batch engine ignores them. One existing assertion that deep-equalled `next` was updated.
- #488's execution profile has a defined place to land (`--contextPolicy`) and a defined refusal.
- Adding a harness, or following a Codex rename, is an edit to one array — not to any skill's steps.
- `reuse` is shipped but unreachable by default; the first real evidence about its cost/benefit will
  come from #488, not from this story.

## References

- `packages/knowledge-hub/dataset/.skills/workflow/cycle/` (`SKILL.md`, `scripts/cycle-dispatch.mjs`)
- `cycle-state.mjs`: `CONTEXT_TABLE`, `AGENT_OF_STEP`, `contextPolicyError`, `CAPS`, `effectiveInputs`
- ADR-017 §3, ADR-021, ADR-024 (b)/(g); ADL 2026-07-11 agent-execution-layer
- `.claude/workflows/pair-contracts/cycle-coordinator.test.mjs` (AC-6, AC-7, AC-12 rows)
