# `/pair-capability-record-decision` Invocation Contract

`/pair-capability-record-decision` is the **sole generic writer of adoption files**. There are exactly **two exception classes**, and nothing else writes adoption generically (an `assess-*` skill never does):

1. **Section owners** — a skill that owns one config-registry section end-to-end writes that section itself and composes `/pair-capability-record-decision` only for the decision record: `/pair-capability-setup-pm` (PM section of `way-of-working.md`), `/pair-capability-verify-quality` (Custom Gate Registry, same file), `/pair-capability-classify` (`## Tag Projection` in `tech/risk-matrix.md`).
2. **Inline context-map maintenance** — `/pair-process-brainstorm` (phase 2) and `/pair-process-refine-story` write approved glossary terms, entities, and rules into `context-map.md` (or the owning `subdomain/<slug>.context.md`) inline, as part of their own domain step, per [context-map-maintenance.md](../../../architecture/design-patterns/context-map-maintenance.md). `/pair-capability-record-decision` remains the writer of the map's **decision-backed** (DDR-driven) sections and of every decision record.

The authoritative list is `/pair-capability-record-decision`'s own SKILL.md — if this line and that list ever disagree, the skill wins and this line is the stale one. A writer-monopoly audit (`/pair-capability-verify-adoption`) applies the list, not the phrase "sole writer": both exception classes are conformant, not violations.

Every `assess-*` skill, and any orchestrator that accepts an `assess-*` proposal, follows the same contract — stated once here.

## The tuple

An `assess-*` skill never writes. It returns:

```text
{ content, target, decision-metadata }
```

- **`content`** — the rendered adoption content (ready to write, scoped to the section this skill owns).
- **`target`** — the adoption file/section that content is destined for (e.g. `adoption/tech/tech-stack.md`, AI section).
- **`decision-metadata`** — `$type` (architectural | non-architectural | domain), `$topic` (kebab-case), `$summary` (one line) — the arguments `/pair-capability-record-decision` needs to classify and file the decision.

The caller (the orchestrator or the human/agent invoking the assess-* skill directly) persists by composing:

```text
/record-decision(content, target, decision-metadata)
```

which writes `content` into its owned section of `target` (a heading-scoped merge — it preserves the rest of the file) and records the ADR/ADL/DDR per its own classification rule.

## Standard "Verify" line (end of Path A/B in the resolution cascade, and end of the assessment step)

> **Verify**: Proposal emitted. Persistence is performed by the caller via `/pair-capability-record-decision(content, target, decision-metadata)`, never by this skill.

## Standard Composition Interface shape

```markdown
When composed by `/bootstrap`:

- **Input**: `/bootstrap` invokes during Phase 2[, with <skill-specific args>].
- **Output**: Returns `{ content, target, decision-metadata }` plus the report. Writes nothing.
- **Persistence**: `/bootstrap` accepts the proposal and composes `/record-decision(content, target, decision-metadata)` to write <target> and record the <ADR|ADL>.

When invoked **independently**:

- Full interactive flow. The skill returns the proposal; the human (or agent) persists it by composing `/record-decision`, then commits.
```

Additional "When composed by ..." blocks (e.g. `/pair-process-implement`, `/pair-process-review` for `/pair-capability-assess-stack`'s implementation/review modes) follow the same Input/Output/Persistence shape — only the caller name, trigger, and target/ADR-vs-ADL vary.

## Standard degradation bullet

> If the caller cannot persist (e.g. `/pair-capability-record-decision` not installed), the proposal stands as a report — adoption stays unchanged.

## What stays in the skill (the delta)

- The exact `target` file/section and the `decision-metadata` values (`$type`, `$topic`, `$summary` template) for that domain — these are the whole point of each assess-* skill and never move out.
- Whether the decision is typically architectural or non-architectural for that domain, and the exception condition when it flips (e.g. "testing decisions are non-architectural, exception: contract testing requiring service boundaries") — this is domain judgment, not boilerplate; it stays as a Notes bullet, `/pair-capability-record-decision`'s own classification gate (Step 1) still runs regardless.
- Section-ownership notes (which skill owns which part of a shared file).
