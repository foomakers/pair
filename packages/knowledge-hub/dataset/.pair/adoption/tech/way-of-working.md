# 🤝 Way of Working

## Purpose

This document defines the **validated development practices and team workflows** for the project. It serves as the authoritative specification for all development methodologies, code review processes, and collaboration patterns that have been proposed by AI and validated by the development team throughout all phases outlined in the [way-of-working.md](../../knowledge/way-of-working.md).

**Who modifies this:** Development team with AI assistance during process optimization and workflow refinement
**When:** During all phases - Strategic Preparation, Sprint Execution, and continuous process improvement
**Authority:** All development activities must follow these validated practices

## Quality Gates

- `pnpm quality-gate` is the adopted project-level quality gate command.
- Quality gate includes: type checking (`ts:check`), testing (`test`), linting (`lint`), formatting (`prettier:fix`).
- **Hook manager**: `husky` (KB default, decision D21/Q11) — pre-commit runs fast local checks, pre-push runs lint. Override here if the project uses a different hook manager (e.g. `lefthook`, `simple-git-hooks`); `/pair-capability-setup-gates` reads this override before provisioning.
- **Pre-merge tiering**: `disabled` (default) — every PR runs the full pre-merge check suite. Set to `enabled` to opt into risk-tier-scoped pre-merge checks (lighter checks on lower-risk PRs) per [tier-aware-pipeline.md](../../knowledge/guidelines/infrastructure/cicd-strategy/tier-aware-pipeline.md); `/pair-capability-setup-gates` reads this flag before generating the pipeline.
- **Shared config packages**: see [shared-config-packages.md](../../knowledge/guidelines/code-design/quality-standards/shared-config-packages.md) for the lint/format/type-config pattern and per-type override structure.

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

## State Mapping

Optional. Skills resolve item state to 5 canonical macrostates — `Draft`, `Ready`, `In Progress`, `Review`, `Done` — through this section. **Omitted by default**: pair assumes your board already uses canonical names, so nothing needs to be configured here. Add a `Board State → Macrostate` table only if your board uses different names — mapping is n-m (many board states may map to one macrostate, never the inverse). See [canonical-states.md](../../knowledge/guidelines/collaboration/project-management-tool/canonical-states.md) for the full schema, semantics, and examples (default, GitHub Projects, minimal board, custom n-m).
