# Decision: Adoption-informed generation is a KB convention the generating skills point at — not a fourth capability, and not a step written three times

## Date

2026-08-19

## Status

Active

## Category

Convention Adoption

## Context

Story #280 (R3.13) required story generation to read the project's own history — ADRs, decision log, context map — before drafting, so a generated story stops re-proposing what a decision already rejected. Three skills author story content today: `/pair-process-plan-stories`, `/pair-process-brainstorm` (phase 3 triage) and `/pair-process-refine-story`.

That shape offers three tempting implementations, and the story's own risk table already flagged the failure mode of the naive one: _"'adoption-informed' is vague and each touched skill interprets it differently"_. Written into each skill separately, "read the decisions" would drift into three different reads — three source lists, three notions of scope, three ways of citing — which is exactly what the corpus already learned with the conventions extracted in `skill-conventions/` (idempotency restated in 28 skills, graceful degradation in 34).

The second temptation is a new `/pair-capability-read-adoption`. D24 constrains that: `/pair-process-brainstorm` was admitted as the _only_ new process skill, and the assess/verify family is already the answer for "read adoption and report". A fourth reader would also be a **third place that reads adoption context**, alongside `/pair-capability-verify-adoption` and the `assess-*` cascade.

## Decision

**The reading step is defined once as a KB convention — [`skill-conventions/adoption-informed-generation.md`](../../knowledge/guidelines/technical-standards/ai-development/skill-conventions/adoption-informed-generation.md) — and each generating skill carries a pointer plus its own subject delta. No new skill, no per-skill restatement.**

Concretely, the convention owns and the skills do not restate:

- **Sources and read order** — `adoption/tech/adr/`, `adoption/decision-log/`, then the context map (DDRs reached through it). The source order is fixed; within a source, files are enumerated by `Date` (the filename date for `decision-log/`), ties by filename. Enumeration is a reading sweep, not a ranking — **an id never orders anything**.
- **Bounded read** — every record is indexed from its **metadata alone**, swept from the file heads in ONE directory-wide pass per source (not one open per record): id (from the filename), the `#` H1 title **verbatim** (that title _is_ the summary — none is derived), `Date`, `Status`, and the `Category` that tells an ADL from a `Category: Analysis` entry (with the H1 prefix as the equivalent discriminator — `# Decision:`, `# DDR:`, `# Analysis Log:` — so a DDR filed next to the ADLs, which carries no `Category`, still indexes as an authority). Each head field is read in **both spellings the corpus actually uses** — the `## Status` / `## Date` / `## Category` headings and the inline `**Status:** Accepted` / `**Date:** ...` form a large minority of this repo's ADRs carry — with **where the value sits** spelled per spelling (on the matched line inline; the next non-blank line under a heading, so the sweep must carry trailing context and not report every heading-form record as field-absent), and a head field resolving to neither is opened at stage 2 and then _surfaced_, never demoted. No body is opened at stage 1. Stage 2 opens the records in the item's scope, decided against the indexed title + filename slug (stage 1's only text); what that text does not positively place elsewhere is opened, not skipped. This is the mitigation for the story's own cost signal (adoption history bloating every generation prompt), and it is why the class stayed `cost:yellow`.
- **Precedence** — only _live_ authorities take part: `Accepted` for an ADR/DDR and `Active` for an ADL, **either in any amended form** — the template's `Accepted (amended YYYY-MM-DD — ...)`, the in-the-wild `Accepted — amended by [ADR-NNN]`, and an ADL's `Active (amended YYYY-MM-DD — ...)` alike. `Proposed` is not yet an authority and `Deprecated`/`Superseded` no longer are — for `Superseded` the successor is read in its place. Among the live ones the most recent **by `Date`** wins, regardless of record **kind** and **never by id** (ids are per-source and not even unique within one — `adr/` holds two live files numbered 018); an equal-`Date` tie is surfaced, not broken. One exception is decided by kind: a `Category: Analysis` entry is context and takes no part in the order at all.
- **The three effects** — constrain, cite, flag a revisit — with one citation form: `(per ADR-013)`, `(per decision-log/<date>-<topic>)`, `(per DDR-004)`, `(per context-map: <term>)`.
- **The degradation ladder** — no adoption ⇒ today's behavior exactly; one unparseable record ⇒ skip that record with a warning; whole tree unreadable ⇒ the no-adoption path. Never a HALT (D21).

Each skill states only: what its **subject** is (the epic + its candidates / the placed blob / the one story), where the citation lands, and which confirmation prompt shows the revisit flags.

**The read is read-only.** Generation never writes a decision record; recording stays with the developer and `/pair-capability-record-decision`. The context map's inline glossary maintenance by `/pair-process-brainstorm` and `/pair-process-refine-story` is the already-documented exception and is _not_ part of this read.

**And it stays specified, not implemented.** No executable module reads adoption on the skills' behalf: the skills are natural-language and their executor is the assistant, so a parallel TypeScript reader would be a second implementation nothing invokes — free to drift from the convention that is actually followed. What _is_ executable is the guard: `adoption-informed-generation.test.ts` pins the convention's contract and pins that each of the three skills points at it (and, deliberately, that none of them names the source directories itself — the anti-drift assertion).

## Alternatives Considered

- **Restate the step in each of the three skills**: rejected — the drift the `skill-conventions/` extraction exists to prevent, and the risk the story itself named.
- **A new `/pair-capability-read-adoption`**: rejected — a fourth reader of adoption context against D24, and a composition every generating skill would have to make required (or degrade around) for a step that is one bounded read.
- **Fold it into `/pair-capability-verify-adoption`**: rejected — that skill audits already-written code for conformity. Generation needs the decisions as _input_, before anything exists to audit; overloading it would give one skill two unrelated verbs.
- **Ship an executable adoption reader** (a `@pair/knowledge-hub` module): rejected — nothing in the natural-language flow would call it, so it would be an unenforced second source of truth. The conformance test guards the words the executor actually reads.

## Consequences

- A change to how generation reads adoption is a one-file edit plus a mirror, not a three-skill sweep — and the guard fails if a skill starts re-describing the mechanics.
- Generated stories carry citations in the body. Reviewers and refiners get the "why this shape" without opening the adoption tree; the cost is slightly longer story bodies.
- `/pair-process-brainstorm`'s SKILL.md absorbed the addition against its 28 KB progressive-disclosure budget, which binds on the **installed mirror** (the copy an assistant loads, systematically larger than its dataset source): mirror 28,478 B, ~194 B of headroom. The budget was not raised — room was made by disclosing the adoption-read degradation ladder into the `degradation.md` sibling and by removing four Notes restatements duplicated in the preamble, Parametrization and Phase 3. The next addition to that skill needs another split.
- Verification for this class of change stays a **hand-traced fixture dry-run** (seeded adoption + empty adoption), reported on the PR, plus the static conformance guard. There is no runtime to assert against, and pretending otherwise would mean writing the parallel implementation this decision rejects.

## Adoption Impact

- `.pair/knowledge/guidelines/technical-standards/ai-development/skill-conventions/adoption-informed-generation.md` (+ dataset source) — the convention itself; registered in that directory's README index and in `.pair/llms.txt`.
- `plan-stories` (Step 2b), `refine-story` (Step 1b), `brainstorm` (phase 3 preamble) — pointer + subject delta, in both the dataset source and the installed `.claude/skills/` mirror.
- `plan-epics` (Steps 3-4) — persists a citation / `Revisits` supplied on `$candidates`; it runs no read of its own.
- `.pair/knowledge/skills-guide.md` (+ dataset source) — the Adoption Files matrix lists the three generating skills as readers of ADR and ADL.
- `packages/knowledge-hub/src/conformance/adoption-informed-generation.test.ts` — the guard.
- Docs site: `concepts/adoption-files.mdx` and `developer-journey/iteration.mdx`.

## References

- Story #280 — Adoption-informed story generation (R3.13, Spec G3)
- Convention precedent: [to-issues-triage.md](../../knowledge/guidelines/technical-standards/ai-development/skill-conventions/to-issues-triage.md) (#231) — same shape: one convention, per-skill deltas, one conformance guard
- D24 (one new process skill; capabilities are composed, not multiplied) and D21 (missing optional context degrades, never HALTs)
