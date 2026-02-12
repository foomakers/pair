---
name: pair-capability-verify-quality
description: Checks quality gates against the current codebase. Reads project-specific quality gate command from way-of-working adoption and universal standards from quality-standards guidelines. Gates already passing are skipped. Invocable independently or composed by /pair-process-implement and /pair-process-review.
---

# /pair-capability-verify-quality — Quality Gate Checker

Validate the current codebase against quality gates. Two sources of truth:

- **[way-of-working.md](../../../.pair/adoption/tech/way-of-working.md)** — project-specific quality gate command and process (e.g., `pnpm quality-gate`). This is "what command we run."
- **[quality-standards](../../../.pair/knowledge/guidelines/quality-assurance/quality-standards/README.md)** — universal quality standards (gates, DoD, checklists). This is "what we check."

Only check gates that are not already passing.

## Arguments

| Argument | Required | Description                                                                               |
| -------- | -------- | ----------------------------------------------------------------------------------------- |
| `$scope` | No       | Limit checking to specific gates: `code-quality`, `tests`, `lint`, `all` (default: `all`) |

## Algorithm

Execute each gate in order. For every gate, follow the **check → skip → act → verify** pattern.

### Step 1: Read Adoption Quality Gate Configuration

1. **Check**: Read [way-of-working.md](../../../.pair/adoption/tech/way-of-working.md) and look for a **Quality Gates** section declaring the project-specific quality gate command (e.g., `pnpm quality-gate`).
2. **Skip**: If `way-of-working.md` has no Quality Gates section, fall back to `package.json` scripts for detectable gate commands (e.g., `test`, `lint`, `ts:check`).
3. **Act**: If found, record the command for use in Step 5. Also note any sub-checks listed (e.g., type checking, testing, linting, formatting).

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

```text
QUALITY GATE REPORT:
├── Lint:       [PASS | FAIL — N violations]
├── Type Check: [PASS | FAIL — N errors]
├── Tests:      [PASS — N tests, X% coverage | FAIL — N failures]
└── Aggregate:  [PASS | FAIL | N/A]

RESULT: [ALL GATES PASS | BLOCKED — N gates failing]
```

## Composition Interface

When composed by `/pair-process-implement` or `/pair-process-review`:

- **Input**: The composing skill invokes `/pair-capability-verify-quality` after implementation or before commit.
- **Output**: Returns PASS or FAIL with details. The composing skill decides what to do:
  - `/pair-process-implement`: HALT on FAIL — developer must fix before commit.
  - `/pair-process-review`: Report FAIL as review finding — does not block review completion.

When invoked **independently**:

- Run all gates (or scoped gates if `$scope` is provided).
- Report results. No side effects — this skill only reads and reports.

## Graceful Degradation

- If a gate command is not available (e.g., no test script in package.json), skip that gate and report: "Tests: SKIPPED — no test command found."
- If [quality-standards](../../../.pair/knowledge/guidelines/quality-assurance/quality-standards/README.md) directory is not found, warn and run only detectable gates (lint, type check, tests from package.json scripts).
- If no quality-related scripts are found at all, report: "No quality gates detected. Configure quality gate commands in package.json or way-of-working.md."

## Notes

- This skill is **read-only with side effects limited to running existing commands** — it never modifies source code or configuration.
- Two sources: [way-of-working.md](../../../.pair/adoption/tech/way-of-working.md) for the project-specific quality gate command (adoption-driven), [quality-standards](../../../.pair/knowledge/guidelines/quality-assurance/quality-standards/README.md) for universal quality standards.
- Each gate is independent — a failure in one gate does not prevent checking subsequent gates.
- Re-invoke after fixes to confirm resolution. Already-passing gates are re-verified but complete instantly.
