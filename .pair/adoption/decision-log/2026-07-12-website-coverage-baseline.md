# Decision: Website coverage threshold is a realistic baseline, not 80%

## Date

2026-07-12

## Status

Active

## Category

Process Decision

## Context

Story #199 (tech-debt ledger), finding P1.2, asked to add 80% coverage
thresholds to `apps/website` and `packages/brand` vitest configs to match the
`@pair/content-ops` bar.

`packages/brand` measures 84.5% lines with the dev harness included (its
`dev/App.tsx` is unit-tested at 100%), so it takes the 80% gate cleanly.

`apps/website` measures ~9.9% lines. It is a Next.js documentation app whose
behavior is validated primarily by Playwright component (`ct`) and end-to-end
(`e2e`) suites, not by jsdom unit tests. Forcing an 80% unit-coverage gate would
either break `pnpm --filter @pair/website test:coverage` (and CI once wired) or
push low-value unit tests onto UI already covered by e2e.

Note: the quality-gate command runs `test`, not `test:coverage`, so these
thresholds bite only on explicit coverage runs / trend tracking — they do not
gate normal PRs.

## Decision

- `packages/brand`: 80% global thresholds (lines/statements/functions/branches).
- `apps/website`: realistic baseline floors instead of 80% —
  lines 9, statements 9, functions 40, branches 60 — set just below current
  measured coverage (9.9 / 9.9 / 47.2 / 66.2). These catch regressions without
  mandating unit tests for e2e-covered UI.
- A committed baseline (`reports/coverage-baseline.json`, P1.4) records current
  totals for all three packages for trend tracking. Raise the website floors
  toward the 80% target as unit coverage of testable (non-page) modules grows.

## Alternatives Considered

- **Force 80% on website now**: rejected — breaks the coverage command and
  incentivizes low-value unit tests over the existing Playwright coverage.
- **No threshold on website**: rejected — loses regression protection; a floor
  at current level is cheap and meaningful.
- **Count only shipped code on brand (exclude dev/)**: rejected — brand's
  dev harness is genuinely unit-tested (`dev/App.test.tsx`), so including it
  reflects real coverage; excluding it understates brand at 76.8%.

## Consequences

- `apps/website/vitest.config.ts` and `packages/brand/vitest.config.ts` gain a
  `coverage` block extending `coverageConfigDefaults.exclude`, emitting a
  `json-summary` reporter, with the thresholds above.
- `reports/coverage-baseline.json` is the committed trend baseline.
- Website's floor is a debt marker, not the target; revisit when raising it.

## Adoption Impact

- No change to `adoption/tech/tech-stack.md` (vitest + @vitest/coverage-v8
  already adopted). This ADL is the record of the per-package threshold policy.
