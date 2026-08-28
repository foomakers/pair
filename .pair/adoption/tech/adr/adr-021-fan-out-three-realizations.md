# ADR-021: Fan-out is one capability with three realizations — in-harness, external driver, degraded

## Status

Accepted — **amends [ADR-017](adr-017-automation-loop-pair-loop-over-atom.md)** §4 (the `pair-loop` skill's Realization rule) and retires one of its stated limitations ("No portable unattended loop"). ADR-017 §1 (`pair-next` as a frozen atom), §2 (`implement-batch` as the batch engine), §3 (context isolation as an architectural invariant) and §6 (`tech/automation.md` as the policy home) are **left intact** and are not restated here.

> Numbering note: `adr-018` is claimed by two files already merged; `019` stays free for whichever of them renumbers. This ADR takes the next number above the highest in use.

## Date

2026-08-24

## Context

- ADR-017 §4 gave the `pair-loop` skill a **two-tier** Realization rule: if a fan-out runner exists (Claude Code's `Workflow`), delegate the unattended loop to the workflow; **otherwise** run exactly one eligible card to its gate, write the audit/checkpoint, stop, and print a **continue-token** for "the caller (human/CI/cron)" to re-invoke. Its Trade-offs section recorded the consequence: *"No portable unattended loop: portable tools get one-card-per-invocation, re-triggered externally."*
- That limitation was never about fan-out being unavailable elsewhere. It was about **nobody automating the external re-trigger**. §4 already names the missing actor — "the caller" — and leaves it a human.
- Story #451 supplies that caller: `pair run`, a headless driver in `apps/pair-cli` that resolves an engine (`pi`, `opencode`, `claude -p` — data, not conditionals), invokes the skill inside it, reads the iteration's outcome from the engine's JSONL terminal event, and **re-invokes on the continue-token** until the declared stop condition or the perimeter's cap says otherwise. It carries no process logic: eligibility, the stop predicate, parallelism and the audit location are read from `tech/automation.md` with `pair-loop`'s own names (D18).
- Story #450 made "which harness runs pair" an explicit, provisionable choice (the agent-harness framework + `/pair-capability-setup-harness`). Once Claude Code is one supported harness among several, a rule whose top tier is "Claude Code, else degraded" is a rule that reads *capability* off a *vendor*.
- Two facts made the two-tier framing actively misleading:
  1. **A harness that HAS subagents is not obliged to use them.** A team on Claude Code or Codex may prefer separate processes — for isolation, for observability, for running under a scheduler. Under a two-tier rule that preference has no name.
  2. **A separate process satisfies §3's context-isolation invariant MORE strongly than a subagent does.** A subagent shares its parent's process, tool configuration and lifetime; a fresh process shares nothing but the filesystem — a new session, a new context window, no inherited state, and a crash that cannot take the orchestrator with it. The driver's isolation is therefore not a degradation of the workflow path: on the one axis §3 declares architectural, it is stricter.
- **Hard to reverse / surprising without context**: the preference ORDER is what callers implement. Recording it once, with the reasoning, is what stops the next skill or workflow from re-deriving "Claude Code or nothing".

## Options Considered

### Option 1: Leave ADR-017 §4 as two tiers and treat `pair run` as an implementation detail of the degraded path

Rejected. The degraded path's defining property is that a human re-triggers it; with the driver, nothing about the run is manual and the "No portable unattended loop" limitation is factually false. Filing a capability that removes a recorded limitation as a detail of the limitation is where adoption files start disagreeing with the product.

### Option 2: Promote the external driver to the TOP tier (always prefer a separate process)

Rejected, though it has the stronger isolation argument (see Context). Two reasons: an in-harness runner needs no second executable, no PATH resolution and no per-engine stream contract, so it is the cheapest correct answer where it exists; and it is the path this project's own delivery is validated against. Preference order is about default cost, not about maximal isolation — a team that wants the stricter isolation now has tier 2 available *by name*, which is the point.

### Option 3 (chosen): one capability, three realizations, in preference order

See Decision.

## Decision

1. **Fan-out is ONE capability with THREE realizations.** A caller takes the first one available to it, and may deliberately choose a lower tier:

   | # | Realization | What it is | When it applies |
   | --- | --- | --- | --- |
   | 1 | **In-harness** | The harness's own fan-out primitive — Claude Code's `Workflow` (`pair-loop` / `pair-implement-batch`), Codex subagents (#441) | The harness has one, and the team wants to use it |
   | 2 | **External driver** | `pair run` (#451): a headless process per iteration on a chosen engine, re-invoking on the continue-token. The **portable baseline** | Any environment with an engine on PATH — *including* harnesses that HAVE subagents but whose user prefers separate processes. `claude -p` and Codex are legitimate driver ENGINES, not competitors to tier 1 |
   | 3 | **Degraded** | ADR-017 §4's original rule: exactly one card per invocation, audit/checkpoint written, continue-token printed for a human/CI/cron to re-invoke | Only for a caller with neither of the above |

2. **Tier 2 is not a lesser tier 1.** It respects §3's context-isolation invariant *more strongly* than a subagent does: every iteration is a fresh process and therefore a fresh session, sharing nothing with its predecessor but the filesystem and the audit trail. Whoever compares the tiers must compare them on cost and ergonomics, never on isolation.

   **One capability tier 2 does NOT inherit, stated so nobody assumes it:** per-run card **exclusion**. ADL [`2026-08-23-pair-loop-resumes-from-its-own-audit-file-not-a-checkpoint`](../../decision-log/2026-08-23-pair-loop-resumes-from-its-own-audit-file-not-a-checkpoint.md) makes reading the prior audit and excluding already-decided cards (escalated, failed, merged, parked) a step of the **fan-out** path. The one-card path tiers 2 and 3 share has no equivalent step, and a fresh process by definition remembers nothing — so a card the previous iteration parked for a human can be re-selected by the next one, and an unattended tier-2 run can spend its iteration budget re-deciding the same card. The bounds hold either way (the perimeter's cap stops it, and nothing merges that the policy does not permit) and every iteration is still audited — what is missing is *deduplication*, not safety. Two mitigations are available today, both the operator's: keep the iteration cap tight, and keep `--root` narrow enough that a parked card is visible in the output. Giving the one-card path its own audit-read exclusion is the natural follow-up, and it belongs to the skill (whose audit it is), never to the driver.

3. **The limitation "No portable unattended loop" is RETIRED.** ADR-017's Trade-offs entry no longer holds: the portable unattended loop is tier 2, and the "re-triggered externally" caveat is now "re-triggered by the driver". What remains true, and is not retired, is that the dataset carries Claude-Code-specific workflow artifacts other harnesses cannot run — a distribution observation, not a capability gap.

4. **The driver is an execution adapter, never a second process engine.** It resolves *how* to invoke (engine, skill, prompt, perimeter, autonomy) and never *what* to work on. Eligibility, the stop predicate, `max_parallelism` and the audit location are read from `tech/automation.md` under §6's names; the driver adds no policy parameter of its own (D18). Within one driver process parallelism is **1** — it states the policy's ceiling and says plainly that concurrency comes from running several driver processes, a decision that stays `pair-loop`'s.

5. **Merge is never automated by tier 2.** Whatever the autonomy flags, the driver stops at the gate; auto-advance authority stays exactly where `tech/automation.md` §Auto-Advance and quality-model §4 put it.

6. **`pair-loop`'s Realization rule (ADR-017 §4, shipped in the skill) is amended to these three tiers**, and so is story #250's statement of it. §§1–3 and §6 of ADR-017 are unchanged.

## Consequences

### Benefits

- Unattended delivery stops being Claude-Code-only: any environment with `pi`, `opencode` or `claude` on PATH runs the same loop, with the same skills and the same policy file.
- The preference order is recorded once, so no future skill re-derives "Claude Code or nothing" from a two-tier rule.
- The choice a team makes between a subagent and a process now has a name (tier 1 vs tier 2) and a stated trade-off, instead of being invisible.
- Claude Code becomes ONE engine among others, which is what makes the control test possible at all: the same card can be driven through the driver on `claude -p` and compared against the existing `Workflow`.
- Isolation improves where tier 2 is chosen: a fresh process per iteration cannot inherit context, tool state or a crash.

### Trade-offs and Limitations

- **Three tiers are more surface to document** than two, and a caller now has to state which one it took. Mitigated by making the driver print its resolution (engine, level, skill, perimeter, policy) before it executes anything.
- **Adding an engine remains a code change** — the engine map ships as data inside `apps/pair-cli`, deliberately, so moving it to the KB later is a source swap rather than a refactor (recorded as accepted debt in #451's risk table).
- **Tier 2 costs one process per iteration**: slower than an in-harness subagent for a long run, and it re-reads project context every time. That is the price of the stronger isolation, not an accident of the implementation.
- **Tier 2 has no per-run card exclusion** (see Decision §2): the one-card path does not read the prior audit to skip already-decided cards, so an unattended tier-2 run can re-decide a parked card until its cap. Bounded, audited, and fixable in the skill — but a real difference from tier 1 today.
- **The driver depends on per-engine stream contracts** (which event is terminal). They are engine-map data, verified against each engine, and unrecognised output is fail-closed — an iteration with no terminal event counts as failed and stops the loop.

## Related

- [ADR-017](adr-017-automation-loop-pair-loop-over-atom.md) — the automation loop; this ADR amends its §4 Realization rule and retires the "No portable unattended loop" limitation. §§1, 2, 3 and 6 unchanged.
- ADL `2026-07-11-agent-execution-layer` — the workflow/agent substrate tier 1 uses.
- [Agent-harness framework](../../../knowledge/guidelines/technical-standards/ai-development/agent-harness/README.md) (#450) — what each supported harness/engine is, and how it is provisioned.
- [Automation policy](../../../knowledge/guidelines/collaboration/automation/automation-policy.md) — ADR-017 §6's schema, which tier 2 reads and never writes.
- Stories: #451 (this driver), #250 (`pair-loop`, whose realization rule is amended here), #441 (Codex in-harness fan-out — a tier-1 sibling), #219 (`implement-batch`), #217 (tag-driven dispatch, which should invoke the driver rather than assume Claude Code).
