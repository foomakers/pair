# ADR-021: Fan-out is one capability with three realizations — in-harness, external driver, degraded

## Status

Accepted — **amends [ADR-017](adr-017-automation-loop-pair-loop-over-atom.md)** §4 (the `pair-loop` skill's Realization rule) and retires one of its stated limitations ("No portable unattended loop"). ADR-017 §1 (`pair-next` as a frozen atom), §2 (`implement-batch` as the batch engine), §3 (context isolation as an architectural invariant) and §6 (`tech/automation.md` as the policy home) are **left intact** and are not restated here.

**Amended 2026-08-28 by #441** — the second tier-1 realization landed. §7 below states how a caller decides which realization it has, and corrects one factual premise this record inherited. The three tiers, their order and every other clause are **unchanged**: #441 is the sibling #451 already reserved a slot for, not a re-framing. Whichever of the two landed second was required to amend this record rather than write a second, divergent three-tier story; this is that amendment.

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
   | 1 | **In-harness** | The harness's own fan-out primitive — Claude Code's `Workflow` (`pair-loop` / `pair-implement-batch`), Codex's multi-agent subagents (#441, landed) | The **probe** finds one in this session (§7), and the team wants to use it |
   | 2 | **External driver** | `pair run` (#451): a headless process per iteration on a chosen engine, re-invoking on the continue-token. The **portable baseline** | Any environment with an engine on PATH — *including* harnesses that HAVE subagents but whose user prefers separate processes. `claude -p` and Codex are legitimate driver ENGINES, not competitors to tier 1 |
   | 3 | **Degraded** | ADR-017 §4's original rule: exactly one card per invocation, audit/checkpoint written, continue-token printed for a human/CI/cron to re-invoke | Only for a caller with neither of the above |

2. **Tier 2 is not a lesser tier 1.** It respects §3's context-isolation invariant *more strongly* than a subagent does: every iteration is a fresh process and therefore a fresh session, sharing nothing with its predecessor but the filesystem and the audit trail. Whoever compares the tiers must compare them on cost and ergonomics, never on isolation.

   **One capability tier 2 does NOT inherit, stated so nobody assumes it:** per-run card **exclusion**. ADL [`2026-08-23-pair-loop-resumes-from-its-own-audit-file-not-a-checkpoint`](../../decision-log/2026-08-23-pair-loop-resumes-from-its-own-audit-file-not-a-checkpoint.md) makes reading the prior audit and excluding already-decided cards (escalated, failed, merged, parked) a step of the **fan-out** path. The one-card path tiers 2 and 3 share has no equivalent step, and a fresh process by definition remembers nothing — so a card the previous iteration parked for a human can be re-selected by the next one, and an unattended tier-2 run can spend its iteration budget re-deciding the same card. The bounds hold either way (the perimeter's cap stops it, and nothing merges that the policy does not permit) and every iteration is still audited — what is missing is *deduplication*, not safety. Two mitigations are available today, both the operator's: keep the iteration cap tight, and keep `--root` narrow enough that a parked card is visible in the output. Giving the one-card path its own audit-read exclusion is the natural follow-up, and it belongs to the skill (whose audit it is), never to the driver.

3. **The limitation "No portable unattended loop" is RETIRED.** ADR-017's Trade-offs entry no longer holds: the portable unattended loop is tier 2, and the "re-triggered externally" caveat is now "re-triggered by the driver". What remains true, and is not retired, is that the dataset carries Claude-Code-specific workflow artifacts other harnesses cannot run — a distribution observation, not a capability gap.

4. **The driver is an execution adapter, never a second process engine.** It resolves *how* to invoke (engine, skill, prompt, perimeter, autonomy) and never *what* to work on. Eligibility, the stop predicate, `max_parallelism` and the audit location are read from `tech/automation.md` under §6's names; the driver adds no policy parameter of its own (D18). Within one driver process parallelism is **1** — it states the policy's ceiling and says plainly that concurrency comes from running several driver processes, a decision that stays `pair-loop`'s.

5. **Merge is never automated by tier 2.** Whatever the autonomy flags, the driver stops at the gate; auto-advance authority stays exactly where `tech/automation.md` §Auto-Advance and quality-model §4 put it.

6. **`pair-loop`'s Realization rule (ADR-017 §4, shipped in the skill) is amended to these three tiers**, and so is story #250's statement of it. §§1–3 and §6 of ADR-017 are unchanged.

7. **A realization is PROBED, never inferred — and Codex's is the second one that exists** (added 2026-08-28, #441).

   The tier table above is a preference order, not an availability claim. Which realization a caller may take is established by **probing the running session** for the primitive itself: the tool is exposed, or it is not. A product name, a version string, a documented-but-unobserved feature and a config key that merely *could* enable the mechanism are all inadmissible as evidence, and an unrecognised probe result reads as **absent**. The generic rule — probe → bind → announce → degrade, with the vendor's surface held as data — is stated once in the KB's [harness-realization convention](../../../knowledge/guidelines/technical-standards/ai-development/skill-conventions/harness-realization.md); this clause only fixes that the capability's tiers are taken that way.

   **Both tier-1 realizations are entries in that one map, Claude Code's included.** They differ in *dispatch shape* and in nothing else the rule cares about: Claude Code's `Workflow` is a **delegated run** (one call hands the whole run to a runtime that fans out itself, so the caller owns no cap and no wait bound), Codex's toolsets are **spawn/wait** (the orchestrating model starts and awaits each subagent, so it owns both). The binding reports the shape and the caller branches on *that*. Exempting the harness the skill happens to run in was tried and is a defect, not a shortcut: `bind` then answers `degraded` for a session that fans out through the workflow moments later, so the announcement written to the audit is false, the degradation branch's condition ("the probe missed") holds at the same time as the in-harness branch, and the caller is back to routing on the product name this clause exists to stop reading.

   Two consequences are load-bearing:

   - **The bound realization is announced before anything is dispatched**, and recorded in the run's audit. A silent fallback and a successful bind are otherwise indistinguishable in the result.
   - **Degradation preserves the invariant.** Where no primitive binds, the caller drops to tier 2 and then tier 3. What it may never do, at any tier, is iterate several cards inside one context — that is ADR-017 §3's invariant, and dropping it would not be a lower tier but a defect.

   **Why the probe rather than a version check**: the far side of this integration is observably in motion. On the build measured for #441 (`codex-cli 0.149.0`, 2026-08-22) Codex exposed *two* multi-agent toolsets — a default-on first generation (`spawn_agent`/`wait_agent`/`send_input`/`resume_agent`/`close_agent`) and a default-**off** second one behind `multi_agent_v2`, with a configurable tool namespace — while a third fan-out mechanism (`enable_fanout`) had already been withdrawn. A rule that read capability off a version would have been wrong for at least one of those three states.

   **The factual correction this amendment carries**: ADL [`2026-07-11-agent-execution-layer`](../../decision-log/2026-07-11-agent-execution-layer.md) states that Claude Code's subagent and workflow primitives are ones "that other assistants (e.g. Codex) do not have". For Codex that is **no longer true**, on the evidence above; the ADL is amended in place. What remains true, and is what that record was really about, is narrower: `.claude/workflows/*.js` is a Claude-Code-specific *artifact* no other harness can execute. Codex's in-harness realization is therefore not that file ported — it is the `pair-loop` skill driving the same lane through Codex's own tools, with the lane's deterministic half in a tested module shipped as a KB asset. Both realizations validate a subagent's return against the **same** result contract; neither invents a second handoff format.

8. **"One lane" is a claim about the review ↔ fix cycle and the audit, not only about the schemas** (added 2026-08-28, #441).

   Two realizations of one capability may differ in dispatch mechanism and in nothing a card can feel. Four properties are therefore fixed for both, and are what a third realization would have to honour too:

   - **A fix is owed by findings, never by a phase list.** Actionable findings ⇒ one fix round ⇒ **re-review**; zero actionable findings ⇒ converged and no fixer is spawned; a cap on the rounds ⇒ escalate to a human. A realization that dispatched `implement → pr → review → fix` unconditionally would both spawn a fixer on an approved PR and record a card converged on a review that ran BEFORE the fixes — and under `## Auto-Advance` the second of those merges.
   - **A project-supplied result contract may only TIGHTEN the built-in one.** Where the project has the generated review contract on disk, both realizations validate against it; where the request carrying it is composed by a model, a contract that model can also WIDEN is not a contract.
   - **An exclusion is scoped to the run that recorded it.** The audit is one persistent, append-only, project-relative file. A halt read out of it unscoped refuses a card in every later invocation, forever — stricter than the Claude realization, whose exclusion covers "every later iteration in the same run", and incompatible with "re-dispatch only what is unfinished".
   - **Where the orchestrator is a MODEL, its omission must fail closed — mechanically, not in prose.** The realization whose sequencing is a model's writes its own audit, so every field the reconstruction reads back is a field a killed or careless run can omit. The load-bearing one is the review record's `action`: a completed `review` that does not say what `converge` decided is refused at write time, and on read only `converged` closes the cycle — anything else, absent included, leaves it open and re-enters the card at `review`. Read the other way round, an omitted stamp reconstructed as a *finished* review, the plan owed nothing, and the first bullet's loss happened anyway through the back door. The same rule is why the request shape rejects unknown keys at every level a model composes rather than dropping them: a silently-dropped key reinstates exactly the default it was passed to override.

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
- **Tier 1 now has two realizations to keep in step** (added 2026-08-28, #441). Claude's runs in JS, Codex's runs as a skill over a tested asset, and "one capability" is a claim only as long as a given card comes out of both with the same outcome and an equivalent audit. Two guards hold it mechanically — the per-phase result schemas are asserted equal across the two, and the vendor surface is asserted to appear only in its data map — but the semantics of the lane itself rest on the shared `implement-batch` contract, not on a test. A third harness would want the same pair of guards, not a third re-derivation.
- **Tier 1's wait bound is not always configurable, and the map carries a declared fallback** (added 2026-08-28, #441). One observed generation of the spawn/wait harness exposes no wait-timeout config key at all (the next generation does, and is off by default), so "read the harness's configured maximum" resolves to nothing on the session a bare run actually binds. Rather than leave the caller with an unbounded wait or an invented number — both forbidden — the surface-map entry declares the fallback, the binding reports which of the three sources produced the number, and the announcement carries it into the audit. It is a bound pair chose, stated as such and reviewable as data; the alternative was AC10 unmet on the default path.
- **A model-driven orchestrator is less deterministic than a JS one** (added 2026-08-28, #441). Codex's tier 1 puts the arithmetic, the packet checks, the contract validation and the audit write in a tested module precisely because the surrounding sequencing is a model's. That narrows the gap; it does not close it, and it is the reason every dispatch is schema-validated and every outcome audited rather than trusted.

## Related

- [ADR-017](adr-017-automation-loop-pair-loop-over-atom.md) — the automation loop; this ADR amends its §4 Realization rule and retires the "No portable unattended loop" limitation. §§1, 2, 3 and 6 unchanged.
- ADL `2026-07-11-agent-execution-layer` — the workflow/agent substrate tier 1 uses.
- [Agent-harness framework](../../../knowledge/guidelines/technical-standards/ai-development/agent-harness/README.md) (#450) — what each supported harness/engine is, and how it is provisioned.
- [Automation policy](../../../knowledge/guidelines/collaboration/automation/automation-policy.md) — ADR-017 §6's schema, which tier 2 reads and never writes.
- Stories: #451 (this driver), #250 (`pair-loop`, whose realization rule is amended here), #441 (Codex in-harness fan-out — a tier-1 sibling), #219 (`implement-batch`), #217 (tag-driven dispatch, which should invoke the driver rather than assume Claude Code).
