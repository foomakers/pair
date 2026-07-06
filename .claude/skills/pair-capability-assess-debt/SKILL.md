---
name: pair-capability-assess-debt
description: "Assesses technical debt using resolution cascade (Argument > Adoption > Assessment). Categorizes debt (code, design, test, documentation, infrastructure), applies prioritization formula (impact x effort), proposes remediation priority. Idempotent: detects existing assessment; `$mode: scan` converts findings into tracked tech-debt items keyed by location+pattern to avoid duplicates. Invocable independently or composed by /pair-process-review."
version: 0.4.1
author: Foomakers
---

# /pair-capability-assess-debt — Technical Debt Assessment

Detect, categorize, and prioritize technical debt items. Applies the prioritization framework from [technical-debt.md](../../../.pair/knowledge/guidelines/code-design/quality-standards/technical-debt.md) guidelines. Produces a debt report with categorized items, severity, impact/effort scoring, and remediation recommendations. In `scan` mode, also converts findings directly into tracked `tech-debt` backlog items (see [Scan Mode Algorithm](#scan-mode-algorithm-mode-scan)).

## Arguments

| Argument  | Required | Description                                                                                                                                        |
| --------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `$scope`  | No       | Limit assessment to specific categories: `code`, `design`, `test`, `documentation`, `infrastructure`, `all` (default: `all`)                        |
| `$choice` | No       | Pre-identified debt item to assess (e.g., `"missing error handling in API layer"`). Skips detection, goes directly to categorization and scoring.   |
| `$mode`   | No       | `assess` (default) — categorize/prioritize/report only. `scan` — grep-based detection (code smells + design-rule violations) that creates tracked `tech-debt` items via `/pair-capability-write-issue`. See [Scan Mode Algorithm](#scan-mode-algorithm-mode-scan). |

## Composed Skills

| Skill              | Type       | Required                                                                    |
| ------------------ | ---------- | ---------------------------------------------------------------------------- |
| `/pair-capability-record-decision` | Capability | No — only if remediation requires a decision                                 |
| `/pair-capability-write-issue`      | Capability | No — only in `$mode: scan`, or when `/pair-process-review` flags new debt introduced by a PR |

## Algorithm

### Step 0: Determine Mode

1. **Check**: Is `$mode` set to `scan`?
2. **Skip**: If `$mode` is absent or `assess` → proceed to Step 1 (Resolution Cascade, below).
3. **Act**: If `$mode: scan` → skip Steps 1–5, go directly to [Scan Mode Algorithm](#scan-mode-algorithm-mode-scan).
4. **Verify**: Mode determined.

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

### Step 5: Compose Decision (if needed)

1. **Check**: Do any High severity items require an architectural decision to remediate?
2. **Skip**: If no decisions needed → proceed to output.
3. **Act**: Compose `/pair-capability-record-decision` for each decision-worthy item:
   - `$type: architectural` (if it changes architecture) or `$type: non-architectural` (if it's a tooling/process change)
   - `$topic: debt-remediation-[item]`
4. **Verify**: Decisions recorded.

## Scan Mode Algorithm (`$mode: scan`)

Grep-based detection that runs independently of the Resolution Cascade — always a fresh scan (no "existing assessment" shortcut; re-running is the idempotency contract, not a reason to skip). Applies `$scope` to filter categories, same as assess mode.

### Step S1: Pattern Scan

1. **Act**: Scan the target (full codebase, or PR diff when composed by `/pair-process-review`) for:
   - Code-smell markers: `TODO`, `FIXME`, `HACK`, `WORKAROUND` comments.
   - Design-rule violations: recognition criteria from any do/don't rule entry in [code-design guidelines](../../../.pair/knowledge/guidelines/code-design) (rules consolidated by [#223](https://github.com/foomakers/pair/issues/223)).
2. **Skip**: If no do/don't rule entries exist yet (design rules not yet consolidated) → scan code-smell markers only, note the gap in the output.
3. **Verify**: Raw match list produced — each match carries file path, line (or block start), and pattern/rule id.

### Step S2: Idempotency Filter

1. **Act**: For each match, compute a **detection key**: `<relative-file-path>:<line-or-block>:<pattern-or-rule-id>`.
2. **Check**: Does an open `tech-debt`-labeled item already carry this detection key (search the PM tool for the key in issue bodies)?
3. **Skip**: If tracked → drop the match, log it as skipped ("Scan match already tracked").
4. **Act**: If the pattern no longer reproduces at a previously-recorded location (finding already fixed) → drop it, log it as skipped ("Finding already fixed since last scan").
5. **Verify**: Only new, untracked matches remain.

### Step S3: Group and Threshold (flood control)

1. **Act**: Group remaining matches by file, then by module/directory when multiple related files match — one candidate item per group, not one per line. This is the mitigation for the "item flood from scan" risk.
2. **Act**: Apply Step 3's scoring to each group; drop groups scoring below Low severity unless `$scope` explicitly requests full visibility.
3. **Verify**: Grouped, thresholded candidate items ready for scoring.

### Step S4: Categorize and Score

1. **Act**: Apply Step 3 (Categorize and Score) and Step 4 (Remediation) exactly as in assess mode, per group.
2. **Verify**: Each group has Impact, Effort, Score, Severity, and a remediation note.

### Step S5: Create Tracked Items

1. **Act**: For each remaining group, compose `/pair-capability-write-issue` with `$type: task`, `$content` containing: title, description (matched locations + remediation note), the detection key(s) covered (so future scans can match Step S2), and label `tech-debt` in addition to the type label. Map **Severity → Priority**: High → P1, Medium → P2, Low → P3.
2. **Verify**: Item created (default board status — no explicit `$status` needed). Record the returned issue id against its detection key(s).
3. **Skip**: If `/pair-capability-write-issue` is not installed → report candidate items without creating them (see Graceful Degradation).

### Step S6: Report

Output the scan summary (see [Output Format](#output-format)) with counts of: matched, skipped (already tracked), skipped (already fixed), grouped, created.

## Output Format

```text
TECH DEBT ASSESSMENT:
├── Items Found:  [N total]
├── Categories:   Code: [N] | Design: [N] | Test: [N] | Docs: [N] | Infra: [N]
├── Severity:     High: [N] | Medium: [N] | Low: [N]
└── Decisions:    [N recorded | none needed]

PRIORITIZED ITEMS:
 # | Severity | Category | Impact | Effort | Score | Description | Location
---|----------|----------|--------|--------|-------|-------------|----------
 1 | High     | [cat]    | [1-5]  | [1-5]  | [N]   | [desc]      | [file:line]
 2 | ...

REMEDIATION PLAN (High severity):
1. [item] — [strategy] (est. [effort])
2. ...

RESULT: [N items assessed, N high-priority, N decisions recorded]
```

Scan mode (`$mode: scan`) output:

```text
TECH DEBT SCAN:
├── Matched:        [N raw matches]
├── Skipped:        Already tracked: [N] | Already fixed: [N]
├── Grouped Items:  [N] (by file/module)
├── Created:        [N tech-debt items | 0 — /pair-capability-write-issue not installed]
└── Severity:       High: [N] | Medium: [N] | Low: [N]

CREATED ITEMS:
 # | Priority | Issue  | Description         | Detection Key(s)
---|----------|--------|----------------------|-------------------
 1 | P1       | #[id]  | [desc]               | [file:line:pattern]
 2 | ...

RESULT: [N matches, N created, N skipped-tracked, N skipped-fixed]
```

## Composition Interface

When composed by `/pair-process-review`:

- **Input**: `/pair-process-review` invokes `/pair-capability-assess-debt` during the completeness phase (Phase 4), scoped to the PR diff (default `assess` mode — `$mode: scan` is not invoked automatically by review; it is a separate, explicit invocation for full-codebase sweeps).
- **Output**: Returns the debt assessment report, distinguishing items **introduced by this PR** from pre-existing debt surfaced incidentally.
  - For each item introduced by the PR: `/pair-process-review` composes `/pair-capability-write-issue` (`$type: task`, label `tech-debt`, priority from Severity → Priority mapping) to create a tracked item. Re-invocation on the same PR head commit does not recreate items already created earlier in the session (idempotent, per detection key).
  - **Debt never blocks the PR (R7.2)** — findings only ever feed the TECH-DEBT verdict (approve, track separately), never CHANGES-REQUESTED. Remediation recommendations are informational, not a gate.

When invoked **independently**:

- `$mode: assess` (default): full interactive flow. Scan codebase or specified scope for debt, report findings with categorization and prioritization.
- `$mode: scan`: grep-based detection that creates tracked `tech-debt` items directly (see [Scan Mode Algorithm](#scan-mode-algorithm-mode-scan)). Safe to re-run — idempotent via detection key.
- This skill is **read-only** when detecting in `assess` mode — it does not modify code. Decision recording via `/pair-capability-record-decision` and item creation via `/pair-capability-write-issue` (scan mode, or PR-introduced debt) are the only write actions.

## Graceful Degradation

- If adoption files are missing, skip design and infrastructure categories — report only code-level debt (code smells, duplication, test gaps, documentation).
- If [tech-stack.md](../../../.pair/adoption/tech/tech-stack.md) is not found, skip infrastructure dependency checks.
- If [architecture.md](../../../.pair/adoption/tech/architecture.md) is not found, skip design debt detection for architectural violations.
- If `/pair-capability-record-decision` is not installed, warn and skip decision recording.
- If `/pair-capability-write-issue` is not installed, `$mode: scan` reports candidate items without creating them — warn: "`/pair-capability-write-issue` not installed — scan results are informational only."
- If no do/don't rule entries exist in code-design guidelines yet, `$mode: scan` falls back to code-smell markers only (TODO/FIXME/HACK/WORKAROUND).
- If guidelines are not found, use built-in heuristics for detection (complexity thresholds, naming patterns, test file presence).

## Notes

- This skill **replaces the stub implementation** from [#100](https://github.com/foomakers/pair/issues/100). Full categorization, prioritization formula, and remediation recommendations are now included.
- **Resolution cascade**: Path A (pre-identified item) → Path B (existing assessment) → Path C (full scan). Follows the same pattern as other assess-* skills. Applies to `$mode: assess` only — `$mode: scan` always re-scans (Step 0).
- **Idempotent**: re-invocation on an already-assessed codebase confirms the existing assessment (assess mode) or skips already-tracked matches (scan mode, via the `<file>:<line>:<pattern>` detection key). Re-assessment only on explicit developer request; re-scan is always safe.
- **Read-only for detection** — this skill inspects code but never modifies files directly. Writes happen only via `/pair-capability-record-decision` (decisions) and `/pair-capability-write-issue` (scan-mode items, or PR-introduced debt when composed by `/pair-process-review`).
- Prioritization formula `Impact × (6 - Effort)` favors quick wins: high-impact items with low effort get the highest scores. Severity → Priority label mapping for created items: High → P1, Medium → P2, Low → P3.
- Debt is contextual — the same pattern may be acceptable in a prototype but unacceptable in production code. Severity assessment considers the project's maturity and risk tolerance.
- Debt never blocks PRs (R7.2) — this applies uniformly whether debt is found via `/pair-process-review` composition or a standalone `$mode: scan` sweep.
