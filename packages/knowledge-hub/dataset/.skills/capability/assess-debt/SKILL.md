---
name: assess-debt
description: "Assesses technical debt using resolution cascade (Argument > Adoption > Assessment). Categorizes debt (code, design, test, documentation, infrastructure), applies prioritization formula (impact x effort), proposes remediation priority. Output-only: returns a report, writes no files, creates no backlog items, never blocks. Idempotent. Invocable independently or composed by /review."
version: 0.5.0
author: Foomakers
---

# /assess-debt — Technical Debt Assessment

Detect, categorize, and prioritize technical debt items. Applies the prioritization framework from [technical-debt.md](../../../.pair/knowledge/guidelines/code-design/quality-standards/technical-debt.md) guidelines. Produces a debt report with categorized items, severity, impact/effort scoring, and remediation recommendations. **Output-only**: this skill returns a report — it writes no files, creates no PM-tool items, and there is **no `$mode:scan`** and **no auto-conversion** of debt into backlog cards. Technical debt **never blocks a PR**.

## Arguments

| Argument | Required | Description                                                                                                                                      |
| -------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `$scope` | No       | Limit assessment to specific categories: `code`, `design`, `test`, `documentation`, `infrastructure`, `all` (default: `all`)                    |
| `$choice`| No       | Pre-identified debt item to assess (e.g., `"missing error handling in API layer"`). Skips detection, goes directly to categorization and scoring. |

## Composed Skills

This skill is **output-only** — it composes no skill and writes no files. No auto-creation of tech-debt items. A debt item worth scheduling is promoted **deliberately** to the backlog by a human/agent via `/write-issue` with the `tech-debt` label (see [Composition Interface](#composition-interface)) — a manual, selective act, never a 100% auto-conversion.

## Algorithm

### Step 1: Resolution Cascade

#### Path A — Argument Override ($choice provided)

1. **Check**: Is `$choice` provided?
2. **Skip**: If not provided, go to Path B.
3. **Act**: Accept the pre-identified debt item. Skip detection (Step 2). Proceed directly to Step 3 (categorization) with the single item.
4. **Verify**: Item accepted.

#### Path B — Existing Assessment

1. **Check**: Is there an existing debt assessment for this codebase/PR? (Look for a recent debt report in the conversation context or PR comments.)
2. **Skip**: If no existing assessment, go to Path C.
3. **Act**: Present the existing assessment:

   > Existing debt assessment found ([N items], [date]).
   > Re-assess? (Only if explicitly requested by developer.)

4. **Verify**: If developer confirms existing → exit. If re-assessment requested → proceed to Path C.

#### Path C — Full Assessment

1. **Act**: Proceed to Step 2 (detection).

### Step 2: Detect Debt Items

Scan the codebase or PR changes for debt indicators per category. Follow **check → skip → act → verify** for each.

#### 2.1: Code Debt

1. **Check**: Scan for code-level debt indicators:
   - Code smells: `TODO`, `FIXME`, `HACK`, `WORKAROUND` comments
   - Duplicated code blocks or patterns across modules
   - Functions exceeding complexity thresholds (cyclomatic complexity > 10)
   - Deep nesting (> 3 levels)
   - Long functions (> 50 lines) or large files (> 300 lines)
2. **Skip**: If no code debt found → record category as clean.
3. **Act**: Flag each item with location and preliminary severity.

#### 2.2: Design Debt

1. **Check**: Scan for design-level debt:
   - Violations of adopted [architecture](../../../.pair/adoption/tech/architecture.md) patterns
   - Tight coupling between modules that should be independent
   - Missing abstractions (repeated patterns that should be extracted)
   - God objects or utility catch-all modules
   - Layer boundary violations
2. **Skip**: If no design debt found → record category as clean.
3. **Act**: Flag each item.

#### 2.3: Test Debt

1. **Check**: Scan for testing gaps:
   - Modules without corresponding test files (violating 1:1 mapping)
   - Tests with no assertions or weak assertions
   - Missing edge case coverage
   - Implementation-coupled tests (mocking internals instead of behavior)
   - Skipped or disabled tests (`xit`, `xdescribe`, `.skip`)
2. **Skip**: If no test debt found → record category as clean.
3. **Act**: Flag each item.

#### 2.4: Documentation Debt

1. **Check**: Scan for documentation gaps:
   - Public APIs without documentation
   - Complex logic without explanatory comments
   - Outdated README or adoption files
   - Missing ADR/ADL for significant decisions
2. **Skip**: If no documentation debt found → record category as clean.
3. **Act**: Flag each item.

#### 2.5: Infrastructure Debt

1. **Check**: Scan for infrastructure issues:
   - Dependencies not listed in [tech-stack.md](../../../.pair/adoption/tech/tech-stack.md) or with known vulnerabilities
   - Outdated dependency versions (major version behind)
   - Missing or broken CI/CD quality gates
   - Configuration drift from adopted infrastructure
2. **Skip**: If no infrastructure debt found → record category as clean.
3. **Act**: Flag each item.

### Step 3: Categorize and Score

For each detected item, apply the prioritization formula:

1. **Act**: Assess **Impact** (1-5):
   - 1: Cosmetic — no effect on functionality
   - 2: Minor — slight inconvenience, easy workaround
   - 3: Moderate — affects maintainability or developer velocity
   - 4: Significant — affects reliability, security, or user experience
   - 5: Critical — active risk to system correctness or security

2. **Act**: Assess **Effort** (1-5):
   - 1: Trivial — < 1 hour, simple fix
   - 2: Small — 1-4 hours, straightforward
   - 3: Medium — 1-2 days, moderate complexity
   - 4: Large — 3-5 days, significant refactoring
   - 5: Epic — > 1 week, architectural change

3. **Act**: Calculate **Priority Score**: `Impact × (6 - Effort)` (higher = fix first)
   - High impact + low effort = highest priority (quick wins)
   - High impact + high effort = scheduled remediation
   - Low impact + low effort = opportunistic fixes
   - Low impact + high effort = defer or accept

4. **Act**: Assign **Severity** based on priority score:
   - **High** (score ≥ 15): Address in current or next sprint
   - **Medium** (score 8-14): Plan remediation within 2-3 sprints
   - **Low** (score ≤ 7): Address opportunistically

### Step 4: Generate Remediation Recommendations

1. **Act**: For each High severity item, propose a remediation approach:
   - Specific refactoring strategy (e.g., "Extract method", "Introduce interface", "Strangler fig pattern")
   - Estimated effort
   - Risk assessment for the remediation itself
2. **Act**: For Medium items, provide general guidance.
3. **Act**: For Low items, note for tracking only.

### Step 5: Return the Report

1. **Act**: Return the debt report (see Output Format) to the caller or developer. **This skill writes nothing** — no adoption file, no code change, no PM-tool item.
2. **Act**: If a High-severity item is worth scheduling, recommend that the developer promote it **deliberately** to the backlog via `/write-issue` (`$type` per template, `tech-debt` label). This is a manual, selective decision — the skill never creates the card itself.
3. **Verify**: Report returned. No side effects.

## Output Format

```text
TECH DEBT ASSESSMENT (output-only — no files or issues created):
├── Items Found:  [N total]
├── Categories:   Code: [N] | Design: [N] | Test: [N] | Docs: [N] | Infra: [N]
├── Severity:     High: [N] | Medium: [N] | Low: [N]
└── Promotion:    [none | suggested: N items for deliberate /write-issue promotion]

PRIORITIZED ITEMS:
 # | Severity | Category | Impact | Effort | Score | Description | Location
---|----------|----------|--------|--------|-------|-------------|----------
 1 | High     | [cat]    | [1-5]  | [1-5]  | [N]   | [desc]      | [file:line]
 2 | ...

REMEDIATION PLAN (High severity):
1. [item] — [strategy] (est. [effort])
2. ...

RESULT: [N items assessed, N high-priority — report only, nothing created/blocked]
```

## Composition Interface

When composed by `/review`:

- **Input**: /review invokes `/assess-debt` during the completeness phase (Phase 4).
- **Output**: Returns the debt assessment report. /review incorporates findings into review output (the Tech Debt section).
  - Debt items are **informational** — they do **not** HALT the review and **never** block the PR.
  - /review does **not** auto-create tech-debt issues. Items worth tracking are promoted deliberately (after review) via `/write-issue` with the `tech-debt` label.

When invoked **independently**:

- Full interactive flow. Scan codebase or specified scope for debt.
- Report findings with categorization and prioritization.

## Graceful Degradation

- If adoption files are missing, skip design and infrastructure categories — report only code-level debt (code smells, duplication, test gaps, documentation).
- If [tech-stack.md](../../../.pair/adoption/tech/tech-stack.md) is not found, skip infrastructure dependency checks.
- If [architecture.md](../../../.pair/adoption/tech/architecture.md) is not found, skip design debt detection for architectural violations.
- If guidelines are not found, use built-in heuristics for detection (complexity thresholds, naming patterns, test file presence).

## Notes

- **Idempotent**: re-invocation on an already-assessed codebase confirms the existing assessment. Re-assessment only on explicit developer request.
- Prioritization formula `Impact × (6 - Effort)` favors quick wins: high-impact items with low effort get the highest scores.
- Debt is contextual — the same pattern may be acceptable in a prototype but unacceptable in production code. Severity assessment considers the project's maturity and risk tolerance.
