# Decision: Adoption-informed generation is a KB convention the generating skills point at — not a fourth capability, and not a step written three times

## Date

2026-08-19

## Status

Active

## Category

Process Decision

## Context

Story #280 (R3.13) required story generation to read the project's own history — ADRs, decision log, context map — before drafting, so a generated story stops re-proposing what a decision already rejected. Three skills author story content today: `/pair-process-plan-stories`, `/pair-process-brainstorm` (phase 3 triage) and `/pair-process-refine-story`.

That shape offers three tempting implementations, and the story's own risk table already flagged the failure mode of the naive one: _"'adoption-informed' is vague and each touched skill interprets it differently"_. Written into each skill separately, "read the decisions" would drift into three different reads — three source lists, three notions of scope, three ways of citing — which is exactly what the corpus already learned with the conventions extracted in `skill-conventions/` (idempotency restated in 28 skills, graceful degradation in 34).

The second temptation is a new `/pair-capability-read-adoption`. D24 constrains that: `/pair-process-brainstorm` was admitted as the *only* new process skill, and the assess/verify family is already the answer for "read adoption and report". A fourth reader would also be a **third place that reads adoption context**, alongside `/pair-capability-verify-adoption` and the `assess-*` cascade.

## Decision

**The reading step is defined once as a KB convention — [`skill-conventions/adoption-informed-generation.md`](../../knowledge/guidelines/technical-standards/ai-development/skill-conventions/adoption-informed-generation.md) — and each generating skill carries a pointer plus its own subject delta. No new skill, no per-skill restatement.**

Concretely, the convention owns and the skills do not restate:

- **Sources and read order** — `adoption/tech/adr/`, `adoption/decision-log/`, then the context map (DDRs reached through it). Fixed order, id/date order within each source.
- **Bounded read** — every record is indexed (id, title, `Status`, one-line summary); only the bodies of records in the item's scope are opened. This is the mitigation for the story's own cost signal (adoption history bloating every generation prompt), and it is why the class stayed `cost:yellow`.
- **Precedence** — `Superseded` never wins; among live records the most recent does, regardless of record kind.
- **The three effects** — constrain, cite, flag a revisit — with one citation form: `(per ADR-013)`, `(per decision-log/<date>-<topic>)`, `(per DDR-004)`, `(per context-map: <term>)`.
- **The degradation ladder** — no adoption ⇒ today's behavior exactly; one unparseable record ⇒ skip that record with a warning; whole tree unreadable ⇒ the no-adoption path. Never a HALT (D21).

Each skill states only: what its **subject** is (the epic + its candidates / the placed blob / the one story), where the citation lands, and which confirmation prompt shows the revisit flags.

**The read is read-only.** Generation never writes a decision record; recording stays with the developer and `/pair-capability-record-decision`. The context map's inline glossary maintenance by `/pair-process-brainstorm` and `/pair-process-refine-story` is the already-documented exception and is *not* part of this read.

**And it stays specified, not implemented.** No executable module reads adoption on the skills' behalf: the skills are natural-language and their executor is the assistant, so a parallel TypeScript reader would be a second implementation nothing invokes — free to drift from the convention that is actually followed. What *is* executable is the guard: `adoption-informed-generation.test.ts` pins the convention's contract and pins that each of the three skills points at it (and, deliberately, that none of them names the source directories itself — the anti-drift assertion).

## Alternatives Considered

- **Restate the step in each of the three skills**: rejected — the drift the `skill-conventions/` extraction exists to prevent, and the risk the story itself named.
- **A new `/pair-capability-read-adoption`**: rejected — a fourth reader of adoption context against D24, and a composition every generating skill would have to make required (or degrade around) for a step that is one bounded read.
- **Fold it into `/pair-capability-verify-adoption`**: rejected — that skill audits already-written code for conformity. Generation needs the decisions as *input*, before anything exists to audit; overloading it would give one skill two unrelated verbs.
- **Ship an executable adoption reader** (a `@pair/knowledge-hub` module): rejected — nothing in the natural-language flow would call it, so it would be an unenforced second source of truth. The conformance test guards the words the executor actually reads.

## Consequences

- A change to how generation reads adoption is a one-file edit plus a mirror, not a three-skill sweep — and the guard fails if a skill starts re-describing the mechanics.
- Generated stories carry citations in the body. Reviewers and refiners get the "why this shape" without opening the adoption tree; the cost is slightly longer story bodies.
- `/pair-process-brainstorm`'s SKILL.md absorbed ~700 B against its 28 KB progressive-disclosure budget (145 B of headroom left). The degradation ladder for the adoption read was disclosed into its `degradation.md` sibling rather than inlined — the next addition to that skill needs another split.
- Verification for this class of change stays a **hand-traced fixture dry-run** (seeded adoption + empty adoption), reported on the PR, plus the static conformance guard. There is no runtime to assert against, and pretending otherwise would mean writing the parallel implementation this decision rejects.

## Adoption Impact

- `.pair/knowledge/guidelines/technical-standards/ai-development/skill-conventions/adoption-informed-generation.md` (+ dataset source) — the convention itself; registered in that directory's README index and in `.pair/llms.txt`.
- `plan-stories` (Step 2b), `refine-story` (Step 1b), `brainstorm` (phase 3 preamble) — pointer + subject delta, in both the dataset source and the installed `.claude/skills/` mirror.
- `packages/knowledge-hub/src/conformance/adoption-informed-generation.test.ts` — the guard.
- Docs site: `concepts/adoption-files.mdx` and `developer-journey/iteration.mdx`.

## References

- Story #280 — Adoption-informed story generation (R3.13, Spec G3)
- Convention precedent: [to-issues-triage.md](../../knowledge/guidelines/technical-standards/ai-development/skill-conventions/to-issues-triage.md) (#231) — same shape: one convention, per-skill deltas, one conformance guard
- D24 (one new process skill; capabilities are composed, not multiplied) and D21 (missing optional context degrades, never HALTs)
