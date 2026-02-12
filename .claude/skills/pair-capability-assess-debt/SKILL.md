---
name: pair-capability-assess-debt
description: Flags technical debt items with severity levels. Stub implementation — detects and flags debt without categorization or prioritization formula. Full implementation in a future story. Invocable independently or composed by /pair-process-review.
---

# /pair-capability-assess-debt — Tech Debt Flagger (Stub)

Detect and flag technical debt items with severity levels. This is a **stub implementation** — it identifies debt and assigns severity but does not provide categorization formulas, prioritization scoring, or remediation planning. Full implementation planned for [#105](https://github.com/foomakers/pair/issues/105).

## Arguments

| Argument | Required | Description |
|----------|----------|-------------|
| `$scope` | No | Limit detection to specific categories: `duplication`, `missing-tests`, `outdated-deps`, `architecture`, `documentation`, `all` (default: `all`) |

## Algorithm

Scan the codebase or PR changes for debt indicators. For each category, follow the **check → skip → act → verify** pattern.

### Step 1: Code Duplication

1. **Check**: Are there duplicated code blocks or patterns across modules?
2. **Skip**: If no duplication detected — move to Step 2.
3. **Act**: Flag each instance with location and severity.
4. **Verify**: All duplication instances recorded.

### Step 2: Missing Tests

1. **Check**: Are there modules without corresponding test files (violating 1:1 mapping)?
2. **Skip**: If all modules have tests — move to Step 3.
3. **Act**: Flag each untested module with severity.
4. **Verify**: All gaps recorded.

### Step 3: Outdated Dependencies

1. **Check**: Are there dependencies not listed in [tech-stack.md](../../../.pair/adoption/tech/tech-stack.md) or with known issues?
2. **Skip**: If all dependencies are current and listed — move to Step 4.
3. **Act**: Flag each outdated or unlisted dependency with severity.
4. **Verify**: All dependency issues recorded.

### Step 4: Architectural Violations

1. **Check**: Are there patterns that violate adopted [architecture](../../../.pair/adoption/tech/architecture.md)?
2. **Skip**: If no violations detected — move to Step 5.
3. **Act**: Flag each violation with location and severity.
4. **Verify**: All violations recorded.

### Step 5: Documentation Gaps

1. **Check**: Are there public APIs or complex logic without documentation?
2. **Skip**: If documentation is adequate — move to output.
3. **Act**: Flag each gap with location and severity.
4. **Verify**: All gaps recorded.

## Severity Levels

| Level | Description | Action |
|-------|-------------|--------|
| **High** | Active risk — affects correctness, security, or maintainability now | Should be addressed in current or next sprint |
| **Medium** | Growing risk — will worsen if ignored | Plan remediation within 2-3 sprints |
| **Low** | Minor concern — cosmetic or minor inefficiency | Address opportunistically |

## Output Format

```text
TECH DEBT REPORT:
├── Items Found: [N]
├── High:   [N items]
├── Medium: [N items]
└── Low:    [N items]

ITEMS:
1. [severity] [category] — [description] ([file:line])
2. ...

NOTE: Stub implementation — no prioritization scoring.
Full categorization in #105.
```

## Composition Interface

When composed by `/pair-process-review`:

- **Input**: /pair-process-review invokes `/pair-capability-assess-debt` during the completeness phase.
- **Output**: Returns the debt report. /pair-process-review incorporates items into review findings.
  - High severity items may influence the review decision (TECH-DEBT verdict).
  - Items are informational — they do not HALT the review.

When invoked **independently**:

- Scan codebase or specified scope for debt indicators.
- Report findings. This skill only reads and reports — it does not modify code or create tickets.

## Graceful Degradation

- If adoption files are missing, skip architecture and dependency checks — report only code-level debt (duplication, missing tests, documentation gaps).
- If tech-stack.md is not found, skip outdated dependency detection.

## Notes

- **Stub implementation** — flags debt items with severity only. No categorization formula, no prioritization matrix, no remediation cost estimation.
- Full implementation in [#105](https://github.com/foomakers/pair/issues/105) will add: categorization taxonomy, impact/effort scoring, remediation recommendations, trend tracking.
- This skill is **read-only** — it inspects code but never modifies files.
