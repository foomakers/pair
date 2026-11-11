import { describe, it, expect } from 'vitest'

import { analyze, buildConfig, mergeSummaries, parseArgs, type StrykerReport } from './mutation'

const report: StrykerReport = {
  files: {
    'src/a.ts': {
      mutants: [
        { status: 'Killed', coveredBy: ['1', '2', '3'], killedBy: ['1', '2'] },
        { status: 'Killed', coveredBy: ['1', '3'], killedBy: ['1'] },
        { status: 'Survived', coveredBy: ['3'] },
        { status: 'Ignored' },
      ],
    },
  },
  testFiles: {
    'src/a.test.ts': {
      tests: [
        { id: '1', name: 'unique killer' },
        { id: '2', name: 'shares its only kill' },
        { id: '3', name: 'covers but kills nothing' },
        { id: '4', name: 'touches nothing mutated' },
      ],
    },
  },
}

describe('mutation analysis', () => {
  const s = analyze(report, 'packages/x', ['src/a.ts'])
  it('classifies every test by its kills inside the mutated scope', () => {
    expect(s.tests.map(t => [t.name, t.class, t.kills, t.uniqueKills])).toEqual([
      ['unique killer', 'effective', 2, 1],
      ['shares its only kill', 'redundant', 1, 0],
      ['covers but kills nothing', 'never-kills', 0, 0],
      ['touches nothing mutated', 'out-of-scope', 0, 0],
    ])
  })
  it('lists only never-kills and redundant tests as cleanup candidates', () => {
    expect(s.candidates.map(t => t.name)).toEqual([
      'shares its only kill',
      'covers but kills nothing',
    ])
  })
  it('scores detected over judged mutants, ignoring Ignored', () => {
    expect([s.score, s.mutants]).toEqual([66.67, { Killed: 2, Survived: 1, Ignored: 1 }])
  })
})

describe('mutation options', () => {
  it('requires --module and defaults the output under test-audit/mutation', () => {
    expect(() => parseArgs([], '/r')).toThrow(/usage/)
    const o = parseArgs(['--module', 'packages/x', '--mutate', 'a,b', '--incremental'], '/r')
    expect([o.out, o.mutate, o.incremental]).toEqual([
      '/r/test-audit/mutation/x.json',
      ['a', 'b'],
      true,
    ])
  })
  it('honours --out and builds a config that disables bail for full kill sets', () => {
    const o = parseArgs(['--module', 'packages/x', '--out', 'o/y.json'], '/r')
    const c = buildConfig(o, '/raw.json', '/tmp')
    expect([o.out, c['disableBail'], c['coverageAnalysis'], c['mutate']]).toEqual([
      '/r/o/y.json',
      true,
      'perTest',
      undefined,
    ])
  })
})

describe('mutation slices', () => {
  const row = (
    name: string,
    cls: 'effective' | 'redundant' | 'never-kills' | 'out-of-scope',
    kills = 0,
  ) => ({
    file: 'a.test.ts',
    name,
    covered: cls === 'out-of-scope' ? 0 : 2,
    kills,
    uniqueKills: cls === 'effective' ? kills : 0,
    class: cls,
  })
  const part = (mutants: Record<string, number>, ...tests: ReturnType<typeof row>[]) => ({
    module: 'm',
    mutate: ['x'],
    score: null,
    mutants,
    tests,
    candidates: [],
  })

  it('keeps the strongest verdict per test across slices and adds up kills', () => {
    const s = mergeSummaries('m', [
      part(
        { Killed: 3, Survived: 1 },
        row('a', 'never-kills'),
        row('b', 'out-of-scope'),
        row('c', 'redundant', 1),
      ),
      part(
        { Killed: 1, Survived: 1 },
        row('a', 'effective', 2),
        row('b', 'out-of-scope'),
        row('c', 'never-kills'),
      ),
    ])
    expect(s.tests.map(t => [t.name, t.class, t.kills])).toEqual([
      ['a', 'effective', 2],
      ['b', 'out-of-scope', 0],
      ['c', 'redundant', 1],
    ])
    expect(s.candidates.map(t => t.name)).toEqual(['c'])
    expect([s.score, s.mutants]).toEqual([66.67, { Killed: 4, Survived: 2 }])
  })
})
