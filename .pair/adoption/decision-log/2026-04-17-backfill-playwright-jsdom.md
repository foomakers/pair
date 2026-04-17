# Decision: Backfill Playwright and jsdom in tech-stack.md Testing section

## Date

2026-04-17

## Status

Active

## Category

Testing Strategy Decision (non-architectural)

## Context

`/pair-capability-verify-adoption` detected 4 unlisted dependencies in the workspace catalog. The companion decision [2026-04-17-backfill-dotenv-markdownlint.md](./2026-04-17-backfill-dotenv-markdownlint.md) resolved 2 of them (dotenv, markdownlint-cli). The remaining 2 belong to the Testing section, which is owned by `/pair-capability-assess-testing`:

- `@playwright/test ^1.50.0` — E2E tests in `apps/website/e2e/*.test.ts` (35 passing E2E tests verified via `pnpm --filter @pair/website e2e`)
- `@playwright/experimental-ct-react ^1.50.0` — component tests in `packages/brand/src/**/*.ct.test.tsx`
- `jsdom 25.0.1` — DOM environment for vitest unit tests (`apps/website/vitest.config.ts`, `packages/brand/vitest.config.ts`)

All three are in active use with passing suites; the gap was purely documentation.

## Decision

Add the following entries to the Testing section of `adoption/tech/tech-stack.md`:

- `jsdom v25.0.1` — DOM environment for vitest unit tests in React/UI workspaces
- `@playwright/test ^1.50.0` — E2E tests
- `@playwright/experimental-ct-react ^1.50.0` — component tests

The already-adopted `@axe-core/playwright v4.11.1` was a dangling reference to Playwright without Playwright itself being documented — this backfill closes that gap.

## Alternatives Considered

- **Remove Playwright + jsdom from catalog**: Rejected. Playwright E2E is a required custom quality gate (`way-of-working.md`); jsdom is required for vitest unit tests in `apps/website/` and `packages/brand/`.
- **Defer indefinitely**: Rejected. `/pair-capability-verify-adoption` would keep re-flagging on every review.
- **Merge with dotenv/markdownlint ADL**: Rejected. Section ownership boundaries (`assess-stack` vs `assess-testing`) make splitting the records cleaner for future audits.

## Consequences

- `adoption/tech/tech-stack.md` Testing section now reflects the actual Playwright + jsdom usage.
- `/pair-capability-verify-adoption` should report all 4 previous non-conformities resolved on next invocation.
- Future Playwright/jsdom version bumps go through `/pair-capability-assess-testing` per the version tracking policy.

## Adoption Impact

- `adoption/tech/tech-stack.md` Testing section: 3 entries added (jsdom, @playwright/test, @playwright/experimental-ct-react).
- No code changes.
