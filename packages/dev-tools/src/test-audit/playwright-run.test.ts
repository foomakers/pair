import { describe, it, expect } from 'vitest'

import { parseReport, totals, TARGETS } from './playwright-run'

const report = {
  suites: [
    {
      specs: [
        {
          title: 'top',
          file: 'e2e/a.e2e.test.ts',
          tests: [{ status: 'expected', results: [{ duration: 10.4 }] }],
        },
      ],
      suites: [
        {
          specs: [
            {
              title: 'flaky one',
              file: 'e2e/a.e2e.test.ts',
              tests: [{ status: 'flaky', results: [{ duration: 5 }, { duration: 6 }] }],
            },
            {
              title: 'broken',
              file: 'e2e/a.e2e.test.ts',
              tests: [{ status: 'unexpected', results: [{ duration: 1 }] }],
            },
            {
              title: 'off',
              file: 'e2e/a.e2e.test.ts',
              tests: [{ status: 'skipped', results: [] }],
            },
          ],
        },
      ],
    },
  ],
}

describe('playwright run report', () => {
  const target = { name: 'site-e2e', cwd: 'apps/site', args: [] }
  const rows = parseReport(target, report)

  it('flattens nested suites into one row per test with repo-relative paths', () => {
    expect(rows.map(r => [r.file, r.name, r.status, r.ms])).toEqual([
      ['apps/site/e2e/a.e2e.test.ts', 'top', 'passed', 10],
      ['apps/site/e2e/a.e2e.test.ts', 'flaky one', 'flaky', 11],
      ['apps/site/e2e/a.e2e.test.ts', 'broken', 'failed', 1],
      ['apps/site/e2e/a.e2e.test.ts', 'off', 'skipped', 0],
    ])
  })

  it('totals per target', () => {
    expect(totals(rows)['site-e2e']).toEqual({
      tests: 4,
      passed: 1,
      failed: 1,
      flaky: 1,
      skipped: 1,
      ms: 22,
    })
  })

  it('covers the gate suites with the same exclusions as the package scripts', () => {
    expect(TARGETS.map(t => t.name)).toEqual(['brand-ct', 'website-ct', 'website-e2e'])
    expect(TARGETS[0]?.args).toContain('@a11y-report')
    expect(TARGETS[2]?.args).not.toContain('--grep-invert')
  })
})
