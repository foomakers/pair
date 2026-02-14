---
name: pair-process-review
description: "Reviews a pull request through a structured 6-phase process: validation, technical review, adoption compliance, completeness check, decision, and optional merge with parent cascade. Composes /pair-capability-verify-quality, /pair-capability-verify-done, /pair-capability-record-decision, /pair-capability-assess-debt (required) and /pair-capability-verify-adoption, /pair-capability-assess-stack (optional with graceful degradation). Output follows the code review template. Idempotent — re-invocation resumes from incomplete phases."
---

# /pair-process-review — Code Review

Review a pull request through 6 sequential phases (5 review + 1 optional merge). Each phase composes atomic skills and follows the **check → skip → act → verify** pattern for idempotent re-invocation.

## Composed Skills

| Skill              | Type       | Required | Phase | Purpose                              |
| ------------------ | ---------- | -------- | ----- | ------------------------------------ |
| `/pair-capability-verify-quality`  | Capability | Yes      | 2     | Quality gate checking                |
| `/pair-capability-verify-done`     | Capability | Yes      | 4     | Definition of Done checking          |
| `/pair-capability-record-decision` | Capability | Yes      | Any   | Record missing ADR (HALT condition)  |
| `/pair-capability-assess-debt`     | Capability | Yes      | 4     | Flag tech debt items                 |
| `/pair-capability-verify-adoption` | Capability | Optional | 3     | Full adoption compliance (from #105) |
| `/pair-capability-assess-stack`    | Capability | Optional | 3     | Tech-stack resolution (from #104)    |

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
3. **Act**: Read PR from the PM tool (per [way-of-working.md](../../../.pair/adoption/tech/way-of-working.md)):
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

## Phase 2: Technical Review

### Step 2.1: Quality Gates

1. **Check**: Has `/pair-capability-verify-quality` already run on the current PR head commit?
2. **Skip**: If all gates passing on current commit — record results, move to Step 2.2.
3. **Act**: Compose `/pair-capability-verify-quality` with `$scope = all`.
4. **Verify**: Record quality gate results. Failures become review findings (do not HALT — /pair-process-review reports them).

### Step 2.2: Code Quality Assessment

1. **Check**: Have code quality issues already been identified in this session?
2. **Skip**: If already assessed — move to Step 2.3.
3. **Act**: Review changed files against:
   - [Code design guidelines](../../../.pair/knowledge/guidelines/code-design/README.md) — readability, maintainability, naming
   - [Technical standards](../../../.pair/knowledge/guidelines/technical-standards/README.md) — patterns, conventions
   - Review type-specific concerns (e.g., behavior preservation for refactors, regression tests for bugs)
4. **Verify**: Issues catalogued by severity (critical / major / minor).

### Step 2.3: Architecture & ADR Compliance

1. **Check**: Does the PR introduce new technical decisions (libraries, patterns, technologies)?
2. **Skip**: If no new decisions detected — move to Phase 3.
3. **Act**: For each new decision, verify:
   - ADR exists in `adoption/tech/adr/`
   - [tech-stack.md](../../../.pair/adoption/tech/tech-stack.md) updated
   - Version consistency across workspaces
4. **Verify**: All decisions documented. **Missing ADR → HALT**:
   - Compose `/pair-capability-record-decision` with `$type = architectural` and `$topic` describing the gap.
   - Set review status to CHANGES-REQUESTED until ADR is created.
   - Resume review after ADR is added.

## Phase 3: Adoption Compliance

This phase uses a **4-level graceful degradation cascade** depending on which optional skills are installed:

| Level | /pair-capability-verify-adoption | /pair-capability-assess-stack | Behavior                                                   |
| ----- | ---------------- | ------------- | ---------------------------------------------------------- |
| 1     | Installed        | Installed     | Full adoption compliance + automatic tech-stack resolution |
| 2     | Installed        | Not installed | Full compliance detection, manual stack resolution         |
| 3     | Not installed    | Installed     | Inline tech-stack check only + automatic resolution        |
| 4     | Not installed    | Not installed | Warn developer for manual verification                     |

### Step 3.1: Determine Degradation Level

1. **Check**: Is `/pair-capability-verify-adoption` installed? Is `/pair-capability-assess-stack` installed?
2. **Act**: Set the degradation level (1–4) based on availability.
3. **Verify**: Level set. Proceed with the corresponding behavior.

### Step 3.2: Run Adoption Check

**Level 1** (/pair-capability-verify-adoption + /pair-capability-assess-stack):

1. Compose `/pair-capability-verify-adoption` with `$scope = all`.
2. For each non-conformity:
   - **Tech-stack**: compose `/pair-capability-assess-stack` → developer approves (add to stack) or rejects (CHANGES-REQUESTED).
   - **Architecture**: report to developer for resolution. Missing ADR → HALT via `/pair-capability-record-decision`.
   - **Other** (security, coding-standards, infrastructure): report findings.
3. Record all results.

**Level 2** (/pair-capability-verify-adoption only):

1. Compose `/pair-capability-verify-adoption` with `$scope = all`.
2. For tech-stack non-conformities: report as findings for manual resolution.
3. For other non-conformities: same as Level 1.
4. Record results.

**Level 3** (/pair-capability-assess-stack only):

1. Inline check: scan PR diff for new dependencies not in [tech-stack.md](../../../.pair/adoption/tech/tech-stack.md).
2. For unlisted dependencies: compose `/pair-capability-assess-stack` → developer approves or rejects.
3. No broader adoption compliance check (security, architecture, etc. — covered partially by Phase 2).
4. Record results.

**Level 4** (neither installed):

1. Warn:

   > `/pair-capability-verify-adoption` and `/pair-capability-assess-stack` are not installed — skipping automated adoption compliance. Please manually verify code against adoption files.

2. Move to Phase 4.

### Step 3.3: Verify Adoption Results

1. **Check**: Are there unresolved non-conformities?
2. **Skip**: If all resolved or Level 4 (warned) — move to Phase 4.
3. **Act**: Unresolved tech-stack items become review findings. Unresolved architectural gaps are HALT conditions.
4. **Verify**: All items resolved or catalogued as findings.

## Phase 4: Completeness Check

### Step 4.1: Definition of Done

1. **Check**: Has `/pair-capability-verify-done` already run in this session?
2. **Skip**: If already run on current commit — reuse results, move to Step 4.2.
3. **Act**: Compose `/pair-capability-verify-done` with `$scope = all` and `$story` (if available).
4. **Verify**: Record DoD results. Failing criteria become review findings. HALT conditions (missing ADR) propagate.

### Step 4.2: Tech Debt Assessment

1. **Check**: Has `/pair-capability-assess-debt` already run in this session?
2. **Skip**: If already run — reuse results, move to Phase 5.
3. **Act**: Compose `/pair-capability-assess-debt` with `$scope = all`.
4. **Verify**: Record debt items. High-severity items may influence the review decision.

## Phase 5: Review Decision

### Step 5.1: Compile Review Report

1. **Act**: Compile all findings into a review report following the [code-review-template.md](../../../.pair/knowledge/guidelines/collaboration/templates/code-review-template.md):
   - **Review Information**: PR number, author, reviewer, date, story, review type
   - **Review Summary**: overall assessment, key changes, business value
   - **Code Review Checklist**: functionality, code quality, technical standards (from Phase 2)
   - **Security Review**: security findings (from Phase 2 + Phase 3)
   - **Testing Review**: test coverage and quality (from /pair-capability-verify-quality)
   - **Documentation Review**: documentation completeness (from /pair-capability-verify-done)
   - **Detailed Review Comments**: issues by severity, positive feedback
   - **Risk Assessment**: technical and business risks
   - **Tech Debt**: items flagged by /pair-capability-assess-debt
   - **Adoption Compliance**: results from Phase 3 (with degradation level noted)

### Step 5.2: Make Review Decision

Based on compiled findings:

| Decision              | Condition                                                                                 |
| --------------------- | ----------------------------------------------------------------------------------------- |
| **APPROVED**          | No critical or major issues. All AC met. Quality gates pass.                              |
| **CHANGES-REQUESTED** | Critical issues found, missing ADRs, security vulnerabilities, failing tests, AC not met. |
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
2. **Skip**: If CHANGES-REQUESTED → output review report and stop. Author addresses findings, then re-invokes `/pair-process-review`.
3. **Act**: If APPROVED or TECH-DEBT → ask reviewer:

   > PR approved. Merge now or let the author merge?
   > 1. **Merge now** — proceed to Phase 6
   > 2. **Author merges** — stop here, author re-invokes `/pair-process-implement` Phase 4

4. **Verify**: If "Merge now" selected → proceed to Phase 6. Otherwise → output and stop.

## Phase 6: Merge & Close (APPROVED only)

### Step 6.1: Read Merge Strategy

1. **Check**: Is merge strategy specified in [way-of-working.md](../../../.pair/adoption/tech/way-of-working.md)?
2. **Skip**: If not specified, default to `squash`.
3. **Act**: Read the adopted merge strategy (`squash`, `merge`, or `rebase`).
4. **Verify**: Strategy determined.

### Step 6.2: Prepare Merge Commit

1. **Act**: Draft the merge commit message following the [commit template](../../../.pair/knowledge/guidelines/collaboration/templates/commit-template.md):

   ```text
   [#<story-id>] feat: <story description>

   - <summary of changes>
   - Tasks: T-1, T-2, ..., T-N

   Refs: #<story-id>
   ```

1. **Act** (BLOCKING): Present to reviewer for confirmation:

   > **Merge commit message:**
   >
   > ```text
   > [commit message]
   > ```
   >
   > Confirm or edit?

1. **Verify**: Reviewer confirms message.

### Step 6.3: Merge PR

1. **Act**: Merge the PR using the adopted strategy (per [github-implementation.md](../../../.pair/knowledge/guidelines/collaboration/project-management-tool/github-implementation.md)):
   - MCP-first: use `merge_pull_request` with `merge_method` and `commit_title` + `commit_message`.
   - CLI fallback: `gh pr merge <number> --squash --subject "<title>" --body "<body>"`.
2. **Verify**: PR merged and closed.

### Step 6.4: Update Story & Parent Cascade

1. **Act**: Close the user story issue in the PM tool:
   - MCP: `issue_write` with `method = update`, `state = closed`, `state_reason = completed`.
   - CLI: `gh issue close <story-number> --reason completed`.
2. **Act**: Check parent epic — read sub-issues to determine if ALL stories are Done:
   - MCP: `issue_read` with `method = get_sub_issues` on the epic.
   - If all sub-issues closed → close the epic with `state_reason = completed`.
   - If not all closed → leave epic open.
3. **Act**: Check parent initiative — same cascade logic:
   - If all epics closed → close the initiative.
   - If not all closed → leave initiative open.
4. **Verify**: Story closed. Epic and initiative updated if applicable.

### Step 6.5: Branch Cleanup

1. **Act**: Delete the feature branch (remote):
   - CLI: `git push origin --delete <branch>`.
2. **Verify**: Feature branch deleted.

## Output Format

At review decision (Phase 5):

```text
REVIEW COMPLETE:
├── PR:         [#NUMBER: Title]
├── Story:      [#ID: Title | N/A]
├── Decision:   [APPROVED | CHANGES-REQUESTED | TECH-DEBT]
├── Issues:     [critical: N | major: N | minor: N]
├── Quality:    [PASS | FAIL — N gates]
├── DoD:        [N/N criteria met]
├── Adoption:   [Level N — summary]
├── Debt:       [N items flagged]
└── Report:     [Posted as PR comment]
```

At merge (Phase 6):

```text
STORY DONE:
├── Story:      [#ID: Title]
├── PR:         [#PR-number — merged]
├── Merge:      [squash | merge | rebase]
├── Story:      Done
├── Epic:       [#ID — Done | In Progress (X/Y stories done)]
└── Initiative: [#ID — Done | In Progress (X/Y epics done)]
```

## HALT Conditions

Review stops immediately when:

- **PR not found or not open** (Phase 1)
- **Missing ADR for new technical decision** (Phase 2, Step 2.3) — compose `/pair-capability-record-decision`, then resume
- **Unresolved architectural non-conformity** (Phase 3) — must be addressed before decision

On HALT: report the blocker, compose the resolution skill if available, wait for developer.

## Idempotent Re-invocation

Re-invoking `/pair-process-review` on a partially reviewed PR is safe:

1. **PR context**: detects already-loaded PR, skips re-loading.
2. **Phases**: checks which phases completed (via session state or PR review comments). Resumes from first incomplete phase.
3. **Skill compositions**: /pair-capability-verify-quality, /pair-capability-verify-done results cached in session. Not re-run if already passing on current commit.
4. **New commits**: if PR updated since last check, re-validates affected phases only.
5. **Review report**: updates existing report rather than posting duplicates.
6. **Merge**: detects already-merged PR. Skips Phase 6 if already merged. Resumes parent cascade if merge succeeded but status updates are incomplete.

## Graceful Degradation

- **/verify-adoption not installed**: Falls back to inline dependency checking against [tech-stack.md](../../../.pair/adoption/tech/tech-stack.md). Warning logged. See degradation cascade (Phase 3).
- **/assess-stack not installed**: Unlisted dependencies flagged as warnings for manual verification. Does NOT HALT.
- **/assess-debt not available**: Skip debt assessment, note in report.
- **Story not found**: Review proceeds with PR-only validation (no AC check). Phase 6 skips parent cascade.
- **Code review template not found**: **HALT** — cannot produce review without template.
- **PM tool not accessible**: Ask reviewer to manually provide PR details. Phase 6 merge via CLI only.
- **Merge fails** (conflicts, branch protection): Report the failure, ask reviewer to resolve. Do not force-push or bypass protections.

## Notes

- This skill **reads code, posts review comments, and optionally merges PRs** — it does not modify source code.
- First skill to compose 6 atomic skills (4 required + 2 optional). Proves composition pattern at scale.
- Review phases are sequential — each phase builds on findings from prior phases.
- The reviewer can stop between phases. Re-invoke to resume (idempotency ensures correct state).
- Output follows [code-review-template.md](../../../.pair/knowledge/guidelines/collaboration/templates/code-review-template.md) — the template defines structure, /pair-process-review fills it with findings.
- HALT on missing ADR is inherited from [how-to-11](../../../.pair/knowledge/how-to/11-how-to-code-review.md) — this is a business rule, not a skill limitation.
- **Phase 6 is optional** — the reviewer can stop after Phase 5. The author can alternatively merge via `/pair-process-implement` Phase 4.
- **Parent cascade is best-effort** — if sub-issue queries fail, the skill reports which updates need manual attention.
