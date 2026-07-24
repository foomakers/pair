---
name: review
description: "Reviews a pull request through 6 sequential phases (5 review + optional merge with parent cascade) — validation, technical review, adoption compliance, completeness, decision — to decide whether it merges. Not a quick build/test sanity check (use /verify-quality). Composes /classify, /verify-quality, /verify-done, /record-decision, /analyze-debt, /assess-security (required), /verify-adoption, /assess-stack (optional)."
version: 0.7.0
author: Foomakers
---

# /review — Code Review

Review a pull request through 6 sequential phases (5 review + 1 optional merge). Each phase composes atomic skills and follows the **check → skip → act → verify** pattern for idempotent re-invocation.

## Composed Skills

| Skill                   | Type       | Required | Phase | Purpose                                      |
| ----------------------- | ---------- | -------- | ----- | -------------------------------------------- |
| `/classify`             | Capability | Yes †    | 1     | Risk matrix from the diff (confirm-or-raise) |
| `/verify-quality`       | Capability | Yes      | 2     | Quality gate checking                        |
| `/verify-done`          | Capability | Yes      | 4     | Definition of Done checking                  |
| `/record-decision`      | Capability | Yes      | Any   | Record missing ADR (HALT condition)          |
| `/analyze-debt`         | Capability | Yes      | 4     | Flag tech debt items                         |
| `/assess-security`      | Capability | Yes †    | 2     | Security posture verdict + findings (D22)    |
| `/verify-adoption`      | Capability | Optional | 3     | Full adoption compliance                     |
| `/assess-stack`         | Capability | Optional | 3     | Tech-stack resolution                        |
| `/execute-manual-tests` | Capability | Optional | 6     | Post-merge release validation (manual tests) |

† **Required _when installed_.** `/classify` and `/assess-security` carry Required = Yes because `/review` composes them by default — but both **degrade gracefully**: `/review` **warns and continues** when the skill is absent (`/classify` → Step 1.5 Skip; `/assess-security` → Step 2.4 / Graceful Degradation), never HALTing on their absence. "Required" here means _composed by default_, not _a hard prerequisite_, so the flag never contradicts the graceful-skip steps.

## Arguments

| Argument | Required | Description                                                                      |
| -------- | -------- | -------------------------------------------------------------------------------- |
| `$pr`    | Yes      | PR number or URL to review                                                       |
| `$story` | No       | Story ID for requirements validation. If omitted, extracted from PR description. |

## Session State

Maintain throughout the review:

```text
CODE REVIEW STATE:
├── PR: [#PR-NUMBER: Title]
├── Phase: [1-validation | 2-technical | 3-adoption | 4-completeness | 5-decision | 6-merge]
├── Story: [#ID: Title]
├── Review Type: [feature | bug | refactor | docs | config]
├── Issues: [critical: N | major: N | minor: N]
├── Debt Items: [N flagged]
└── Decision: [pending | APPROVED | CHANGES-REQUESTED | TECH-DEBT]
```

## Phase 1: PR Validation (BLOCKING)

### Step 1.1: Load PR Context

1. **Check**: Is the PR already loaded in this session?
2. **Skip**: If yes, confirm PR number and move to Step 1.2.
3. **Act**: Read PR from the PM tool — resolution: see [way-of-working / PM-tool resolution](../../../.pair/knowledge/guidelines/technical-standards/ai-development/skill-conventions/way-of-working-pm-resolution.md):
   - PR metadata (author, branch, target, status)
   - Changed files and diff
   - PR description and linked story
4. **Verify**: PR loaded and open. If not → **HALT**.

### Step 1.2: Load Story Context

1. **Check**: Is the story already loaded?
2. **Skip**: If yes, move to Step 1.3.
3. **Act**: Extract story ID from PR description or `$story` argument. Read story from PM tool:
   - Acceptance criteria
   - Task breakdown and completion claims
   - Epic context
4. **Verify**: Story loaded with AC. If story not found, warn and proceed with PR-only review.

### Step 1.3: Classify Review Type

1. **Check**: Can the review type be determined from PR labels or story type?
2. **Act**: Classify as `feature`, `bug`, `refactor`, `docs`, or `config` based on:
   - PR labels and title prefix
   - Story type
   - Changed file patterns (e.g., only .md files → docs)
3. **Verify**: Review type set. Determines which validation steps apply.

### Step 1.4: Confirm with Reviewer

Present analysis:

```text
REVIEW READY:
├── PR: [#NUMBER: Title]
├── Author: [name]
├── Story: [#ID: Title | N/A]
├── Type: [feature | bug | refactor | docs | config]
├── Files Changed: [N files, +X/-Y lines]
└── AC: [N criteria to validate]
```

Ask: _"Proceed with review?"_

### Step 1.5: Classification (risk matrix from the diff)

1. **Check**: Has `/classify` already run with `$context: review` on the current PR head commit?
2. **Skip**: If already run — reuse the matrix + tier, move to Phase 2. If `/classify` is not installed → warn (`/classify not installed — no review-time risk matrix`) and move to Phase 2.
3. **Act**: Compose `/classify` with `$context: review` against the PR diff. It applies the [quality model](../../../.pair/knowledge/guidelines/quality-assurance/quality-model.md) to the diff footprint, reads the story's refinement-time tier, and produces the review matrix as a **floor** — it confirms or **raises** the tier, and **never lowers** it (D17). The Security relevance and Coupling balance dimensions are reconciled in Phase 2 (Step 2.4) as `/assess-security` / `/assess-coupling` verdicts land — raise-only.
4. **Verify**: The review matrix + `risk:*` tier are recorded on the PR (matrix in the body as 1 line + `<details>`, D22; tags applied only when a `## Tag Projection` is declared). This body matrix is the single rendered artifact — if Phase 2 raises Security relevance or Coupling balance, `/review` updates it **in place** (Step 2.4), it is not re-emitted by `/classify`. A raise to `risk:red` is carried into the Step 5.2 decision. `/classify` HALTs only if the quality model doc (#221) is absent.

## Phase 2: Technical Review

### Step 2.1: Quality Gates

1. **Check**: Has `/verify-quality` already run on the current PR head commit?
2. **Skip**: If all gates passing on current commit — record results, move to Step 2.2.
3. **Act**: Compose `/verify-quality` with `$scope = all`.
4. **Verify**: Record quality gate results. Failures become review findings (do not HALT — /review reports them).

### Step 2.2: Code Quality Assessment

1. **Check**: Have code quality issues already been identified in this session?
2. **Skip**: If already assessed — move to Step 2.3.
3. **Act**: Review changed files against:
   - [Design Rules](../../../.pair/knowledge/guidelines/code-design/design-principles/design-rules.md) — do/don't patterns (DR-1, DR-2, ...). A diff **clearly** matching a rule's recognition criteria is a **violation** — cite the rule ID (e.g. "DR-1 — God Module") in the finding, not a generic "improve structure" comment. A **partial or ambiguous** match is a **suggestion**, not a violation — do not count it toward the review decision.
   - [Code design guidelines](../../../.pair/knowledge/guidelines/code-design/README.md) — readability, maintainability, naming
   - [Technical standards](../../../.pair/knowledge/guidelines/technical-standards/README.md) — patterns, conventions
   - Review type-specific concerns (e.g., behavior preservation for refactors, regression tests for bugs)
4. **Verify**: Issues catalogued by severity (critical / major / minor), with rule ID referenced where a Design Rule applies.

### Step 2.3: Architecture & ADR Compliance

1. **Check**: Does the PR introduce new technical decisions (libraries, patterns, technologies)?
2. **Skip**: If no new decisions detected — move to Step 2.4.
3. **Act**: For each new decision, verify:
   - ADR exists in `adoption/tech/adr/`
   - [tech-stack.md](../../../.pair/adoption/tech/tech-stack.md) updated
   - Version consistency across workspaces
4. **Verify**: All decisions documented. **Missing ADR → HALT**:
   - Compose `/record-decision` with `$type = architectural` and `$topic` describing the gap.
   - Set review status to CHANGES-REQUESTED until ADR is created.
   - Resume review after ADR is added.

### Step 2.4: Security Assessment

1. **Check**: Has `/assess-security` already run with `$mode: review` on the current PR head commit?
2. **Skip**: If already run — reuse the verdict + findings, move to Phase 3.
3. **Act**: Compose `/assess-security` with `$mode: review` against the PR diff. It resolves the rule set (KB global + per-service + per-web-app + adoption project rules) and returns a 1-line verdict + collapsed findings, each tagged **introduced** or **pre-existing**.
4. **Verify**: Verdict + findings recorded — feeds the Security Review section (Step 5.1) and the **Security relevance** dimension of the Step 1.5 classification matrix (`/classify` folds this verdict in **raise-only** — it may raise the tier, never lower it). **Body re-render**: when the verdict raises Security relevance (or the Coupling verdict raises Coupling balance), `/review` updates the already-written Step 1.5 body matrix **in place** — re-rendering the affected `<details>` row and the 1-line `risk:*` tier so the PR body reflects the final, raised tier; `/classify` is **not** re-invoked (its Phase-1 run stands, and a raise-only edit needs no recompute). **Tag re-apply**: when a `## Tag Projection` is declared (e.g. `Active: risk`), this in-place Phase-2-originated raise **also re-applies the projected chromatic tag on the PR** — swapping the stale label for the raised tier (e.g. `risk:yellow` → `risk:red`) via the same §5 projection `/classify` uses in its Step 5, applied here by `/review` on the raise-only edit — so the PR label matches the raised body tier (AC3); when no projection is declared, only the body matrix is updated and no label is touched. If any **introduced** finding is red → flag explicitly: this is the AC4 signal that drives the CHANGES-REQUESTED decision in Step 5.2. Does not itself HALT — `/assess-security` has no merge authority, this skill's own decision step does.

## Phase 3: Adoption Compliance

This phase uses a **4-level graceful degradation cascade** depending on which optional skills are installed:

| Level | /verify-adoption | /assess-stack | Behavior                                                   |
| ----- | ---------------- | ------------- | ---------------------------------------------------------- |
| 1     | Installed        | Installed     | Full adoption compliance + automatic tech-stack resolution |
| 2     | Installed        | Not installed | Full compliance detection, manual stack resolution         |
| 3     | Not installed    | Installed     | Inline tech-stack check only + automatic resolution        |
| 4     | Not installed    | Not installed | Warn developer for manual verification                     |

### Step 3.1: Determine Degradation Level

1. **Check**: Is `/verify-adoption` installed? Is `/assess-stack` installed?
2. **Act**: Set the degradation level (1–4) based on availability.
3. **Verify**: Level set. Proceed with the corresponding behavior.

### Step 3.2: Run Adoption Check

Run the procedure for the level determined in Step 3.1 — see [degradation-levels.md](degradation-levels.md) for the exact steps of each of the 4 levels.

### Step 3.3: Verify Adoption Results

1. **Check**: Are there unresolved non-conformities?
2. **Skip**: If all resolved or Level 4 (warned) — move to Phase 4.
3. **Act**: Unresolved tech-stack items become review findings. Unresolved architectural gaps are HALT conditions.
4. **Verify**: All items resolved or catalogued as findings.

## Phase 4: Completeness Check

### Step 4.1: Definition of Done

1. **Check**: Has `/verify-done` already run in this session?
2. **Skip**: If already run on current commit — reuse results, move to Step 4.2.
3. **Act**: Compose `/verify-done` with `$scope = all` and `$story` (if available).
4. **Verify**: Record DoD results. Failing criteria become review findings. HALT conditions (missing ADR) propagate.

### Step 4.2: Tech Debt Assessment

1. **Check**: Has `/analyze-debt` already run in this session?
2. **Skip**: If already run — reuse results, move to Phase 5.
3. **Act**: Compose `/analyze-debt` with `$scope = all`. `/analyze-debt` is **output-only** — it returns a report and creates nothing.
4. **Act**: Report the debt items in the review output (Tech Debt section). Debt introduced by the PR is **surfaced, not blocked**: it does **not** HALT the review and **never** blocks the PR. Do **not** auto-create a tech-debt issue.
5. **Act**: If a debt item is worth scheduling, note it as a recommendation for **deliberate** promotion after review via `/write-issue` (with the `tech-debt` label) — a manual, selective act, never automatic.
6. **Verify**: Debt items recorded in the report. High-severity items may inform the review verdict (TECH-DEBT: approve + track separately) but never force CHANGES-REQUESTED on debt grounds alone.

## Phase 5: Review Decision

### Step 5.1: Compile Review Report

1. **Act**: Compile all findings into a review report following the [code-review-template.md](../../../.pair/knowledge/guidelines/collaboration/templates/code-review-template.md) (resolve override-first — [template resolution](../../../.pair/knowledge/guidelines/technical-standards/ai-development/skill-conventions/template-resolution.md)):
   - **Review Information**: PR number, author, reviewer, date, story, review type
   - **Review Summary**: overall assessment, key changes, business value
   - **Code Review Checklist**: functionality, code quality, technical standards (from Phase 2)
   - **Security Review**: verdict + collapsed findings from `/assess-security` (Step 2.4) — 1-line + `<details>` (D22)
   - **Testing Review**: test coverage and quality (from /verify-quality)
   - **Documentation Review**: documentation completeness (from /verify-done)
   - **Detailed Review Comments**: issues by severity, positive feedback
   - **Risk Assessment**: technical and business risks
   - **Tech Debt**: items flagged by /analyze-debt
   - **Adoption Compliance**: results from Phase 3 (with degradation level noted)

### Step 5.2: Make Review Decision

Based on compiled findings:

| Decision              | Condition                                                                                 |
| --------------------- | ----------------------------------------------------------------------------------------- |
| **APPROVED**          | No critical or major issues. All AC met. Quality gates pass.                              |
| **CHANGES-REQUESTED** | Critical issues found, missing ADRs, any **introduced** red security finding from `/assess-security` (AC4), failing tests, AC not met. |
| **TECH-DEBT**         | Only minor issues or debt items. Approve current PR, track debt separately.               |

### Step 5.3: Post Review

1. **Act**: Post the review report as a PR comment.
2. **Act**: Set PR review status using the PM tool (per [github-implementation.md](../../../.pair/knowledge/guidelines/collaboration/project-management-tool/github-implementation.md)):
   - **APPROVED / TECH-DEBT**: Submit review with `event = APPROVE`.
   - **CHANGES-REQUESTED**: Submit review with `event = REQUEST_CHANGES`.
   - MCP-first: use `pull_request_review_write` with `method = create` and appropriate `event`.
   - CLI fallback: `gh pr review <number> --approve` or `--request-changes`.
3. **Verify**: Review posted and status updated.

### Step 5.4: Determine Next Action

1. **Check**: What was the review decision?
2. **Skip**: If CHANGES-REQUESTED → output review report and stop. Author addresses findings, then re-invokes `/review`.
3. **Act**: If APPROVED or TECH-DEBT → ask reviewer:

   > PR approved. Merge now or let the author merge?
   > 1. **Merge now** — proceed to Phase 6
   > 2. **Author merges** — stop here, author re-invokes `/implement` Phase 4

4. **Verify**: If "Merge now" selected → proceed to Phase 6. Otherwise → output and stop.

## Phase 6: Merge & Close (APPROVED only, optional)

Only reached when the reviewer picked "Merge now" in Step 5.4 — see [merge-and-cascade.md](merge-and-cascade.md) for the merge-strategy, merge-commit, merge, parent-cascade, branch-cleanup, and post-merge-manual-test steps (Steps 6.1–6.6) plus the completion output.

## Output Format

At review decision (Phase 5):

```text
REVIEW COMPLETE:
├── PR:         [#NUMBER: Title]
├── Story:      [#ID: Title | N/A]
├── Decision:   [APPROVED | CHANGES-REQUESTED | TECH-DEBT]
├── Issues:     [critical: N | major: N | minor: N]
├── Security:   [green | yellow | red — N findings, N introduced | N/A — not installed]
├── Quality:    [PASS | FAIL — N gates]
├── DoD:        [N/N criteria met]
├── Adoption:   [Level N — summary]
├── Debt:       [N items flagged]
└── Report:     [Posted as PR comment]
```

At merge (Phase 6): see [merge-and-cascade.md](merge-and-cascade.md).

## HALT Conditions

Review stops immediately when:

- **PR not found or not open** (Phase 1)
- **Missing ADR for new technical decision** (Phase 2, Step 2.3) — compose `/record-decision`, then resume
- **Unresolved architectural non-conformity** (Phase 3) — must be addressed before decision

On HALT: report the blocker, compose the resolution skill if available, wait for developer.

## Idempotent Re-invocation

See [idempotency convention](../../../.pair/knowledge/guidelines/technical-standards/ai-development/skill-conventions/idempotency.md). Re-invoking `/review` on a partially reviewed PR is safe — per-phase:

1. **PR context**: detects already-loaded PR, skips re-loading.
2. **Phases**: checks which phases completed (via session state or PR review comments). Resumes from first incomplete phase.
3. **Skill compositions**: /verify-quality, /verify-done, /assess-security results cached in session. Not re-run if already passing/current on current commit.
4. **New commits**: if PR updated since last check, re-validates affected phases only.
5. **Review report**: updates existing report rather than posting duplicates.
6. **Merge**: detects already-merged PR. Skips Phase 6 if already merged. Resumes parent cascade if merge succeeded but status updates are incomplete.

## Graceful Degradation

See [graceful degradation](../../../.pair/knowledge/guidelines/technical-standards/ai-development/skill-conventions/graceful-degradation.md) (optional skill not installed → degrade, never HALT; PM tool not accessible → ask the reviewer directly) for the standard scenarios. Additional cases:

- **/verify-adoption not installed**: Falls back to inline dependency checking against [tech-stack.md](../../../.pair/adoption/tech/tech-stack.md). Warning logged. See degradation cascade (Phase 3).
- **/assess-stack not installed**: Unlisted dependencies flagged as warnings for manual verification. Does NOT HALT.
- **/analyze-debt not available**: Skip debt assessment, note in report.
- **/assess-security not installed**: Skip Step 2.4. Security Review section notes "manual judgment only — /assess-security not installed". Does NOT HALT; a manual security read of the diff is still expected per [how-to-11](../../../.pair/knowledge/how-to/11-how-to-code-review.md).
- **Story not found**: Review proceeds with PR-only validation (no AC check). Phase 6 skips parent cascade.
- **Code review template not found**: **HALT** — cannot produce review without template (a required dependency, not optional).
- **PM tool not accessible**: Phase 6 merge via CLI only.
- **Merge fails** (conflicts, branch protection): Report the failure, ask reviewer to resolve. Do not force-push or bypass protections.
- **/execute-manual-tests not installed**: Skip Step 6.6. Log "Manual test validation skipped — skill not installed." Does NOT block merge.
- **No manual test suite**: Skip Step 6.6. Log "No manual test suite found." Does NOT block merge.

## Notes

- This skill **reads code, posts review comments, and optionally merges PRs** — it does not modify source code.
- Review phases are sequential — each phase builds on findings from prior phases.
- The reviewer can stop between phases; re-invoke to resume (see [idempotency convention](../../../.pair/knowledge/guidelines/technical-standards/ai-development/skill-conventions/idempotency.md)).
- Output follows [code-review-template.md](../../../.pair/knowledge/guidelines/collaboration/templates/code-review-template.md) — the template defines structure, /review fills it with findings.
- HALT on missing ADR is inherited from [how-to-11](../../../.pair/knowledge/how-to/11-how-to-code-review.md) — this is a business rule, not a skill limitation.
- **Parent cascade is best-effort** — if sub-issue queries fail, the skill reports which updates need manual attention.
