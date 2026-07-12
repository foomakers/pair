# ADR-010: Skill Authoring Effectiveness Standard

**Status:** Accepted
**Date:** 2026-07-12
**Context:** Story #313 (Skill corpus effectiveness) — Task T2

> Numbering note: `adr-009` exists on an unmerged branch at the time of writing; this ADR takes the next free number on the assumption that branch merges first. Renumber to 009 only if that branch is abandoned.

## Decision

Adopt a nine-principle **effectiveness standard** as the authoring bar for every Pair skill — new and existing — and as the review checklist for every skill edit:

1. **Description = trigger** — description states what the skill is + its distinct trigger branches (one trigger per branch); mostly-composed capabilities carry a lean reach clause; body identity stays out of the description.
2. **Information hierarchy** — steps > in-file reference > disclosed reference (sibling file behind a context pointer whose wording determines reach); progressive disclosure licensed by branching.
3. **Completion criteria** — every Verify beat checkable (done vs not-done decidable) and exhaustive where thoroughness matters.
4. **Pruning discipline** — single source of truth per meaning; relevance test per line; no-op test per sentence (delete whole failing sentences); clear sediment on every edit.
5. **Leading words** — compact pretrained concepts repeated as tokens to anchor execution (body) and invocation (description).
6. **Positive phrasing** — target behavior stated; prohibitions only as hard guardrails paired with the positive target.
7. **Co-location** — a concept's definition, rules, and caveats under one heading, adjacent to the step they govern.
8. **Constraints** — spec caps `name` ≤ 64 / `description` ≤ 1024 chars separately, Pair adds a stricter combined ≤1024 bound; dataset skills carry only agentskills.io-spec top-level frontmatter (`name`, `description`, and the optional `license`/`compatibility`/`metadata`/`allowed-tools`) plus `version`/`author` as a tolerated Pair extension for provenance — no assistant-specific fields (portability across assistants); dataset + installed mirror updated in the same commit.
9. **Evaluation** — should-trigger / should-not-trigger prompt sets run in fresh sessions; description rewrites gated by before/after results.

Documented in:

- `apps/website/content/docs/contributing/writing-skills.mdx` — full standard, per-principle "how to check" tests, review checklist.
- `packages/knowledge-hub/dataset/.pair/knowledge/skills-guide.md` (+ root mirror) — condensed "Authoring Standard" section.

## Rationale

The previous authoring guideline was **conformance-only**: it prescribed structure (frontmatter, C/S/A/V pattern, HALT, composition tables) but said nothing about what makes a skill trigger reliably or execute predictably. The corpus audit (2026-07-12, three sources: structural audit of all 35 skills; agentskills.io spec + Claude Code skill docs; the `writing-great-skills` reference model) found the corpus exemplary on conformance and weak on effectiveness:

- 35/35 descriptions are capability summaries, not triggers; the 10 `assess-*` descriptions are near-clones.
- Recurring scaffold (cascade, idempotency, graceful degradation, record-decision contract) restated across 10–34 skills — ~35–65% of a typical skill.
- Zero progressive disclosure: 35 monolithic SKILL.md; orchestrators keep HALT rules ~380 lines from the phases they govern.
- A substantial minority of Verify beats are trivially satisfiable ("internally consistent", "guidelines loaded").
- A meaning-preserving slimming pass yielded only −1.8%, confirming the gains are structural, not verbosity.

A standard fixes the root cause: without an effectiveness bar, every future skill reproduces these gaps and the corpus needs periodic slimming passes instead of staying lean by discipline.

**Alternatives considered:**

1. **Keep conformance-only guideline, fix skills ad hoc** — rejected: no bar for new skills; regressions guaranteed; T3–T6 would have no shared review criteria.
2. **Adopt the reference model verbatim (link out to `writing-great-skills`)** — rejected: external repo not under our control; vocabulary must be reimplemented in Pair's own voice and bound to Pair's mechanics (dataset/mirror, composition, C/S/A/V).
3. **Enforce everything via tooling only** — rejected: only principle 8 (limits, frontmatter portability) and parts of 9 are statically checkable; the rest need a written standard applied in review.

## Consequences

**Positive:**

- New skills must meet the standard immediately; the review checklist makes it enforceable in PR review.
- Existing corpus is refactored to the standard via #313 T3–T6 (descriptions, dedup, disclosure, criteria/steering), gated by the T7 eval.
- Shared conventions converge on single sources of truth — one-place edits instead of 10–34-file sweeps.
- Description rewrites become evidence-based (before/after trigger eval) instead of taste-based.

**Negative:**

- Authoring a skill costs more up front (trigger analysis, eval run, checklist pass).
- The eval (T7) adds a manual, fresh-session procedure until automated.
- Principles 1–7 remain judgement calls in review; only constraints and eval evidence are mechanically checkable.

## Adoption Impact

- `apps/website/content/docs/contributing/writing-skills.mdx` — extended with the effectiveness standard + review checklist.
- `packages/knowledge-hub/dataset/.pair/knowledge/skills-guide.md` and root mirror `.pair/knowledge/skills-guide.md` — new "Authoring Standard" section.
- Applies to all future skill PRs; #313 T3–T6 apply it to the existing 35 skills.

## References

- Story: #313 (Skill corpus effectiveness), Task T2; AC2.
- Agent Skills specification: <https://agentskills.io>
- Reference model: `mattpocock/skills` — `writing-great-skills` skill + glossary (predictability as root virtue).
- Corpus audit evidence: #313 Background section (2026-07-12).
