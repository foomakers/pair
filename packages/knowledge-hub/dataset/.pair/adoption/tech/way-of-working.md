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
- **Coverage guardrail**: `disabled` (default) — no coverage regression job. Set to `enabled` to opt into a job that blocks a PR whose coverage drops below a human-committed baseline (maintaining/improving passes — not an absolute wall); this also creates `tech/coverage-baseline.md`. See [coverage guardrail](../../knowledge/guidelines/infrastructure/cicd-strategy/tier-aware-pipeline.md#coverage-guardrail-opt-in-regression-gate-consumed-by-this-pipeline) + [config format](../../knowledge/assets/coverage-config-example.md); `/pair-capability-setup-gates` reads this flag before generating the pipeline.
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

## Git Workflow

Optional. Where the **code** lives and where a branch starts — the counterpart to the PM-tool declaration above, and the section every PR/branch operation reads. (Its sibling `## Merge Strategy` above owns how a PR *ends*: merge method, commit format, cleanup. The two are deliberately separate sections; `/publish-pr` reads both.) **Omitted by default**: pair assumes the code host is the same tool as the PM tool, so a single-tool project configures nothing here (convention over configuration, D21).

**Required when the PM tool hosts no code.** `linear`, `jira` and `filesystem` track items but own no repositories, branches or pull requests, so there is nothing for an omitted `code-host` to fall back to — declare it, or every PR operation HALTs with a setup pointer. `github-projects`, `azure-devops` and other repository-hosting trackers need nothing. **Existing project on one of those trackers?** Declare `code-host` once (or re-run `/setup-pm`, which backfills it) — a one-time upgrade step, after which nothing else changes.

| Field         | Default         | Meaning                                                                                                    |
| ------------- | --------------- | ---------------------------------------------------------------------------------------------------------- |
| `code-host`   | *(the PM tool)* | The tool hosting repositories, branches and pull requests. Declare it **only** when it differs from the PM tool — which includes every case where the PM tool hosts no code at all (`linear`, `jira`, `filesystem`). |
| `base-branch` | `main`          | The branch pull requests target and feature branches are cut from.                                          |

- **`code-host` omitted ⇒ code host = PM tool.** Behavior is identical to a single-tool project — nothing to configure, nothing to migrate.
- **The same tool named in both places is treated exactly as omitted** — single-tool, no dual-write. Sameness is per **product**, not per spelling: `github` ≡ `github-projects`, `azure-devops` ≡ `azure-repos` (canonical alias list in the resolution convention below), so the schema's two vocabularies never accidentally read as a split.
- Skills never assume the two coincide: issue/state operations route to the PM tool, PR/review operations route to `code-host`. The routing rule lives in one place — see [way-of-working / PM-tool + code-host resolution](../../knowledge/guidelines/technical-standards/ai-development/skill-conventions/way-of-working-pm-resolution.md), including the `Refs: <issue-id>` cross-linking convention that keeps the two tools linked without any native integration.

Example — split configuration (Linear for the backlog, GitHub for the code):

```text
- Linear is adopted for project management. Team: `ENG`. Access: Linear MCP Server.
  See `.pair/knowledge/guidelines/collaboration/project-management-tool/linear-implementation.md` for usage.
- `code-host`: `github` — repository `acme/platform`, access via `gh` CLI / GitHub MCP.
- `base-branch`: `main`.
```

## State Mapping

Optional. Skills resolve item state to 5 canonical macrostates — `Draft`, `Ready`, `In Progress`, `Review`, `Done` — through this section. **Omitted by default**: pair assumes your board already uses canonical names, so nothing needs to be configured here. Add a `Board State → Macrostate` table only if your board uses different names — mapping is n-m (many board states may map to one macrostate, never the inverse). See [canonical-states.md](../../knowledge/guidelines/collaboration/project-management-tool/canonical-states.md) for the full schema, semantics, and examples (default, GitHub Projects, minimal board, custom n-m).
