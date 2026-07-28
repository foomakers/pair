# Decision: `/brainstorm` ships without a numbered how-to guide and without a `/next` cascade row

## Date

2026-07-28

## Status

Active

## Category

Convention Adoption

## Context

Story #230 adds `pair-process-brainstorm`, the tenth process skill. Two catalog invariants that held while there were nine process skills came into question:

- **One process skill ↔ one numbered how-to guide.** `.pair/knowledge/how-to/` carries exactly nine guides (`01`…`11`, with `04`/`05` retired), one per process skill, and eight docs-site pages restate "9 how-to guides" (the docs-staleness gate pins that count). A tenth guide would renumber the sequence (brainstorm runs *before* `01-how-to-create-PRD.md`) and touch every page restating the count.
- **`/next` can suggest every process skill.** `/next`'s cascade (Steps 2–3) detects process skills from board/adoption state, and its own Notes claim "nearly all skills can be suggested".

Brainstorm is a **discovery entry point**: it opens a theme the backlog does not yet contain. There is no board state, adoption-file state, or item predicate that says "a theme nobody has filed yet is worth exploring" — the trigger is a human's intent, not detectable project state.

## Decision

1. **No numbered how-to guide.** `/brainstorm`'s `SKILL.md` is the canonical reference for its three phases. The `skills-guide.md` process table records `—` in the How-To column, with an adjacent note stating why. The how-to count stays 9.
2. **No `/next` cascade row.** `/brainstorm` is catalogued in `next`'s Skill Catalog table (so the corpus-to-catalog invariant the skills-conformance gate enforces still holds) but is never suggested by the cascade. `next`'s Notes state the reason explicitly, alongside the existing `/publish-pr` exception.

## Alternatives Considered

- **Add `00-how-to-brainstorm.md`**: rejected for now. It buys nothing the `SKILL.md` doesn't already say, while renumbering the guide sequence and forcing a count sweep across eight docs pages plus the KB prose — churn disproportionate to the value, and reversible later if manual (skill-less) discovery is ever requested.
- **Add a cascade row (e.g. "no Draft items anywhere → suggest `/brainstorm`")**: rejected. An empty-Draft board is exactly the fresh-project state that already steers to `/bootstrap`/`/plan-initiatives`; a discovery row there would fire on projects that need planning, not discovery — a false positive on every well-groomed backlog too (a board with no Draft items is the *desired* state, not a prompt to brainstorm).
- **Leave both invariants silently broken**: rejected. An undocumented `—` in the How-To column and a catalogued-but-unreachable skill read as omissions; a reviewer cannot tell a deliberate exception from a forgotten one.

## Consequences

- The "one process skill ↔ one how-to guide" symmetry is now explicitly a 9-of-10 mapping; the exception is documented in `skills-guide.md` next to the table, so future count sweeps do not "fix" it by inventing a guide.
- `/next` never proposes `/brainstorm`; humans invoke it directly. If discovery ever needs surfacing, it belongs behind an explicit argument (like `--root`), not behind a state predicate.
- Adding a brainstorm how-to guide later remains a self-contained follow-up: one file plus the "9 how-to guides" count sweep.

## Adoption Impact

- [skills-guide.md](../../knowledge/skills-guide.md) (and its dataset source): process-skill table gains the `/brainstorm` row with `—` and the explanatory note.
- `next`'s `SKILL.md` (dataset + installed mirror): catalog row added; Notes record the never-suggested rationale.
- No dataset mirror of this record: sibling ADLs in `adoption/decision-log/` are adoption-only.
