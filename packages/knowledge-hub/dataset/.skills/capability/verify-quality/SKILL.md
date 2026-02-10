---
name: verify-quality
description: >-
  Checks quality gates from quality-assurance/quality-standards/ against the
  current codebase. Gates already passing are skipped. Invocable independently
  or composed by /implement and /review.
---

# /verify-quality — Quality Gate Checker

Validate the current codebase against quality gates defined in `quality-assurance/quality-standards/`. Only check gates that are not already passing.

## Arguments

| Argument | Required | Description |
|----------|----------|-------------|
| `$scope` | No | Limit checking to specific gates: `code-quality`, `tests`, `lint`, `all` (default: `all`) |

## Algorithm

Execute each gate in order. For every gate, follow the **check → skip → act → verify** pattern.

### Step 1: Detect Project Quality Command

1. **Check**: Read `.pair/adoption/tech/way-of-working.md` and `package.json` scripts for a configured quality gate command (e.g., `pnpm quality-gate`, `turbo lint && turbo test`).
2. **Skip**: If no project-specific command found, fall through to individual gate checks.
3. **Act**: If found, record the command for use in Step 5.

### Step 2: Lint Gate

1. **Check**: Run the project linter (e.g., `pnpm lint` or `turbo lint`). Capture output.
2. **Skip**: If zero violations, report "Lint: PASS" and move to Step 3.
3. **Act**: If violations found, report each violation with file and line.
4. **Verify**: After developer fixes, re-run linter to confirm zero violations.

### Step 3: Type Check Gate

1. **Check**: Run the type checker (e.g., `pnpm tsc --noEmit` or `turbo build`). Capture output.
2. **Skip**: If zero errors, report "Type Check: PASS" and move to Step 4.
3. **Act**: If errors found, report each error with file and line.
4. **Verify**: After developer fixes, re-run type checker to confirm zero errors.

### Step 4: Test Gate

1. **Check**: Run the test suite (e.g., `pnpm test` or `turbo test`). Capture output including coverage.
2. **Skip**: If all tests pass, report "Tests: PASS (N tests, X% coverage)" and move to Step 5.
3. **Act**: If tests fail, report each failure with test name, file, and assertion message.
4. **Verify**: After developer fixes, re-run tests to confirm all pass.

### Step 5: Aggregate Quality Gate

If a project-level quality gate command exists (from Step 1):

1. **Check**: Run the aggregate command (e.g., `pnpm quality-gate`).
2. **Skip**: If exit code 0, report "Quality Gate: PASS" and move to output.
3. **Act**: If non-zero exit, report the failing sub-gates.
4. **Verify**: After developer fixes, re-run to confirm pass.

## Output Format

Present results as:

```
QUALITY GATE REPORT:
├── Lint:       [PASS | FAIL — N violations]
├── Type Check: [PASS | FAIL — N errors]
├── Tests:      [PASS — N tests, X% coverage | FAIL — N failures]
└── Aggregate:  [PASS | FAIL | N/A]

RESULT: [ALL GATES PASS | BLOCKED — N gates failing]
```

## Composition Interface

When composed by `/implement` or `/review`:

- **Input**: The composing skill invokes `/verify-quality` after implementation or before commit.
- **Output**: Returns PASS or FAIL with details. The composing skill decides what to do:
  - `/implement`: HALT on FAIL — developer must fix before commit.
  - `/review`: Report FAIL as review finding — does not block review completion.

When invoked **independently**:

- Run all gates (or scoped gates if `$scope` is provided).
- Report results. No side effects — this skill only reads and reports.

## Graceful Degradation

- If a gate command is not available (e.g., no test script in package.json), skip that gate and report: "Tests: SKIPPED — no test command found."
- If `quality-assurance/quality-standards/` directory is not found, warn and run only detectable gates (lint, type check, tests from package.json scripts).
- If no quality-related scripts are found at all, report: "No quality gates detected. Configure quality gate commands in package.json or way-of-working.md."

## Notes

- This skill is **read-only with side effects limited to running existing commands** — it never modifies source code or configuration.
- Quality standards are **universal** (referenced directly from `quality-assurance/quality-standards/`), not project-specific via adoption.
- Each gate is independent — a failure in one gate does not prevent checking subsequent gates.
- Re-invoke after fixes to confirm resolution. Already-passing gates are re-verified but complete instantly.
