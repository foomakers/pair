# 🤝 Way of Working

## Purpose

This document defines the **validated development practices and team workflows** for the project. It serves as the authoritative specification for all development methodologies, code review processes, and collaboration patterns that have been proposed by AI and validated by the development team throughout all phases outlined in the [way-of-working.md](../../knowledge/way-of-working.md).

**Who modifies this:** Development team with AI assistance during process optimization and workflow refinement
**When:** During all phases - Strategic Preparation, Sprint Execution, and continuous process improvement
**Authority:** All development activities must follow these validated practices

## Quality Gates

- `pnpm quality-gate` is the adopted project-level quality gate command.
- Quality gate includes: type checking (`ts:check`), testing (`test`), linting (`lint`), formatting (`prettier:fix`).

### Custom Gate Registry

Custom gates run **after** the standard gates (Lint, Type Check, Test). Add rows to extend the quality pipeline.

| Order | Gate       | Command             | Scope Key  | Required | Description                  |
| ----- | ---------- | ------------------- | ---------- | -------- | ---------------------------- |
| 1     | Formatting | `pnpm prettier:fix` | formatting | No       | Prettier auto-fix and verify |

## Merge Strategy

- **Method**: `squash` — all feature branch commits are squashed into a single commit on merge.
- **Commit format**: follows the [commit template](../../knowledge/guidelines/collaboration/templates/commit-template.md).
- **Branch cleanup**: feature branches are deleted after merge.
- **Merge confirmation**: `prompt` — `/review` asks developer before merging. Set to `silent` to skip confirmation after recording preference via `/record-decision`.
