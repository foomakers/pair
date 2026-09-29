# Decision: Mirrored files are counted once

## Date

2026-09-29

## Status

Active

## Category

Process Decision

## Context

`packages/knowledge-hub/dataset/**` is the canonical source; `pnpm mirrors:regenerate` writes byte-identical copies into `.claude/**` (skills, workflows, agents), `.pair/knowledge/**` and `.github/agents/**`. A PR that changes a skill or a workflow script therefore shows the same change twice. On PR #517 the analysis counted 148 added tests, 55 of them the `.claude` copy of a dataset test: the doubled numbers made the PR look larger and riskier than it is and skewed the review's diff-risk reading.

## Decision

- Code review (classification footprint included), the PR body and the PR analysis count a **mirror copy** of a changed canonical file **zero times**: files, lines, tests and code blocks are counted on the canonical `dataset` file only.
- A mirror path is reported once, as a single line (`mirrors regenerated: N files, byte-identical`), never in the per-workspace counts.
- A change **only** on the mirror side (no canonical counterpart in the same diff, or a copy that is not byte-identical) is **counted** and flagged: it is either a file that exists only there (e.g. `.claude/workflows/pair-contracts/cycle-coordinator.test.mjs`) or mirror drift.

## Alternatives Considered

- **Count everything, as git reports it.** Rejected: it doubles every skill/workflow change and misstates size and risk.
- **Exclude `.claude/**` wholesale.** Rejected: files that live only under `.claude/` would disappear from the review.

## Consequences

- Positive: counts reflect the work actually done; reviews and analyses stay comparable across PRs.
- Negative: the reviewer must check byte-identity (`cmp`) before excluding a mirror copy; a skipped check can hide drift.
