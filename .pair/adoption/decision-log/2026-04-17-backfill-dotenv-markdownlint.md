# Decision: Backfill dotenv and markdownlint-cli in tech-stack.md

## Date

2026-04-17

## Status

Active

## Category

Tech Stack Decision (non-architectural)

## Context

`/pair-capability-verify-adoption` detected 4 dependencies declared in `pnpm-workspace.yaml` catalog but not listed in `adoption/tech/tech-stack.md`:

- `dotenv 17.2.1` — used in `apps/pair-cli/` and `scripts/workflows/release/package-manual.sh`
- `markdownlint-cli 0.47.0` — wired into `pnpm quality-gate` via `mdlint:check` / `mdlint:fix`
- `@playwright/test ^1.50.0` + `@playwright/experimental-ct-react ^1.50.0` — Testing section (owned by `/pair-capability-assess-testing`)
- `jsdom 25.0.1` — Testing section (owned by `/pair-capability-assess-testing`)

These are adoption gaps, not functional violations: the dependencies are in active use, but `tech-stack.md` did not reflect the actual state.

## Decision

Backfill `dotenv 17.2.1` (under "Runtime & CLI tooling") and `markdownlint-cli 0.47.0` (under "Linting & formatting") into `adoption/tech/tech-stack.md`. Both fall within the ownership of `/pair-capability-assess-stack`.

Playwright and jsdom are deferred to a separate `/pair-capability-assess-testing` invocation, respecting section ownership boundaries (Testing section is owned by the testing skill).

## Alternatives Considered

- **Write all 4 entries from assess-stack**: Rejected. Violates section ownership; future `/pair-capability-assess-testing` runs could conflict.
- **Reject the unlisted deps and remove them from catalog**: Rejected. All 4 are legitimately in use; removal would break CLI, release scripts, quality gate, and test suites.
- **Leave adoption file drifted**: Rejected. `/pair-capability-verify-adoption` would keep flagging them on every review.

## Consequences

- `adoption/tech/tech-stack.md` now lists `dotenv` and `markdownlint-cli` with versions.
- Playwright + jsdom remain as open adoption gaps until `/pair-capability-assess-testing` runs.
- Subsequent `/pair-capability-verify-adoption` runs will report 2 residual findings (Playwright, jsdom) until the testing skill resolves them.

## Adoption Impact

- `adoption/tech/tech-stack.md`: 2 entries added (dotenv under Runtime & CLI tooling, markdownlint-cli under Linting & formatting).
- No changes to code, package.json, or workspace catalog — these were already present.
