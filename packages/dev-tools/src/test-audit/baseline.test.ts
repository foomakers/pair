import { describe, it, expect } from 'vitest'

import { aggregate, compact, median, parseVitestJson } from './baseline'

const json = {
  testResults: [
    {
      name: '/r/pkg/a.test.ts',
      assertionResults: [
        { ancestorTitles: ['d'], title: 't', status: 'passed', duration: 4 },
        { ancestorTitles: ['d'], title: 't', status: 'failed', duration: 6 },
      ],
    },
  ],
}

describe('baseline', () => {
  it('maps runner results to inventory ids, numbering repeats', () => {
    expect(parseVitestJson('/r', json)).toEqual({
      'pkg/a.test.ts::d > t': { status: 'passed', duration: 4 },
      'pkg/a.test.ts::d > t#2': { status: 'failed', duration: 6 },
    })
  })
  it('median handles empty, odd and even samples', () => {
    expect([median([]), median([3, 1, 2]), median([1, 2, 3, 10])]).toEqual([0, 2, 2.5])
  })
  it('aggregate keeps statuses per run so divergence is visible', () => {
    const run = (status: string, duration: number) => ({
      seed: 1,
      wall_ms: 1,
      tests: { x: { status, duration } },
    })
    expect(aggregate([run('passed', 1), run('failed', 9), run('passed', 5)]).x).toEqual({
      median_ms: 5,
      statuses: ['passed', 'failed', 'passed'],
    })
  })
})

describe('compact', () => {
  const run = (seed: number, status: string, duration: number) => ({
    seed,
    wall_ms: 10 * seed,
    tests: { x: { status, duration } },
  })
  it('collapses runs to median + status letters, keeps run metadata', () => {
    const c = compact({ p: [run(1, 'passed', 1), run(2, 'failed', 9), run(3, 'passed', 5)] }, 'rev')
    expect(c.packages.p).toEqual({
      runs: [
        { seed: 1, wall_ms: 10 },
        { seed: 2, wall_ms: 20 },
        { seed: 3, wall_ms: 30 },
      ],
      wall_ms_median: 20,
      tests: { x: [5, 'pfp'] },
    })
  })
  it('refuses fewer than the required baseline runs', () => {
    expect(() => compact({ p: [run(1, 'passed', 1)] }, 'rev')).toThrow('p: 1/3 baseline runs')
  })
})
