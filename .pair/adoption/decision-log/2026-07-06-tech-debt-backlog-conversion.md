# Decision: Convert #199 audit findings into tracked tech-debt backlog items

## Date

2026-07-06

## Status

Active

## Category

Process Decision (non-architectural)

## Context

[#199](https://github.com/foomakers/pair/issues/199) is a static, one-time codebase audit (13 findings: P0.1–P0.5, P1.1–P1.4, P2.1–P2.4, plus 2 narrative "cluster" observations). [#224](https://github.com/foomakers/pair/issues/224) requires converting it into a living, prioritized backlog (R7.2) instead of a static document, and extending `/pair-capability-assess-debt` with a `$mode: scan` so future debt is caught continuously (source: `packages/knowledge-hub/dataset/.skills/capability/assess-debt/SKILL.md`).

**Priority formula applied** (existing assess-debt Step 3: `Impact × (6 − Effort)`, Severity → Priority mapping High→P1/Medium→P2/Low→P3):

| Finding | Impact | Effort | Score | Severity | Priority |
| ------- | :----: | :----: | :---: | -------- | :------: |
| P0.1 — CI silent-failure masking (`\|\| echo` in `ci.yml`) | 4 | 1 | 20 | High | P1 |
| P0.2 — Workspace catalog drift (`content-ops/package.json`) | 3 | 1 | 15 | High | P1 |
| P1.1 — Silent test failures (`knowledge-hub/package.json`) | 3 | 1 | 15 | High | P1 |
| P0.3 — Monster test file `cli.e2e.test.ts` (1507 LOC) | 3 | 2 | 12 | Medium | P2 |
| P0.4 — `LinkProcessor` static-class antipattern | 4 | 3 | 12 | Medium | P2 |
| P1.2 — Missing coverage gates (website, brand) | 2 | 1 | 10 | Medium | P2 |
| P1.4 — Baseline coverage not persisted | 2 | 2 | 8 | Medium | P2 |
| P2.3 — `in-memory-fs.ts` god-file (429 LOC) | 2 | 2 | 8 | Medium | P2 |
| P2.4 — Duplication scanner (`jscpd`) not wired | 2 | 2 | 8 | Medium | P2 |
| P0.5 — `copyPathOps.ts` god-module (705 LOC) | 4 | 4 | 8 | Medium | P2 |
| P1.3 — `MoveCtx` non-null assertions | 2 | 3 | 6 | Low | P3 |
| P2.2 — `packages/brand/dev/App.tsx` (456 LOC) | 1 | 2 | 4 | Low | P3 |
| ~~P2.1 — Residual `:any` in `kb-verify/metadata.ts`~~ | — | — | — | — | **skipped** |

**Edge case triggered**: P2.1 re-verified against current `main` (2026-07-06) — `grep -rn ": any\b"` across `apps/`, `packages/` (excluding tests) returns zero matches in `kb-verify/metadata.ts`. Already fixed since the audit. Skipped per AC edge case, not converted.

Two narrative "cluster" observations in #199 (`packages/content-ops/src/ops/` cluster; "silent failure" infra cluster) are commentary grouping existing P0/P1 items above — not independently converted, to avoid double-counting.

**Result**: 12/13 findings converted (P1: 3, P2: 7, P3: 2), 1/13 skipped as already-fixed = 100% of findings resolved (converted or explicitly skipped), satisfying AC1.

## Decision

1. Each of the 12 open findings becomes a standalone `task`-type issue via `/pair-capability-write-issue`, labeled `tech-debt` (label added alongside the type label — required a small extension to `write-issue`'s `$content.labels` support, see Consequences), with the Priority board field set per the table above and no explicit board status (defaults to Todo — informal "Draft" per the story's language, since this project's board has no separate "Draft" state).
2. `/pair-capability-assess-debt` gains `$mode: scan` (grep for TODO/FIXME/HACK/WORKAROUND + do/don't rule violations from [#223](https://github.com/foomakers/pair/issues/223)), keyed on `<file>:<line>:<pattern>` for idempotency, grouped by file/module before item creation to avoid flood. Composes `/pair-capability-write-issue` the same way.
3. `/pair-process-review` (Phase 4, Step 4.3) creates a `tech-debt` item for debt introduced by a reviewed PR — and, per R7.2, this **never** blocks the PR (fixed a pre-existing contradiction in `assess-debt`'s composition notes that said critical debt could "inform CHANGES-REQUESTED").
4. Single source of truth = the backlog. Once the 12 items exist, #199 should be closed with a comment linking all created items (per the story's confirmed refinement insight).
5. **Not executed in this session**: actual creation of the 12 GitHub issues, and closing/commenting on #199. This implementation session operates under a read-only-on-PM-tool constraint (local-only branch, no `gh issue create`/`close`/comment). The table above is the dry-run output `/pair-capability-write-issue` would consume; a follow-up session with PM write access executes the "then write" half of T1 and T4 verbatim from this table.

## Alternatives Considered

- **Leave #199 open as the permanent tracking doc**: Rejected — static, not prioritized against new debt found by scan/review, exactly the problem R7.2 exists to solve.
- **Convert findings as `story`-type issues**: Rejected — findings are remediation work, not user-facing stories with Given-When-Then ACs; `task` type (standalone, not the story-inline usage `/pair-process-plan-tasks` uses) fits the lighter-weight shape and its template's optional-section omission already supports a lean body.
- **New dedicated `$type: debt` in `write-issue`**: Rejected for now — would require a new template file; reusing `task` + a `tech-debt` label meets AC1/AC2 with a smaller footprint. Revisit if debt items need fields the task template can't express.
- **Reuse P0/P1/P2 language from #199 verbatim as the item priority**: Rejected — AC1 requires priority "from the impact × effort formula," not the audit's informal grouping; recomputing surfaced one reclassification (P0.3/P0.4/P0.5 drop from the audit's "P0" framing to Priority P2 once effort is scored) and confirmed P1.1 deserves the same P1 treatment as P0.1/P0.2 (same silent-failure cluster).

## Consequences

- `write-issue` needed a small, backward-compatible extension (`$content.labels`) to attach `tech-debt` alongside the type-based label — no template changes required.
- The GitHub Projects Priority custom field needs a 4th option (P3) — documented in `github-implementation.md`; only P0–P2 existed before. Live board field configuration (adding the option in the actual GitHub UI) is a manual follow-up, not automatable from this repo.
- `assess-debt`'s composition notes previously allowed critical debt to influence CHANGES-REQUESTED — corrected to be unconditionally non-blocking, closing a real inconsistency with R7.2.
- #199 stays open until a PM-write-capable session executes step 5 above.

## Adoption Impact

- `adoption/tech/way-of-working.md`: add a short "Technical Debt Tracking" note — audit findings become `tech-debt`-labeled backlog items (this decision); static audit docs are closed once conversion completes, linking to the created items.
- `packages/knowledge-hub/dataset/.pair/knowledge/guidelines/collaboration/project-management-tool/github-implementation.md` (dataset — mirrored at `.pair/knowledge/...` in this repo): Priority custom field gains P3.
- No changes to `adoption/tech/tech-stack.md` or `architecture.md` — this is a process/skill-behavior decision, not a library or architectural choice.
