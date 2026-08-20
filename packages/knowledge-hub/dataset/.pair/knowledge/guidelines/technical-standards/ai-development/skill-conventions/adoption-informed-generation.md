# Adoption-Informed Generation (decision log + ADR + context map)

The generic shape a **generating** skill uses to read the project's own history before it drafts anything: the recorded decisions (ADRs, decision log) and the domain map are loaded first, so what the skill generates reflects what the project already settled instead of re-proposing a rejected approach, contradicting a recorded decision, or inventing a synonym for a registered term (R3.13).

It is a **read-only input to generation**, not a new capability and not a write path: generation reads adoption and never writes to it. Writing a decision stays with the human and `/record-decision` (the map's inline glossary maintenance is a separate, guideline-authorized step of `/brainstorm` phase 2 and `/refine-story`, not part of this read).

## Sources — read in this fixed order

1. **Architectural decisions** — `adoption/tech/adr/adr-NNN-<topic>.md`.
2. **Non-architectural decisions** — `adoption/decision-log/YYYY-MM-DD-<topic>.md` (ADL entries; the directory also holds `Category: Analysis` entries — see *Authorities vs context* below).
3. **Domain map** — `adoption/product/context-map.md` plus, for every subdomain in scope, both its strategic catalog entry `adoption/product/subdomain/<slug>.md` (where its class and volatility are recorded — the file the scope filter resolves a subdomain from) and its `adoption/product/subdomain/<slug>.context.md` sibling, and the bounded-context files under `adoption/tech/boundedcontext/`. Domain decisions (`adoption/product/ddr/`) are reached through the map's decision-backed sections; a DDR the map cites is read with it.

**Authorities vs context.** Only **ADR, ADL and DDR** entries are *authorities* — what may constrain a candidate, be cited, or be reopened with a `Revisits` flag. A `Category: Analysis` entry is **not** one: it records a technical analysis, concludes in a `## Recommendation` rather than a `## Decision`, and need not conclude in a decision at all (the analysis-log template's own words). It is read as **context** — it may inform wording and scope — and it never drops or reshapes a candidate, never carries a `(per ...)` citation, and never triggers a `Revisits` flag: nobody decided anything to revisit. Everywhere below, **record** means an authority.

The order is **fixed** and, within each source, files are read in id order (`adr-NNN`) or date order (`YYYY-MM-DD`) — the read is a function of the adoption tree, never of what happened to be in the assistant's context.

**Reuse over re-read**: when the caller has **already loaded** one of these in the same run — `/brainstorm`'s phase 2 and `/refine-story`'s Step 2 both load the context map — this step consumes that copy instead of re-reading the file. One run reads each source at most once — and a **composed writer is part of the caller's run**: when a caller performs this read and hands its result to the writer in-band with the candidates, the writer inherits it and does **not** re-derive it. The caller's scope is the run's scope; the writer confirms the applied effects rather than re-scoping them.

## Bounded read — scope, not the whole log

Reading full history into a generation prompt is the failure mode this step is designed around (large projects have hundreds of records). The read is bounded in two stages:

1. **Index every record, cheaply** — **metadata only, read from the file head**: its id/date (from the filename), its `#` H1 title **verbatim** (that title *is* the one-line summary — none is derived, so no body is opened to produce one), and its `## Status`. This stage is complete: every record is indexed, none is skipped, and **no record body is read here**.
2. **Open the body only of the records in scope** — those whose subject overlaps the item being generated: same subdomain/bounded context, same touched component, or a term the item and the record share. Everything else stays at its index line.

So the number of full bodies read scales with the item's scope, **never the entire decision history**. When the index makes scope genuinely ambiguous, prefer opening the record — a bounded read errs toward reading one extra body, never toward silently skipping a live decision.

## Precedence — supersession first, then recency

- A record whose `Status` is `Superseded` (or that carries a "Superseded by" pointer) is **never the authority**; the superseding record is read in its place, and the superseded one is not cited.
- When two live records answer the same question, the **most recent** by id/date wins, regardless of which source it came from. Record kind is not a precedence rank: an ADL dated after an ADR refines it.
- A registered term, entity, or rule in the context map outranks an informal use of the same word anywhere else — generated wording adopts the registered term rather than a synonym.
- A `Category: Analysis` entry **takes no part in this order at all**: it is context, not an authority, so however recent it is it never outranks — or supersedes — a live ADR, ADL or DDR.

## What "informed" means — constrain, cite, flag a revisit

Three concrete effects on generated output, and nothing else:

1. **Constrain** — a candidate that contradicts a live decision is reshaped to fit it, or dropped. A candidate that re-proposes something a live record already rejected is not generated at all; the record's rejection is reported instead.
2. **Cite** — every generated item whose shape was decided by a record carries the citation inline, in one form: `(per ADR-013)`, `(per decision-log/2026-07-12-adr-sequential-naming-convention)`, `(per DDR-004)`, `(per context-map: <term>)`. The citation is part of the generated content, so the human reads *why* the item is shaped that way without opening the adoption tree.
3. **Flag a revisit** — an item that genuinely needs to reopen a live decision is allowed, and is labelled `Revisits <id>: <one-line why>` on the item and surfaced in the confirmation prompt before any write. Silently contradicting a record is the one outcome this step forbids.

## Determinism

Same adoption tree + same subject ⇒ same records read and same influence on the output. The three properties that hold it: the source order and within-source ordering are fixed; the scope filter is content-based (subdomain / context / shared term), not a sample or a "most relevant N"; and precedence is resolved by `Status` and date, never by preference. A re-run on unchanged adoption produces the same citations, in the same places.

## Degradation

Adoption history is **optional context** — its absence is the expected steady state of a fresh project, so this step degrades and is never a HALT:

- **No adoption directories, or empty ones** → generation proceeds exactly as it would without this step: no citations, no revisit flags, no warning noise beyond a one-line note. An empty-adoption run is indistinguishable from the pre-adoption-informed behavior.
- **A record is unparseable** (malformed frontmatter, unreadable file) → warn naming that file, skip **that record only**, and continue with the rest. One bad file never disables the step.
- **The whole tree is unreadable** (permissions, missing mount) → warn once and degrade to the no-adoption path above.
- **A cited record disappears mid-run** → drop the citation rather than emit a dangling id.

## Fixture example

Seeded adoption (subject: a story about story generation):

```text
adoption/tech/adr/adr-009-assess-output-only.md          Status: Accepted
adoption/tech/adr/adr-005-skills-infrastructure.md       Status: Superseded by ADR-020
adoption/decision-log/2026-07-11-agent-execution-layer.md
adoption/product/context-map.md                          term: "capability skill"
```

Generated candidate list, adoption-informed:

```text
├── "Assessment skill writes its proposal to adoption"  -> DROPPED (per ADR-009: assess-* are output-only; the recorder persists)
├── "Capability skill for adoption reading"              -> reshaped: extend the generation flow (per ADR-009), wording uses "capability skill" (per context-map: capability skill)
└── "Move execution off the agent layer"                 -> CREATE — Revisits decision-log/2026-07-11-agent-execution-layer: the story's premise is that the layer moved
```

`ADR-005` contributed nothing: it is superseded, so `ADR-020` was read in its place and `ADR-005` is not cited.

Empty-adoption fixture (same subject, no `adr/`, no `decision-log/`, no map): the same three candidates are generated with **no** citations, **no** DROPPED-by-decision entry and **no** revisit flag — the pre-adoption-informed output, produced without a warning beyond the one-line "no adoption history to read" note.

## Per-skill delta (what stays in the skill, not here)

Only these vary per skill and belong in the skill's own beat that composes this step:

- **The subject** that scopes the read (an epic and its candidate tree, a discovery's placed blob, one story being refined) — stated as "This skill's subject".
- **Where the citation lands** in that skill's generated artifact (a candidate line, an acceptance criterion, a technical-analysis paragraph).
- **Which confirmation prompt** shows the revisit flags before the write.

Nothing else: the source list, the bounded-read stages, precedence, the citation forms, and the degradation ladder are defined here once and are not restated per skill.
