# `/pair-capability-record-decision` Invocation Contract

`/pair-capability-record-decision` is the **sole generic writer of adoption files** (the one exception is `/pair-capability-setup-pm`, which writes the PM section of way-of-working.md itself and composes `/pair-capability-record-decision` only for the decision record). Every `assess-*` skill, and any orchestrator that accepts an `assess-*` proposal, follows the same contract — stated once here.

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

> **Verify**: Proposal emitted. Persistence is performed by the caller via `/record-decision(content, target, decision-metadata)`, never by this skill.

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
