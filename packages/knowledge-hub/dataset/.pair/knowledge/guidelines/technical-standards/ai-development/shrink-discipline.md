# Shrink Discipline

Fewer words per section, same information. Input (files re-read every turn) costs more than output, so the largest lever is what agents load: templates, adoption, ADR, decision-log, agent context. Principle: ADR-010 (`adr-010-skill-authoring-effectiveness-standard`) principle 4 (pruning) — generalized here, not restated.

## Rules

1. **Information over target.** A cut that loses a fact is not made. A file already minimal is left alone.
2. **One home per fact.** A duplicate becomes a pointer to the retained copy.
3. **Drop restatement**: headings repeated in prose, "as mentioned above", recaps of the diff, intent announced before the content.
4. **Sections stay**, words per section shrink. Each template section declares a word limit; the number of sections never drops.
5. **Decision, status, consequences, links and identifiers are never trimmed.**
6. **Measure, don't judge.** Record a baseline once with `pair-cli tokens --json` into a file your project chooses; later, `pair-cli tokens --baseline <that file>` reports the delta in words and estimated tokens (`ceil(characters / 4)`, no tokenizer) per area. The counter never replaces review of what was removed.

## Targets

Indicative, not a gate. Example from pair's own repo: numbers measured on pair's corpus (its committed baseline, words; −30% = target). In your project, derive targets from your own baseline.

| Area | Baseline words | Target words | Rule of thumb |
| --- | --- | --- | --- |
| Templates | 15008 | 10506 | limit per section; example only where the format is non-obvious |
| Adoption | 17511 | 12258 | state the rule once; link, don't copy |
| ADR | 54166 | 37916 | Decision + Consequences in full; context in a few lines |
| Decision-log | 132801 | 92961 | one decision, the reason, the alternative rejected |
| Agent context (`AGENTS.md`, `CLAUDE.md`) | 2379 | 1665 | rules only; no rule lost |
| PR, review, story/issue | — | per template limit | evidence and decisions, not narration |
| Code | — | fewer lines, same behavior | see Minimal code |

## Before / after

**PR body** — before: "In this PR I went ahead and refactored the parser so that it now handles the empty-area case, which previously threw." After: "Parser: empty area returns zeros (was: throw)."

**Review finding** — before: "I noticed that on line 42 there might possibly be an issue where the value could be undefined." After: "L42: value may be undefined → guard."

**Story/issue** — before: "As a user I would really like to be able to..., because it would help me..." (three sentences of motivation). After: one `As a / I want / So that` line each.

**Template** — before: section prose "Describe in detail what the change does and why it was needed." After: `## Summary (≤40 words)`.

**Adoption** — before: the same stack list in `tech-stack.md` and `architecture.md`. After: one list, the other file links to it.

**ADR** — before: a Context section retelling project history. After: the forces that drove the choice, three lines; history stays in git.

**Decision-log** — before: "After a long discussion we considered A, B and C..." After: "Chose B. Rejected A (cost), C (scope)."

**Agent context** — before: a rule stated in AGENTS.md and again in a Quick Rules bullet. After: stated once, referenced.

**Code** — before: an interface, a factory and one implementation for a single call site. After: the function.

## Agent style

Default for any agent working in a pair project:

- Terse. No preamble, no politeness formulas, no closing recap of what the diff already shows.
- Show changed code, not an explanation of obvious steps.
- Say it once; a result states outcome and evidence, not the path.

## Minimal code

- The least code that satisfies the acceptance criteria; no abstraction without a second caller.
- Reuse what exists before adding; delete restated logic.
- No speculative options, hooks or layers; no comment that restates the line below it.
- Tests prove behavior, not structure: simplifying code must leave the existing tests green.

## Related

- ADR-010 (`adr-010-skill-authoring-effectiveness-standard`) — pruning discipline for skills
- [Documentation Standards](documentation-standards.md)
