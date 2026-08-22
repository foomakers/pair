# Adoption-Informed Generation (decision log + ADR + context map)

The generic shape a **generating** skill uses to read the project's own history before it drafts anything: the recorded decisions (ADRs, decision log) and the domain map are loaded first, so what the skill generates reflects what the project already settled instead of re-proposing a rejected approach, contradicting a recorded decision, or inventing a synonym for a registered term (R3.13).

It is a **read-only input to generation**, not a new capability and not a write path: generation reads adoption and never writes to it. Writing a decision stays with the human and `/pair-capability-record-decision` (the map's inline glossary maintenance is a separate, guideline-authorized step of `/pair-process-brainstorm` phase 2 and `/pair-process-refine-story`, not part of this read).

## Sources — read in this fixed order

1. **Architectural decisions** — `adoption/tech/adr/adr-NNN-<topic>.md`.
2. **Non-architectural decisions** — `adoption/decision-log/YYYY-MM-DD-<topic>.md` (ADL entries; the directory also holds `Category: Analysis` entries — see *Authorities vs context* below).
3. **Domain map** — `adoption/product/context-map.md` plus, for every subdomain in scope, both its strategic catalog entry `adoption/product/subdomain/<slug>.md` (where its class and volatility are recorded — the file the scope filter resolves **the item's** subdomain from; a *record's* subdomain is never resolved here, and is a scope match only where the name is in the text stage 1 indexed — see *Bounded read* stage 2) and its `adoption/product/subdomain/<slug>.context.md` sibling, and the bounded-context files under `adoption/tech/boundedcontext/`. Domain decisions (`adoption/product/ddr/`) are reached through the map's decision-backed sections; a DDR the map cites is read with it.

**Authorities vs context.** Only **ADR, ADL and DDR** entries are *authorities* — what may **drop or reshape a candidate on a decision's ground**, or be reopened with a `Revisits` flag. The **context map is not an authority**: it settles no question and is never reopened, but it is not inert either — it constrains generated **wording** (*Precedence*, last bullets) and carries its own citation form, `(per context-map: <term>)` (*Cite*). A `Category: Analysis` entry is neither: it records a technical analysis, concludes in a `## Recommendation` rather than a `## Decision`, and need not conclude in a decision at all (the analysis-log template's own words). It is read as **context** — it may inform wording and scope — and it never drops or reshapes a candidate, never carries a `(per ...)` citation, and never triggers a `Revisits` flag: nobody decided anything to revisit. Everywhere below, **record** means an authority.

The **source order is fixed** (1 → 2 → 3), and within a source files are enumerated by `Date` — the indexed head field, or the filename date for `decision-log/` entries — with equal dates enumerated by filename. Enumeration is a **reading sweep, not a ranking**: an id (`adr-NNN`) is a name, and **an id never orders anything**, here or in *Precedence* (where the two live `Accepted` files both numbered `adr-018` are the standing counter-example). Which of two records wins when they answer the same question is decided in *Precedence* alone. The read is a function of the adoption tree, never of what happened to be in the assistant's context.

**Reuse over re-read**: when the caller has **already loaded** one of these in the same run — `/pair-process-brainstorm`'s phase 2 and `/pair-process-refine-story`'s Step 2 both load the context map — this step consumes that copy instead of re-reading the file. One run reads each source at most once — and a **composed writer is part of the caller's run**: when a caller performs this read and hands its result to the writer in-band with the candidates, the writer inherits it and does **not** re-derive it. The caller's scope is the run's scope; the writer confirms the applied effects rather than re-scoping them.

## Bounded read — scope, not the whole log

Reading full history into a generation prompt is the failure mode this step is designed around (large projects have hundreds of records). The read is bounded in two stages:

1. **Index every record, cheaply** — **metadata only, read from the file head**: its id (from the filename), its `#` H1 title **verbatim** (that title *is* the one-line summary — none is derived, so no body is opened to produce one), its `Date`, its `Status`, and its `Category`. The index is produced by a **single directory-wide head/grep sweep** over those metadata lines — one sweep per source directory, **not one open per record**: stage 1 costs a function of the number of sources, not of the project's age (per-record opens would spend one read per record — the whole corpus, growing with the project's age — before a word is drafted).
   - **Two head spellings, both accepted.** Each field is read in the templates' heading form (`## Status`, `## Date`, `## Category`) **and** in the inline head-field form the same records use in the wild (`**Status:** Accepted`, `**Date:** 2026-02-10`). Both are common — in this repository's own `adr/` a large minority carry the inline form, all of them live. The sweep matches either; neither spelling is a second-class record.
   - **Where the value sits differs by spelling, and the sweep must carry it.** In the inline form the value is **on the matched line**. In the heading form it is not: the matched line holds only the field name, and the value is the **next non-blank line** below it (the templates leave a blank line between). A sweep that matches the field name alone — or carries a single trailing line, which lands on that blank separator — reads every heading-form record as *field absent* and, by the rule below, sends the whole directory to a stage-2 body open: the exact cost this stage exists to prevent. Carry at least two trailing lines (`grep -A2 -E '^(## |\*\*)(Status|Date|Category)'`) or sweep with a bounded `head -n` over the directory glob.
   - **`Category` tells the `decision-log/` kinds apart** (`Analysis` ⇒ context, anything else ⇒ an authority); the H1 prefix carries the same discriminator (`# Decision:` = ADL, `# DDR:` = a domain decision, `# Analysis Log:` = analysis). A `# DDR:` head **found in `decision-log/` is a DDR authority** — source 3's `adoption/product/ddr/` is where `/pair-capability-record-decision` files them, not the only place they are read from, and a DDR written next to the ADLs carries no `Category` at all.
   - **An absent or unrecognized head field is not a verdict.** A record whose `Category` resolves to neither kind, or whose `Status` matches none of the values in *Precedence*, is **opened at stage 2 before it may act as an authority** — and if the body still leaves it unresolved it is **surfaced to the developer** (the Degradation warning) rather than quietly dropping out of the authority set. Silence is never read as "not live": the same *err toward reading* bias that governs ambiguous scope.

   This stage is complete: every record is indexed, none is skipped, and **no record body is read here**.
2. **Open the body only of the records in scope.** Scope is decided against **stage 1's only text — the record's verbatim H1 title plus its filename slug**; nothing else was indexed, so nothing else may be filtered on. A record is in scope when that text shares a term with the item being generated: a term of the item's subject, or a term the item's draft will itself use (the entities, states, components it names).
   - **A subdomain, bounded context or component is a match only when that name appears in the indexed text.** Stage 1 indexes no subdomain, context or component field — no record template carries one — so such a match is never inferred from a field that was never read.
   - **Terms are compared through the context map**, which source 3 has already loaded: a synonym in the item matches the registered term in a title, so a record is not missed because the item was phrased in the vocabulary the map does *not* register.
   - **Staying at the index line needs positive evidence.** A record is left unopened only when its indexed text **positively resolves to a different subject**. A title that is generic, or that names a mechanism, schema or artifact rather than the subject it governs (`# ADR-011: Canonical States + n-m State-Mapping Schema`), settles nothing — it is **opened**. The err-toward-reading bias is the ordinary case, not a hedge reserved for flagrant ambiguity.

So the number of full bodies read scales with the item's scope, **never the entire decision history** — and inside that bound the bias runs one way only: a bounded read errs toward opening one extra body, never toward silently skipping a live decision.

## Precedence — supersession first, then recency

- **Live** = an authority currently in force: `Accepted` for an ADR or a DDR and `Active` for an ADL. **Either status in any amended form** is live and its amended contract is the one that applies — the template's `Accepted (amended YYYY-MM-DD — ...)`, the `Accepted — amended by [ADR-NNN] (...)` spelling used in the wild, and an ADL's `Active (amended YYYY-MM-DD — ...)` are all the same status as the bare word. Only live records constrain, are cited, or can be reopened.
- **A `Status` that did not resolve is not** thereby non-live. It is opened at stage 2 (above) and, if still unresolved, reported — never silently demoted to non-live, which would strip a record of its authority with no warning and no citation.
- **`Proposed` is not yet an authority.** A draft under review never drops or reshapes a candidate, is never cited, and never triggers a `Revisits` flag — nobody has decided anything yet, and a proposal that silently became a constraint is the same defect as an analysis applied as a decision.
- **`Deprecated` and `Superseded` are no longer authorities.** A record whose `Status` is `Superseded` (or that carries a "Superseded by" pointer) is **never the authority**; the superseding record is read in its place, and the superseded one is not cited. A `Deprecated` record has no successor to read in its place — it simply stops constraining, and the question it used to answer is open again.
- When two live records answer the same question, the **most recent by `Date`** wins — the indexed head field, or the filename date for `decision-log/` entries — regardless of which source it came from. Record kind is not a precedence rank: an ADL dated after an ADR refines it.
- **Never by id.** Ids are per-source (`adr-020` is not comparable with an ADL's `2026-07-19`) and are not even unique within a source — this repository's own `adr/` holds two live `Accepted` files numbered 018. A **same-id** pair is ordered by `Date` like any other. If two live records share the same `Date` too, neither wins: both are read and the conflict is surfaced, so the tie is never broken differently on two runs of the same tree.
- A registered term, entity, or rule in the context map outranks an informal use of the same word anywhere else — generated wording adopts the registered term rather than a synonym.
- A `Category: Analysis` entry **takes no part in this order at all**: it is context, not an authority, so however recent it is it never outranks — or supersedes — a live ADR, ADL or DDR.

## What "informed" means — constrain, cite, flag a revisit

Three concrete effects on generated output, and nothing else:

1. **Constrain** — a candidate that contradicts a live decision is reshaped to fit it, or dropped. A candidate that re-proposes something a live record already rejected is not generated at all; the record's rejection is reported instead.
2. **Cite** — every generated item whose shape was decided by a record carries the citation inline, in one form: `(per ADR-013)`, `(per decision-log/2026-07-12-adr-sequential-naming-convention)`, `(per DDR-004)`, `(per context-map: <term>)`. The citation is part of the generated content, so the human reads *why* the item is shaped that way without opening the adoption tree.
3. **Flag a revisit** — an item that genuinely needs to reopen a live decision is allowed, and is labelled `Revisits <id>: <one-line why>` on the item and surfaced in the confirmation prompt before any write. Silently contradicting a record is the one outcome this step forbids.

## Determinism

Same adoption tree + same subject ⇒ same records read and same influence on the output. The three properties that hold it: the source order and within-source ordering are fixed; the scope filter is content-based and runs on the **indexed title + filename slug** (a shared term, with subdomain/context/component counting only where that name is in the indexed text), not a sample or a "most relevant N"; and precedence is resolved by `Status` and the indexed `Date` — **never by id**, never by preference — with an unorderable tie surfaced rather than broken arbitrarily. A re-run on unchanged adoption produces the same citations, in the same places.

## Degradation

Adoption history is **optional context** — its absence is the expected steady state of a fresh project, so this step degrades and is never a HALT:

- **No adoption directories, or empty ones** → generation proceeds exactly as it would without this step: no citations, no revisit flags, no warning noise beyond a one-line note. An empty-adoption run is indistinguishable from the pre-adoption-informed behavior.
- **A record is unparseable** (unreadable file, or a head that yields no title, `Status` or `Category` even after the stage-2 open — no record kind here carries frontmatter: the ADR, ADL and analysis-log templates are all heading-based markdown) → warn naming that file, skip **that record only**, and continue with the rest. This warning is where a record with an unresolvable `Status` surfaces; one bad file never disables the step.
- **The whole tree is unreadable** (permissions, missing mount) → warn once and degrade to the no-adoption path above.
- **A cited record disappears mid-run** → drop the citation rather than emit a dangling id.

## Fixture example

Seeded adoption (subject: a story about story generation):

```text
adoption/tech/adr/adr-009-assess-output-only.md                       Status: Accepted (amended 2026-07-28 — D14 exception)
adoption/tech/adr/adr-005-skills-infrastructure.md                    Status: Accepted — amended by [ADR-020] (...)
adoption/tech/adr/adr-020-bounded-flatten-depth-entry-granularity.md  Status: Accepted — amends ADR-005 (flatten semantics)
adoption/decision-log/2026-07-11-agent-execution-layer.md             Status: Active
adoption/product/context-map.md                                       term: "Adoption file" (registered; the item says "config file")
```

Generated candidate list, adoption-informed:

```text
├── "Assessment skill writes its proposal to adoption"     -> DROPPED (per ADR-009: assess-* are output-only; the recorder persists)
├── "Capability skill that records the adoption it read"   -> reshaped: read-only — the recorder stays the sole adoption writer (per ADR-009); wording uses "adoption file", not "config file" (per context-map: Adoption file)
├── "Register the new skill under a nested registry path"  -> reshaped to the registry's entry granularity (per ADR-005, amended by ADR-020)
└── "Move execution off the agent layer"                   -> CREATE — Revisits decision-log/2026-07-11-agent-execution-layer: the story's premise is that the layer moved
```

`ADR-005` is **live in its amended form**, so it still constrains and it *is* cited: `Accepted — amended by [ADR-020] (...)` and `ADR-009`'s `Accepted (amended 2026-07-28 — ...)` are the same status (*Precedence*), and the amending record — seeded above, because a record that is read must be in the tree — supplies the contract that applies. Only a `Superseded` record would be left uncited with its successor read in its place; an amendment is not a supersession. The `Revisits` flag on the ADL is licensed by its seeded `Status: Active`: a flag may only target a live authority, so a record seeded without a resolvable status could not carry one.

Empty-adoption fixture (same subject, no `adr/`, no `decision-log/`, no map): the same four candidates are generated with **no** citations, **no** DROPPED-by-decision entry and **no** revisit flag — the pre-adoption-informed output, produced without a warning beyond the one-line "no adoption history to read" note.

## Per-skill delta (what stays in the skill, not here)

Only these vary per skill and belong in the skill's own beat that composes this step:

- **The subject** that scopes the read (an epic and its candidate tree, a discovery's placed blob, one story being refined) — stated as "This skill's subject".
- **Where the citation lands** in that skill's generated artifact (a candidate line, an acceptance criterion, a technical-analysis paragraph).
- **Which confirmation prompt** shows the revisit flags before the write.

Nothing else: the source list, the bounded-read stages, precedence, and the degradation ladder are defined here once and are not restated per skill. **The citation forms are the one exception, for the skills that write one:** each calling skill that puts a citation into its generated artifact (`plan-stories`, `refine-story`, `plan-epics`) lists the forms inline, for the executor reading that skill in isolation, and a conformance guard pins every list against this convention so a form added or changed here without updating every list is caught, not left to drift silently. `brainstorm` links to this convention directly rather than enumerating the forms inline — it asks for "a citation" and lets the linked convention supply the syntax, since the guard that keeps a restated list from drifting only runs against the three skills that DO restate it. What is not restated, anywhere, is the REASONING behind the forms — why there are four, what each is for — only the forms themselves.
