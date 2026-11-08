import { describe, it, expect } from 'vitest'

import { MODULES, fromMutation, fromPlaywright, parseArgs } from './redundancy'

describe('redundancy report', () => {
  it('flattens mutation candidates and Playwright redundant tests into one list', () => {
    const m = fromMutation({
      module: 'packages/x',
      mutate: [],
      score: 50,
      mutants: {},
      tests: [],
      candidates: [
        {
          file: 'a.test.ts',
          name: 'n',
          covered: 3,
          kills: 0,
          uniqueKills: 0,
          class: 'never-kills',
        },
      ],
    })
    const p = fromPlaywright([
      {
        file: 'apps/w/e2e/a.test.ts',
        name: 'dup',
        tokens: 2,
        class: 'redundant',
        containedIn: 'apps/w/e2e/a.test.ts::big',
      },
      { file: 'apps/w/e2e/a.test.ts', name: 'big', tokens: 5, class: 'effective' },
      { file: 'apps/w/e2e/b.test.ts', name: 'x', tokens: 0, class: 'no-signal' },
    ])
    expect([...m, ...p].map(c => [c.source, c.module, c.name, c.class])).toEqual([
      ['mutation', 'packages/x', 'n', 'never-kills'],
      ['playwright-fingerprint', 'apps/w', 'dup', 'redundant'],
    ])
  })

  it('defaults to every vitest package and one configurable output file', () => {
    const o = parseArgs([], '/r')
    expect([o.out, o.modules, o.skipMutation]).toEqual([
      '/r/test-audit/redundancy/report.json',
      MODULES,
      false,
    ])
    const c = parseArgs(['--out', 'x/y.json', '--modules', 'a,b', '--skip-playwright'], '/r')
    expect([c.out, c.modules, c.skipPlaywright]).toEqual(['/r/x/y.json', ['a', 'b'], true])
  })
})
