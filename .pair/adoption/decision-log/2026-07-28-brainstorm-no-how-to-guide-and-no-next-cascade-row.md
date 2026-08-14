# Decision: `/pair-process-brainstorm` ships without a numbered how-to guide and without a `/pair-next` cascade row

## Date

2026-07-28

## Status

Active

## Category

Convention Adoption

## Context

Story #230 adds `pair-process-brainstorm`, the tenth process skill. Two catalog invariants that held while there were nine process skills came into question:

- **One process skill ↔ one numbered how-to guide.** The distributed KB — `packages/knowledge-hub/dataset/.pair/knowledge/how-to/` — carries exactly nine guides (`01`…`11`, with `04`/`05` retired), one per process skill (the repo-root KB mirror still carries the two retired files, `04-how-to-define-subdomains.md` and `05-how-to-define-bounded-contexts.md`: pre-existing mirror drift, unrelated to this decision — **corrected 2026-08-11:** that drift is closed. Story #393 / [PR #421](https://github.com/foomakers/pair/pull/421) deleted both files from the repo-root mirror and regenerated `.pair/llms.txt`, so mirror and dataset now carry the same nine guides; the residual class is recorded in that PR's own [mirror-guard ADL](./2026-08-11-a-mirror-guard-compares-the-transform.md) — #426 was absorbed into #393 and closed, and the residual is *not* nesting: the CLI install path runs no mirror cleanup at all, so a top-level orphan survives too). Three docs-site pages restate "9 how-to guides" in five places (`concepts/ai-assisted-sdlc.mdx` ×2, `developer-journey/index.mdx` ×2, `developer-journey/execution.mdx` ×1). A tenth guide would renumber the sequence (brainstorm runs *before* `01-how-to-create-PRD.md`) and touch every page restating the count.
- **`/pair-next` can suggest every process skill.** `/pair-next`'s cascade (Steps 2–3) detects process skills from board/adoption state, and its own Notes claim "nearly all skills can be suggested".

Brainstorm is a **discovery entry point**: it opens a theme the backlog does not yet contain. There is no board state, adoption-file state, or item predicate that says "a theme nobody has filed yet is worth exploring" — the trigger is a human's intent, not detectable project state.

## Decision

1. **No numbered how-to guide.** `/pair-process-brainstorm`'s `SKILL.md` is the canonical reference for its three phases. The `skills-guide.md` process table records `—` in the How-To column, with an adjacent note stating why. The how-to count stays 9.
2. **No `/pair-next` cascade row.** `/pair-process-brainstorm` is catalogued in `next`'s Skill Catalog table (so the corpus-to-catalog invariant the skills-conformance gate enforces still holds) but is never suggested by the cascade. `next`'s Notes state the reason explicitly, alongside the existing `/pair-capability-publish-pr` exception.
3. **But it IS present in the narrative flow.** No guide and no cascade row does **not** mean invisible: the KB Operational Flow (`knowledge/way-of-working.md`) and the docs-site Process Lifecycle ladder each carry a **Discovery** entry marked as an optional entry point ahead of Induction, explicitly outside the nine numbered steps. Scope of this decision: the numbered-guide sequence and the cascade, nothing else.

## Alternatives Considered

- **Add `00-how-to-brainstorm.md`**: rejected for now. It buys nothing the `SKILL.md` doesn't already say, while renumbering the guide sequence and forcing a count sweep across the three docs pages that pin it (five occurrences) plus the KB prose — churn disproportionate to the value, and reversible later if manual (skill-less) discovery is ever requested.
- **Add a cascade row (e.g. "no Draft items anywhere → suggest `/pair-process-brainstorm`")**: rejected. An empty-Draft board is exactly the fresh-project state that already steers to `/pair-process-bootstrap`/`/pair-process-plan-initiatives`; a discovery row there would fire on projects that need planning, not discovery — a false positive on every well-groomed backlog too (a board with no Draft items is the *desired* state, not a prompt to brainstorm).
- **Leave both invariants silently broken**: rejected. An undocumented `—` in the How-To column and a catalogued-but-unreachable skill read as omissions; a reviewer cannot tell a deliberate exception from a forgotten one.

## Consequences

- The "one process skill ↔ one how-to guide" symmetry is now explicitly a 9-of-10 mapping; the exception is documented in `skills-guide.md` next to the table, so future count sweeps do not "fix" it by inventing a guide.
- `/pair-next` never proposes `/pair-process-brainstorm`; humans invoke it directly. If discovery ever needs surfacing, it belongs behind an explicit argument (like `--root`), not behind a state predicate.
- Adding a brainstorm how-to guide later remains a self-contained follow-up: one file plus the "9 how-to guides" count sweep.

## Adoption Impact

- [skills-guide.md](../../knowledge/skills-guide.md) (and its dataset source): process-skill table gains the `/pair-process-brainstorm` row with `—` and the explanatory note.
- [way-of-working.md](../../knowledge/way-of-working.md) (and its dataset source): Operational Flow gains the `🔍 Discovery (optional entry point)` entry; the docs-site `developer-journey/index.mdx` ladder gains the matching pre-Level-1 line. Both state it is outside the nine numbered steps, so a later count sweep does not read it as a tenth step.
- `next`'s `SKILL.md` (dataset + installed mirror): catalog row added; Notes record the never-suggested rationale.
- No dataset mirror of this record: sibling ADLs in `adoption/decision-log/` are adoption-only.

## Amendment (2026-07-30, review round 3): ADR-009's exception list

[adr-009-assess-output-only.md](../tech/adr/adr-009-assess-output-only.md) records `/pair-capability-record-decision` as the **sole generic writer** of adoption files, with `/pair-capability-setup-pm` as "the one delegated exception". That list has since grown, by decisions that all predate this story: the section owners `/pair-capability-verify-quality` (Custom Gate Registry) and `/pair-capability-classify` (`## Tag Projection`), and — authorized by the [context-map-maintenance](../../knowledge/guidelines/architecture/design-patterns/context-map-maintenance.md) guideline (#244) — the **inline** glossary/entity/rule maintenance `/pair-process-brainstorm` (phase 2) and `/pair-process-refine-story` perform in `context-map.md`.

No new ADR is owed and **ADR-009's decision text stays as written** — it is the historical record of the #224 decision, not a live registry. This line is the amendment that keeps the adoption record and the shipped invariant from reading as contradictory. The authoritative, current list lives in `/pair-capability-record-decision`'s own `SKILL.md`; [record-decision-contract.md](../../knowledge/guidelines/technical-standards/ai-development/skill-conventions/record-decision-contract.md) restates it (both classes, no exclusive "one exception" phrasing) and a conformance guard pins both copies so they cannot drift apart again.
