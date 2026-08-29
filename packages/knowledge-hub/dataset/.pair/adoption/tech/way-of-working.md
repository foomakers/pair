# 🤝 Way of Working

## Purpose

This document defines the **validated development practices and team workflows** for the project. It serves as the authoritative specification for all development methodologies, code review processes, and collaboration patterns that have been proposed by AI and validated by the development team throughout all phases outlined in the [way-of-working.md](../../knowledge/way-of-working.md).

**Who modifies this:** Development team with AI assistance during process optimization and workflow refinement
**When:** During all phases - Strategic Preparation, Sprint Execution, and continuous process improvement
**Authority:** All development activities must follow these validated practices

## Quality Gates

- `pnpm quality-gate` is the adopted project-level quality gate command.
- Quality gate includes: type checking (`ts:check`), testing (`test`), linting (`lint`), formatting **checked, never written** (`format:check`). The reason is worth keeping when you adapt this file, **and so is its condition**: where the gate runs at **pre-push** — as it does with the hook layout below — the commits already exist, so a write-mode formatter rewrites the working tree without touching what is being pushed and only pollutes the next diff. If instead you fix staged files at **pre-commit** (lint-staged and friends), the write lands in the commit being created and that objection does not apply; adjust this line to what your hooks actually do. Either way **no step reachable from the gate writes files**, and formatting is applied deliberately as a commit (`pnpm format`, or your project's equivalent). `format:check` and `format` are **your** scripts to provide — no install step creates them, and a missing one fails as a missing script, not as a formatting violation. Record the decision in your own decision log.
- **Hook manager**: `husky` (KB default, decision D21/Q11) — pre-commit runs fast local checks, pre-push runs lint. Override here if the project uses a different hook manager (e.g. `lefthook`, `simple-git-hooks`); `/pair-capability-setup-gates` reads this override before provisioning.
- **Pre-merge tiering**: `disabled` (default) — every PR runs the full pre-merge check suite. Set to `enabled` to opt into risk-tier-scoped pre-merge checks (lighter checks on lower-risk PRs) per [tier-aware-pipeline.md](../../knowledge/guidelines/infrastructure/cicd-strategy/tier-aware-pipeline.md); `/pair-capability-setup-gates` reads this flag before generating the pipeline.
- **Review enforcement**: `disabled` (default) — the pair review **runs and publishes its verdict**, but nothing it says blocks a merge: `pair-review` and `pair-explicit-approval` are not required status checks, and the 🔴 explicit-approval rule is advisory. Set to `enabled` to make them required and the rule binding, per [pr-states.md](../../knowledge/guidelines/collaboration/project-management-tool/pr-states.md); `/pair-capability-setup-gates` reads this flag before touching branch protection, and `/pair-process-bootstrap` asks for it when no decision exists. Disabled is the default deliberately: a review that blocks by default turns a first install into a repository nobody can merge into — on a single-maintainer repo the 🔴 non-author approval is unobtainable outright. The tier requirements themselves (reviewer count, SLA, checklist depth, whether 🔴 needs explicit approval) are redefinable in this file; that the review **runs** is not.
- **Coverage guardrail**: `disabled` (default) — no coverage regression job. Set to `enabled` to opt into a job that blocks a PR whose coverage drops below a human-committed baseline (maintaining/improving passes — not an absolute wall); this also creates `tech/coverage-baseline.md`. See [coverage guardrail](../../knowledge/guidelines/infrastructure/cicd-strategy/tier-aware-pipeline.md#coverage-guardrail-opt-in-regression-gate-consumed-by-this-pipeline) + [config format](../../knowledge/assets/coverage-config-example.md); `/pair-capability-setup-gates` reads this flag before generating the pipeline.
- **Pair review required checks**: `pair-review` + `pair-explicit-approval` are the required status checks that make the review unskippable (R5.7) and enforce the 🔴 explicit-human-approval rule (D10). Not a flag: they are wired by `/pair-capability-setup-gates` in both pipeline modes. Status: [applied | not yet applied] — writing branch protection needs admin scope, so it is a deliberate human step; until applied, enforcement is advisory (the documented degraded mode). Ordering matters: provision the `pr-state:*` labels and the `pair-explicit-approval` workflow, confirm both contexts report on a real PR **and that the approval context re-reports on the same head SHA after a review submission**, and only then apply the protection — otherwise a never-reporting (or base-branch-reporting) required context blocks every merge, before or after the human approves. The steps live in [github-implementation.md](../../knowledge/guidelines/collaboration/project-management-tool/github-implementation.md) § Ordering (the model is in [pr-states.md](../../knowledge/guidelines/collaboration/project-management-tool/pr-states.md)); a host without a required-check API degrades to advisory enforcement and the gap is recorded here.
- **Shared config packages**: see [shared-config-packages.md](../../knowledge/guidelines/code-design/quality-standards/shared-config-packages.md) for the lint/format/type-config pattern and per-type override structure.

### Review Tier Matrix — overridable here

The per-tier requirements (reviewer count, SLA, checklist depth, whether 🔴 needs explicit approval) are **KB defaults**, resolved through the `Argument > Adoption > KB default` cascade. The defaults live in `quality-model.md` § *Per-Tier Requirements`; this file is where a project changes them.

**No override in force.** Nothing is transcribed below on purpose: a copy of the defaults sitting here would be a second copy of the same truth with nothing comparing the two — and because Adoption wins over KB default, a stale copy would silently override an improved default. Absent an override, the KB defaults are what apply.

**To override**, add the keys you are changing — the shape the KB documents:

```yaml
# tier.red.reviewers: 2
# tier.red.sla_days: 3
```

**And when you do, write the effective matrix here too**, as a table: once the values diverge from the defaults, the ones in force must be visible where they are decided, not reconstructed by a reader diffing two files. The rule is deliberate in both directions — identical means absent, different means written out.

The "Merge" column only bites when `Review enforcement` is `enabled` (above). Disabled — the default — the review runs and reports, and none of these requirements block a merge.

### Custom Gate Registry

Custom gates run **after** the standard gates (Lint, Type Check, Test). Add rows to extend the quality pipeline.

| Order | Gate       | Command             | Scope Key  | Required | Description |
| ----- | ---------- | ------------------- | ---------- | -------- | ----------- |
| 1     | Formatting | `pnpm format:check` | formatting | Yes      | Blocking check. `No` (advisory) was coherent only while this row ran an auto-fixer: a check that neither fixes nor blocks leaves the violation in the push. Provide the script (or point the cell at your project's equivalent). |

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

## Process Profile

Optional. **Which process steps this project runs.** **Omitted by default**: pair assumes the full process, so a team that runs everything configures nothing here and behaves exactly as before this section existed (convention over configuration, D21). The schema, the built-in profiles and the step ids live in the KB — [process-profiles.md](../../knowledge/guidelines/technical-standards/ai-development/process-profiles.md) and the [step catalogue](../../knowledge/guidelines/technical-standards/ai-development/step-catalogue.md) — this section only names the choice.

| Field       | Default     | Meaning                                                                                                       |
| ----------- | ----------- | --------------------------------------------------------------------------------------------------------------- |
| `profile`   | `default`   | `default` (every step), `poc` (no DDD mapping, no strategic planning layer) or `custom`.                        |
| `whitelist` | *(none)*    | The enabled step ids. **Required with `custom`; invalid with `default` or `poc`**, which carry their own sets.  |

- **Omitted ⇒ `default`.** Absence is a declaration, not a gap: the whole process applies.
- The profile governs the **step**, not one of its representations — so a project with **no skills installed**, following the how-to guides by hand, is governed identically.
- A **disabled** step is never proposed by `/next`; invoked directly it warns and asks for confirmation; reached as a composition it is skipped exactly like a skill that is not installed. See [process-profile gate](../../knowledge/guidelines/technical-standards/ai-development/skill-conventions/process-profile-gate.md).
- An unknown profile name, an unknown step id and an **empty** whitelist all **HALT** — a typo must never silently disable a step, and an empty whitelist is a misconfiguration, not "everything disabled".
- Each key is **one line, however long**: a value wrapped onto a second line **HALTs** rather than being read up to the wrap (the ids after it would vanish from every suggestion with nothing reported). If a line-length lint rule objects, exempt the line — do not wrap it.
- Naming the same step id **twice** in one whitelist **HALTs** as well: it is never deduped in silence, since a repeat is as likely an unfinished edit as a harmless one.
- **Declare, don't quote.** A key is a plain list item at the top level of this section. On a **blockquote** line (one opening with `>`, even carrying an otherwise perfect key) it **HALTs**, and so does a key on a numbered marker (`1. profile: poc`) whether or not it is backticked — two author errors on one line compose, they do not cancel — that is a decorated declaration, not a quotation. Inside the **table above** it is neither read nor reported: a table row documents the keys, and documentation is never configuration.
- **The key is read case-insensitively, the value is not.** `` - `Profile`: `poc` `` and `` - `Whitelist`: … `` declare exactly what their lowercase spellings do (the `Field` column above is Title Case, so mirroring it is a natural edit); a value in another case — `` `POC` `` — **HALTs** as an unknown profile name.

Example — a proof-of-concept team:

```text
- `profile`: `poc`
```

Example — a `custom` subset (delivery only, planning done elsewhere):

```text
- `profile`: `custom`
- `whitelist`: `brainstorm`, `plan-stories`, `refine-story`, `plan-tasks`, `implement`, `review`
```

## State Mapping

Optional. Skills resolve item state to 5 canonical macrostates — `Draft`, `Ready`, `In Progress`, `Review`, `Done` — through this section. **Omitted by default**: pair assumes your board already uses canonical names, so nothing needs to be configured here. Add a `Board State → Macrostate` table only if your board uses different names — mapping is n-m (many board states may map to one macrostate, never the inverse). See [canonical-states.md](../../knowledge/guidelines/collaboration/project-management-tool/canonical-states.md) for the full schema, semantics, and examples (default, GitHub Projects, minimal board, custom n-m).

## Assignment

Optional. **Who** items and pull requests are assigned to. **Omitted by default** — but omitting it has a cost worth knowing before you do: most boards are read **filtered by assignee**, so an item nobody is assigned is **invisible in an assignee-filtered view** even while it is open, green and carrying a PR. Skills never guess a default from the authenticated user (an agent running under a bot token would assign everything to the bot), so with nothing declared here they file items and PRs unassigned and warn.

| Field                | Default                | Meaning                                                                                                    |
| -------------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------ |
| `default-assignee`   | *(none)*               | The identifier an item or PR is assigned to when the caller passes none.                                     |
| `code-host-assignee` | *(`default-assignee`)* | Only when the code host knows the same person by a different identifier than the PM tool (split configuration). Read for **pull request** assignment; items keep using `default-assignee`. |

Example:

```text
- `default-assignee`: `jane-doe`
```

The resolution order (`$assignee` argument → the adoption default for the side being written, `code-host-assignee` then `default-assignee` on a pull request → none + warning), the split-tool routing, and why the fallback is never the authenticated user live in [way-of-working / PM-tool + code-host resolution](../../knowledge/guidelines/technical-standards/ai-development/skill-conventions/way-of-working-pm-resolution.md#assignee-resolution).
