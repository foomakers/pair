# Decision: The story-local (ACn) marker ban covers the KB corpora, with a curated allowlist for the three legitimate shapes

## Date

2026-08-12

## Status

Active

## Category

Convention Adoption

## Context

Story #382's absorbed #430 scope bans story-local acceptance-criterion markers (`(ACn)` in any spelling) from shipped files: outside its story the number has no referent, and it goes stale on re-refinement. The first corpus-wide guard (`packages/knowledge-hub/src/conformance/story-local-markers.test.ts`) scanned only the two SKILL corpora (`dataset/.skills` + `.claude/skills`). PR #420's round-7 review showed the extension AC reads "the KB corpus and the shipped skills": genuine story citations remained in shipped KB guidelines (`pr-states.md` citing #234's criteria, `quality-model.md`, `tier-aware-pipeline.md`, `coverage-config-example.md`) and a KB file reintroducing a marker passed the suite. Blindly extending the scan is impossible: the KB legitimately contains `ACn` tokens (template placeholder rows, worked example story bodies, one referent-carrying citation).

## Decision

1. **Scope**: the guard scans all four corpora — `dataset/.skills`, `.claude/skills`, `dataset/.pair/knowledge`, `.pair/knowledge`. Skill roots have NO exemptions.
2. **Exactly three shapes of `ACn` are legitimate**, and only in the knowledge corpora:
   - **template placeholders** (the token is the artifact's own structure): `epic-template.md`, `PRD_template.md`;
   - **worked examples** (the criteria are defined on the same page): `PRD_example.md`, `filesystem-implementation.md`;
   - **referent-carrying citations** `#<story>/ACn` (the story id travels with the number, e.g. `code-review-template.md`'s `#227/AC4`) — allowed everywhere via pattern, not per file.
3. Placeholders/examples are exempted by a **curated per-file allowlist** (corpus-relative path, one entry covers dataset source + installed copy). A staleness assertion fails when an allowlisted file disappears or no longer contains a marker, so the blind-spot list cannot rot.
4. The rule is **documented for authors** in the shared skill-conventions guidance (`guidelines/technical-standards/ai-development/skill-conventions/story-local-markers.md`, dataset + installed) — the guard catches reintroduction; the guideline prevents introduction.

## Alternatives Considered

- **File-level allowlist for `code-review-template.md` instead of the `#<story>/ACn` pattern**: rejected — a file-level exemption would also admit a future BARE citation added to that file; the pattern admits only the shape that carries its referent.
- **Line-pinned allowlist (file:line)**: rejected — every guideline edit above a pinned line would shift it and break the guard on legitimate changes; per-file + staleness check is the stable granularity.
- **Documenting the ban only in the guard's docstring**: rejected — a test file is not authoring guidance; the next skill/KB author reads skill-conventions, not `src/conformance/`, and would learn the rule only from CI failure.

## Consequences

- Reintroducing a story citation anywhere in the four corpora fails `story-local-markers.test.ts`, named with file and line.
- The genuine citations were stripped in place (both trees): `pr-states.md` (the #234 criterion cites become the guarantees they stood for, e.g. "silently voids the 🔴 human-approval guarantee"), `quality-model.md`, `tier-aware-pipeline.md` (five, incl. the `(AC6)` on the deploy step), `coverage-config-example.md`.
- Adding a NEW legitimate placeholder/example file requires a deliberate allowlist edit in the guard — a review-visible act, not a silent pass.

## Adoption Impact

None beyond this log — the rule lives in the KB (`skill-conventions/story-local-markers.md` + its README index row) and the guard; no `adoption/tech/*` file catalogs conformance suites.
