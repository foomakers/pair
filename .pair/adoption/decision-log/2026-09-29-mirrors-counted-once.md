# Decision: Mirrored files are counted once

## Date

2026-09-29

## Status

Active

## Category

Process Decision

## Context

`packages/knowledge-hub/dataset/**` is the canonical source; `pnpm mirrors:regenerate` writes generated copies into `.claude/**` (skills, workflows, agents), `.pair/knowledge/**` and `.github/agents/**` — plain copies for `.claude/workflows` and `.claude/agents`, copies with skill references rewritten (e.g. `/record-decision` → `/pair-capability-record-decision`) for `.claude/skills`, `.pair/knowledge` and `.github/agents`. A PR that changes a skill or a workflow script therefore shows the same change twice. On PR #517 the analysis counted 148 added tests, 55 of them the `.claude` copy of a dataset test: the doubled numbers made the PR look larger and riskier than it is and skewed the review's diff-risk reading.

## Decision

- Code review (classification footprint included), the PR body and the PR analysis count a **mirror copy** of a changed canonical file **zero times**: files, lines, tests and code blocks are counted on the canonical `dataset` file only.
- A mirror copy is excluded when its canonical counterpart changed in the same diff **and** it equals what the regenerator produces from it — checked on the head by `pnpm mirrors:regenerate` leaving the tree unchanged (and `pnpm skills:conformance` passing); byte-identity (`cmp`) is the check only for `.claude/workflows` and `.claude/agents`, which are not transformed.
- The excluded mirrors are reported once, as a single line (`mirrors regenerated: N files, match the regenerator`), never in the per-workspace counts.
- A mirror-side file with no canonical counterpart is **counted** and listed as *mirror-only* (e.g. `.claude/workflows/pair-contracts/cycle-coordinator.test.mjs`, settings files); a copy that differs from what the regenerator produces is **counted** and flagged as *drift*.

## Alternatives Considered

- **Count everything, as git reports it.** Rejected: it doubles every skill/workflow change and misstates size and risk.
- **Exclude `.claude/**` wholesale.** Rejected: files that live only under `.claude/` would disappear from the review.

## Consequences

- Positive: counts reflect the work actually done; reviews and analyses stay comparable across PRs.
- Negative: the reviewer must run the regenerator check before excluding a mirror copy; a skipped check can hide drift.
