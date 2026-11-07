import { describe, it, expect } from 'vitest'

import type { Config, Report } from './audit'
import {
  BLOCKING,
  bypassed,
  forbiddenPatterns,
  g1,
  g2,
  g3,
  g4,
  g5,
  g6,
  g7,
  g8,
  optValue,
  parseDiffLines,
  renderGates,
  unsupported,
  verdict,
  type StrykerReport,
} from './gates'
import { parseTests } from './inventory'

const cfg: Config = {
  budgets: {
    unit: { maxTestMs: 100, totalMs: 1000 },
    integration: { maxTestMs: 2000, totalMs: 300000 },
    e2e: { maxTestMs: 30000, totalMs: 900000 },
  },
  maxLevelGrowthPct: 5,
  minMutationScoreOnDiffPct: 80,
  minUniqueKillsPerNewTest: 1,
  flakyRuns: { audit: 10, pr: 3 },
  maxMockAssertionRatio: 2,
  maxSnapshotLines: 3,
  maxTestToCodeRatio: 3,
  rollout: 'block-cheap',
  criticalModules: ['*'],
  repeatedGates: ['implement', 'pre-push', 'review'],
}
const F = 'packages/m/src/x.test.ts'
const recs = (src: string) => parseTests(F, src)

describe('G1/G2', () => {
  it('G1 fails a test without assertions and blocks at block-cheap, not at report-only', () => {
    const r = recs(`it('a', () => {})`)
    expect(g1(r, cfg)).toMatchObject({ status: 'fail', blocking: true, violations: [`${F}::a`] })
    expect(g1(r, { ...cfg, rollout: 'report-only' })).toMatchObject({ status: 'fail', blocking: false })
  })
  it('G1 passes assertions and ignores skipped tests', () => {
    expect(g1(recs(`it('a', () => { expect(1).toBe(1) }); it.skip('b', () => {})`), cfg).status).toBe('pass')
  })
  it('G2 flags skip/only, sleep, print, private spies, oversize inline snapshots', () => {
    const src = `it.skip('s', () => { expect(1).toBe(1) })
it.only('o', () => { expect(1).toBe(1) })
it('p', async () => { await sleep(5); console.log('x'); vi.spyOn(a, '_hidden'); expect(1).toMatchInlineSnapshot(\`a\nb\nc\nd\`) })`
    const out = g2(recs(src), { [F]: src }, cfg).violations.join('\n')
    for (const k of [`${F}::s skip/only`, `${F}::o skip/only`, 'sleep', 'print', 'spy on private _hidden', 'snapshot 4 lines > 3']) expect(out).toContain(k)
  })
  it('G2 exempts quarantined ids from the skip rule only', () => {
    const src = `it.skip('q', () => { expect(1).toBe(1) })`
    expect(g2(recs(src), { [F]: src }, cfg, [{ id: `${F}::q` }]).status).toBe('pass')
  })
  it('forbiddenPatterns leaves ordinary tests alone', () => {
    expect(forbiddenPatterns(F, `it('a', () => { expect(sleeper).toBe(1) })`, 50)).toEqual([])
  })
})

describe('G3', () => {
  const id = (n: string) => `packages/m/src/${n}.test.ts::t`
  it('flags per-test over budget, level over total, and growth over 5%', () => {
    const v = g3({ [id('a')]: 150, [id('b')]: 900 }, { unit: 900 }, cfg).violations.join('\n')
    expect(v).toContain('150ms > 100ms (unit)')
    expect(v).toContain('unit total 1050ms > 1000ms')
    expect(v).toContain('unit grew 16.7% > 5%')
  })
  it('passes within budget and within growth', () => {
    expect(g3({ [id('a')]: 50 }, { unit: 50 }, cfg).status).toBe('pass')
  })
  it('classifies level from the id path', () => {
    expect(g3({ 'packages/m/e2e/a.test.ts::t': 100 }, undefined, cfg).status).toBe('pass')
  })
})

const stryker = (killedBy: string[][], status = 'Killed'): StrykerReport => ({
  files: {
    'packages/m/src/a.ts': {
      mutants: killedBy.map((k, i) => ({ id: `${i}`, status, location: { start: { line: 10 + i }, end: { line: 10 + i } }, killedBy: k })),
    },
  },
  testFiles: { [F]: { tests: [{ id: 't1', name: 'old' }, { id: 't2', name: 'new' }] } },
})
const diff = parseDiffLines('+++ b/packages/m/src/a.ts\n@@ -1,0 +10,3 @@\n+a\n+b\n+c\n')

describe('G4/G5 (mutation)', () => {
  it('both are `unsupported` — never green, never blocking — without a mutation report', () => {
    expect([g4(undefined, diff, cfg), g5(undefined, diff, [], cfg)].map(r => [r.status, r.blocking])).toEqual([['unsupported', false], ['unsupported', false]])
    expect(g4(undefined, diff, cfg).detail).toContain('Stryker is not a dependency')
  })
  it('G4 scores only mutants on diff lines', () => {
    const rep = stryker([['t1'], ['t1'], ['t1'], ['t1']], 'Killed')
    rep.files['packages/m/src/a.ts']!.mutants[1]!.status = 'Survived'
    rep.files['packages/m/src/a.ts']!.mutants[3]!.status = 'Survived' // line 13: off the diff
    const r = g4(rep, diff, cfg)
    expect(r.violations[0]).toContain('66.7% < 80% (2/3)')
  })
  it('G4 passes at the threshold', () => {
    expect(g4(stryker([['t1'], ['t1'], ['t1']]), diff, cfg).status).toBe('pass')
  })
  it('G5 fails an added test that is never the sole killer of a diff mutant', () => {
    const r = g5(stryker([['t1', 't2'], ['t1']]), diff, [`${F}::new`], cfg)
    expect(r.violations).toEqual([`${F}::new unique_kills=0`])
  })
  it('G5 passes an added test with a unique kill', () => {
    expect(g5(stryker([['t2'], ['t1']]), diff, [`${F}::new`], cfg).status).toBe('pass')
  })
  it('critical-module scoping excludes other modules', () => {
    const only = { ...cfg, criticalModules: ['apps/x'] }
    expect(g4(stryker([['t1']], 'Survived'), diff, only).status).toBe('pass')
  })
})

describe('G6/G7/G8', () => {
  it('G6 needs flakyRuns.pr runs, all green', () => {
    expect(g6([{ a: 'passed' }], cfg).status).toBe('unsupported')
    const runs = [{ a: 'passed' }, { a: 'failed' }, { a: 'passed' }]
    expect(g6(runs, cfg).violations).toEqual(['a 2/3 green'])
    expect(g6(runs.map(() => ({ a: 'passed' })), cfg).status).toBe('pass')
  })
  it('G7 fails above 3:1 test:prod, ignores docs/json, and a justified bypass label clears it', () => {
    const n = `40\t0\tpackages/m/src/a.test.ts\n10\t0\tpackages/m/src/a.ts\n99\t0\tdocs/x.md\n`
    expect(g7(n, cfg).violations).toEqual(['test:prod 40:10 > 3:1'])
    expect(g7(n, cfg, ['gate-bypass:G7: generated fixtures']).status).toBe('pass')
    expect(g7(`30\t0\tpackages/m/src/a.test.ts\n10\t0\tpackages/m/src/a.ts\n`, cfg).status).toBe('pass')
  })
  it('G8 fails only for a new U2/U3 versus the previous audit', () => {
    const rec = (id: string, classes: string[]) => ({ test_id: id, classes }) as Report['records'][number]
    const prev = { records: [rec('old', ['U2'])] } as Report
    const now = { records: [rec('old', ['U2']), rec('new', ['U3']), rec('x', ['U4'])] } as Report
    expect(g8(prev, now, cfg).violations).toEqual(['new U3'])
    expect(g8(undefined, now, cfg).status).toBe('unsupported')
  })
})

describe('rollout and bypass', () => {
  it('block-cheap blocks G1,G2,G3,G6; block-full adds G4,G5,G7,G8; report-only none', () => {
    expect(BLOCKING['report-only']).toEqual([])
    expect(BLOCKING['block-cheap']).toEqual(['G1', 'G2', 'G3', 'G6'])
    expect(BLOCKING['block-full']).toEqual(['G1', 'G2', 'G3', 'G4', 'G5', 'G6', 'G7', 'G8'])
  })
  it('a bypass label needs a reason', () => {
    expect(bypassed('G1', ['gate-bypass:G1: legacy fixture'])).toBe(true)
    expect(bypassed('G1', ['gate-bypass:G1:'])).toBe(false)
    expect(bypassed('G2', ['gate-bypass:G1: x'])).toBe(false)
  })
  it('a bypassed failure is not blocking and is counted', () => {
    const r = g1(recs(`it('a', () => {})`), cfg, ['gate-bypass:G1: legacy'])
    expect(r.status).toBe('pass')
    expect(verdict([r], ['gate-bypass:G1: legacy', 'other'])).toEqual({ exit: 0, bypasses: ['gate-bypass:G1: legacy'] })
  })
  it('exit 1 only on a blocking failure; unsupported gates never block', () => {
    expect(verdict([g1(recs(`it('a', () => {})`), cfg), unsupported('G4', 'x')], []).exit).toBe(1)
    expect(verdict([unsupported('G4', 'x')], []).exit).toBe(0)
  })
  it('renders every gate with its status', () => {
    const md = renderGates([g1(recs(`it('a', () => {})`), cfg), unsupported('G4', 'no tool')], cfg, [])
    expect(md).toContain('| G1 | fail | true | 1 |')
    expect(md).toContain('| G4 | unsupported (no tool) | false | 0 |')
  })
})

describe('parseDiffLines', () => {
  it('collects new-side lines for single-line and ranged hunks', () => {
    const d = parseDiffLines('+++ b/f.ts\n@@ -1 +5 @@\n@@ -9,0 +20,2 @@\n')
    expect([...d['f.ts']!].sort((a, b) => a - b)).toEqual([5, 20, 21])
  })
})

describe('optValue', () => {
  it('returns the value after the flag and undefined when the flag is absent', () => {
    expect(optValue(['--base', 'main', '--g6'], '--base')).toBe('main')
    expect(optValue(['--base', 'main'], '--stryker')).toBeUndefined()
  })
})
