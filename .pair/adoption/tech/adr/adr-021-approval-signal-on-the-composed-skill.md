# ADR-021: The non-interactive signal is an argument on the composed skill, not a note on the caller

## Status

Accepted — **extends** the [resolution cascade](../../../knowledge/guidelines/technical-standards/ai-development/skill-conventions/resolution-cascade.md) and the [guided / quick setup](../../../knowledge/guidelines/technical-standards/ai-development/skill-conventions/guided-quick-setup.md) conventions with a shared signal, and introduces [approval-rounds.md](../../../knowledge/guidelines/technical-standards/ai-development/skill-conventions/approval-rounds.md) as its single statement. Neither existing convention is otherwise changed.

## Date

2026-08-24

## Context

- Two composable families end in an **unconditional developer-approval round** and had **no non-interactive signal of their own**: the `assess-*` family (the cascade's Path A steps 3-4 "Confirm the override with the developer", each skill declaring its own prompt, plus its Path C "Developer approves" and Path B keep-or-redo), and the `map-*` family (`/map-subdomains` Step 3, `/map-contexts` Step 4 — "Approve or adjust?").
- A caller that must not ask therefore had exactly one option: **declare, per composed skill, that it suppresses that skill's round**. `/bootstrap`'s quick depth did precisely that, twice, as disclosed deviations 2 and 3 of its `quick-mode-defaults.md`, mirrored by caller-side notes in its Steps 2.2 and 3.5.
- That shape is not merely verbose, it is **structurally blind**: a caller-side note cannot see the *next* composed skill that asks. The same defect was found **twice in two consecutive review rounds** on the same PR — round 2 on `assess-*`, round 3 on `map-*` — and nothing prevented an eleventh surface. Every miss is a run that hangs on a question no one can answer, while the caller's disclosure reads as complete.
- Constraint: **guided behaviour is untouchable.** A caller that passes nothing must get today's behaviour word for word; any shift in the default depth would make this a different, larger change.
- Constraint: **one gate must survive.** `/map-contexts` HALTs on an unbalanced + volatile relationship offered with neither mitigation nor acceptance. Writing a domain model that records a coupling risk nobody judged is worse than asking one question, so a generic signal that swallowed it would be a regression dressed as a feature.

## Options Considered

### Option 1: Keep caller-side suppression, add a checklist

- **Description**: leave the mechanism where it is; add an authoring checklist ("when you compose a skill, check whether it asks").
- **Pros**: no change to any skill; zero blast radius.
- **Cons**: it is the current shape plus a reminder. The failure mode is a caller *not knowing* what its composed skill does — a checklist restates the obligation without giving the caller any way to discharge it, and it is unenforceable: nothing in the corpus can tell whether a caller enumerated every asking surface, because the set is only knowable by reading every composed skill at the time of writing.

### Option 2: An environment probe inside each skill (TTY detection)

- **Description**: each skill detects a non-interactive environment itself (no TTY, CI) and skips its rounds.
- **Pros**: no argument to thread; a caller that forgets is still safe.
- **Cons**: the skills in question are executed by an agent inside a session, not by a shell — TTY is not a property they can read, and where it is readable it answers the wrong question. An interactive operator running a supervised batch legitimately wants no rounds; a piped invocation of a genuinely interactive session legitimately wants them. It also makes behaviour **environment-dependent and untestable** over the corpus, and it strands the one gate that must fire regardless.

### Option 3: Reuse `$mode: quick` as the signal

- **Description**: give every family member the `$mode: quick` selector `/bootstrap` already declares.
- **Pros**: one vocabulary for "the quick depth"; no new argument name.
- **Cons**: `$mode` is already **taken and means something else** in this corpus — `/assess-cost` and `/assess-security` use it for `classify`/`report` and `review`/`audit`, which are different algorithms, not depths. It also conflates a *setup depth* (a whole run's shape) with *whether one round is asked*, so a skill with no depth to speak of would have to declare one, and the two meanings would collide in exactly the family the change targets.

### Option 4 (chosen): `$approval` — a shared argument, defaulting to today's behaviour

- **Description**: one argument, `$approval: interactive | auto`, declared by every skill that has an approval round. Omitted ⇒ `interactive` ⇒ unchanged. Under `auto` a round resolves by kind: **confirm-a-proposal** accepts as-is and reports; **keep-or-redo / existing-vs-proposed** keeps what is recorded and reports the unapplied delta; a **judgement gate** — a round with no proposal to accept — still HALTs. The rounds the resolution cascade owns (Path A, Path B) are qualified in the cascade doc once, for every skill that follows it.
- **Pros**: the caller states its depth **once** and cannot miss a surface, because the obligation moved to the composed skill. The default makes the change **provably guided-neutral** (an absent argument is the old text). The three-kind resolution derives the surviving HALT from the mechanism instead of carving it out by name — a gate is where the skill *cannot state what the human would be accepting*, so there is nothing to auto-accept. And it is **mechanically enforceable**: an argument row plus a signal named in the asking step are both greppable over the corpus, per skill present, with no count anywhere.
- **Cons**: it is a **new argument on ten skills**, and the enforcement rests on a **textual** convention (an approval-round line must name the signal) — a novel prompt phrasing the detector's pattern set does not recognise is an approval round the gate will not see. Mitigated by keeping the pattern set in one tested production module with injection tests, and by the shared rounds being qualified in the cascade rather than restated ten times. Second cost: a caller must now *pass* something it previously only documented, so a caller that neither passes nor discloses is silently interactive again — visible in a hang, not in a red gate.

## Decision

**Adopt `$approval` (Option 4): one shared argument on the composed skill, `interactive` by default, honoured by every skill that declares an approval round — with `auto`'s resolution fixed per round kind, and a judgement gate exempt by construction.**

The mechanism **belongs to the convention, not to a caller**. The convention is stated once in `approval-rounds.md`; the cascade doc qualifies the two rounds it owns; each skill declares the argument and qualifies only its own local rounds. `/bootstrap`'s quick depth passes `$approval: auto` and its disclosed deviations 2 and 3 are retired — the caller-side notes in Steps 2.2 and 3.5 with them, since they existed only to describe those deviations.

Option 2 was rejected on **correctness**, not cost: an environment probe answers a question adjacent to the one that matters and cannot be exempted for the surviving gate. Options 1 and 3 were rejected on **enforceability** and **vocabulary collision** respectively.

Two corollaries, recorded because neither is obvious:

- **`auto` never means "do not report".** A suppressed round still owes its content to the caller through the skill's Output Format. A supervisor loop that asks nothing is not a loop that decides nothing — the audit trail is the only thing standing in for the human who was not asked.
- **A round that writes before it asks cannot be qualified.** Under `auto` the write happens and the question that would have prevented it never runs. Both families were checked for that shape and neither has it — `assess-*` is output-only (ADR-009) and both `map-*` skills approve in the step before the one that writes — so the convention states the rule for future authors rather than fixing an instance.

## Consequences

### Benefits

- A caller passes **one** signal and every composed skill in both families honours it; the class of defect that recurred twice in two review rounds cannot recur in an eleventh surface, because the obligation now lives where the round is.
- **Guided is untouched by construction**: the default resolves to the pre-existing text, so a caller that passes nothing is unaffected — not by inspection, but because the qualified step *is* the old step when `$approval` is absent.
- The surviving `/map-contexts` HALT is derived, not excepted: a round with no proposal to accept is a gate, and `auto` suppresses asking, never judging.
- The obligation is **enforced over the corpus, per skill present**, so a future family member either honours the signal or fails the gate — no count to maintain, no list to remember.
- The two families' approval semantics are now stated **once** rather than restated in each caller that composes them, which is what made the previous shape unauditable.

### Trade-offs and Limitations

- **Textual enforcement.** The gate recognises an approval round by phrase patterns ("Developer approves", "Approve or adjust?", "ask for confirmation", …). A round phrased outside that set is invisible to it. The pattern set is one tested module with injection tests, but it is a heuristic over prose, not a type system.
- **A caller must now pass the signal.** Previously a caller documented a suppression; now it threads an argument. A caller that does neither is interactive again, and the symptom is a hang rather than a red gate. Only `/bootstrap` (quick depth) is converted here; other automated callers — notably a batch that composes `/refine-story`, which composes both `map-*` skills — remain to be threaded and are deliberately out of this change's scope.
- **`$approval` is a tenth-ish argument in a corpus that prizes small argument tables.** Accepted: it is one row, identical in every skill, pointing at one convention.
- **Two of the eleven `assess-*` skills do not declare it** (`assess-cost`, `assess-coupling`) — deliberately, because neither has an approval round. The gate is defect-driven (every round found must be qualified) rather than name-driven (every `assess-*` must declare the argument), so the corpus carries no argument that nothing honours; the day either grows a round, the gate requires the row.

## Adoption Impact

- **`.pair/knowledge/guidelines/technical-standards/ai-development/skill-conventions/approval-rounds.md`** (new, plus its index row in that directory's `README.md`) — the single statement of the signal, its default, the per-round-kind resolution, the reporting obligation and the authoring obligation. Written generic/portable per that directory's scope note, so it does not cite this ADR back.
- **`resolution-cascade.md`** — Paths A and B qualified with `$approval`, once, for every skill that follows the cascade; the per-skill delta list now states that these two rounds are never restated per skill.
- **`guided-quick-setup.md`** — a quick depth that composes other skills forwards the depth as one signal instead of disclosing per-composed-skill suppressions.
- **Ten skills** — the nine `assess-*` members with an approval round plus `assess-security`'s Path A, and both `map-*` skills: an `$approval` argument row and each local round qualified.
- **`/bootstrap`** — quick mode composes `assess-*` and `map-*` with `$approval: auto`; `quick-mode-defaults.md` deviations 2 and 3 and the Step 2.2 / 3.5 caller-side notes are retired.
- No change to `architecture.md`, `tech-stack.md` or `infrastructure.md` — this is a skill-corpus convention, not a stack or boundary decision.

## References

- Story: #410 (raised as review finding 5 on PR #408, story #278)
- Extends: the resolution cascade and guided/quick setup conventions · relies on ADR-009 (`assess-*` output-only) for the no-write-before-ask corollary
- Implementation: `packages/knowledge-hub/dataset/.skills/capability/{assess-*,map-*}/SKILL.md`, `dataset/.skills/process/bootstrap/{SKILL.md,quick-mode-defaults.md}`, `packages/knowledge-hub/src/tools/skills-conformance-check.ts` (the corpus gate), `qa/release-validation/CP9-quickstart-onboarding.md` (MT-CP903)
