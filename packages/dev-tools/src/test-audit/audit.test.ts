import { describe, it, expect } from 'vitest'

import {
  buildReport,
  classify,
  isProtected,
  loadConfig,
  reconcile,
  renderMarkdown,
  renderRemovalPlan,
  repeatCost,
  total,
  type Config,
} from './audit'
import type { CompactBaseline } from './baseline'
import { parseTests } from './inventory'

const cfg: Config = {
  budgets: {
    unit: { maxTestMs: 100, totalMs: 60000 },
    integration: { maxTestMs: 2000, totalMs: 300000 },
    e2e: { maxTestMs: 30000, totalMs: 900000 },
  },
  maxLevelGrowthPct: 5,
  minMutationScoreOnDiffPct: 80,
  minUniqueKillsPerNewTest: 1,
  flakyRuns: { audit: 10, pr: 5 },
  maxMockAssertionRatio: 2,
  maxSnapshotLines: 50,
  maxTestToCodeRatio: 3,
  rollout: 'report-only',
  criticalModules: ['*'],
  repeatedGates: ['implement', 'pre-push', 'review'],
}
const F = 'packages/m/src/x.test.ts'
const recs = (src: string, file = F) => parseTests(file, src)
const baseline = (tests: Record<string, [number, string]>): CompactBaseline => ({
  tool: { runner: 'r', mutation: 'not measured', per_test_coverage: 'not measured' },
  base_rev: 'rev',
  runs_required: 3,
  packages: { 'packages/m': { runs: [], wall_ms_median: 1, tests } },
})

describe('classify', () => {
  it('U2: zero assertions classifies and removes; one assertion does not', () => {
    const [a, b] = classify(recs(`it('a', () => {}); it('b', () => { expect(1).toBe(1) })`), undefined, cfg)
    expect([a!.classes, a!.action, a!.signals['U2']]).toEqual([['U2'], 'remove', 'assertions=0'])
    expect([b!.classes, b!.action]).toEqual([[], 'keep'])
  })
  it('a protected zero-assertion test is classed but kept', () => {
    const [r] = classify(recs(`it('regression #123 no crash', () => {})`), undefined, cfg)
    expect([r!.classes, r!.protected, r!.action]).toEqual([['U2'], true, 'keep'])
  })
  it('protection covers regression, issue refs, security, contract, requirement, a11y', () => {
    const hits = ['regression x', 'US-12 y', 'fixes #9', 'security z', 'public contract', 'requirement r', 'a11y w']
    expect(hits.map(isProtected)).toEqual(hits.map(() => true))
    expect(isProtected('formats a date')).toBe(false)
  })
  it('U6: status differing across runs classifies; identical runs do not', () => {
    const r = recs(`it('a', () => { expect(1).toBe(1) }); it('b', () => { expect(1).toBe(1) })`)
    const out = classify(r, baseline({ [`${F}::a`]: [1, 'pfp'], [`${F}::b`]: [1, 'ppp'] }), cfg)
    expect([out[0]!.classes, out[0]!.flaky_runs, out[0]!.action]).toEqual([['U6'], '1/3', 'quarantine'])
    expect([out[1]!.classes, out[1]!.flaky_runs]).toEqual([[], '0/3'])
  })
  it('missing runtime data is `not measured`, never a class', () => {
    const [r] = classify(recs(`it('a', () => { expect(1).toBe(1) })`), undefined, cfg)
    expect([r!.duration_ms_median, r!.flaky_runs, r!.classes]).toEqual(['not measured', 'not measured', []])
    expect(r!.unmeasured).toEqual(expect.arrayContaining(['U1', 'U3', 'U5', 'U8', 'U7']))
  })
  it('U4 ratio only nominates; confirmation makes it a class, dismissal records why', () => {
    const src = `it('m', () => { vi.fn(); vi.fn(); vi.fn(); expect(1).toBe(1) })`
    const id = `${F}::m`
    expect(classify(recs(src), undefined, cfg)[0]!.signals['U4-candidate']).toContain('unconfirmed')
    expect(classify(recs(src), undefined, cfg)[0]!.classes).toEqual([])
    const yes = classify(recs(src), undefined, cfg, { [id]: { class: 'U4', verdict: 'confirmed', reason: 'internal' } })
    expect([yes[0]!.classes, yes[0]!.action]).toEqual([['U4'], 'rewrite'])
    const no = classify(recs(src), undefined, cfg, { [id]: { class: 'U4', verdict: 'dismissed', reason: 'boundary' } })
    expect([no[0]!.classes, no[0]!.signals['U4-dismissed']]).toEqual([[], expect.stringContaining('boundary')])
  })
})

describe('reconcile', () => {
  const before = classify(
    [
      ...recs(`it('u', () => {}); it('k', () => { expect(1).toBe(1) })`),
      ...recs(`it('i', () => { expect(1).toBe(1) })`, 'packages/m/src/integration/y.test.ts'),
    ],
    undefined,
    cfg,
  )
  it('counts removed, added and remaining by module and level, and balances', () => {
    const current = [
      ...recs(`it('k', () => { expect(1).toBe(1) }); it('new', () => { expect(1).toBe(1) })`),
      ...recs(`it('i', () => { expect(1).toBe(1) })`, 'packages/m/src/integration/y.test.ts'),
    ]
    const r = reconcile(before, current, [`${F}::k`])
    expect([total(r.before), total(r.removed), total(r.added), total(r.remaining)]).toEqual([3, 1, 1, 3])
    expect(r.removed['packages/m']).toEqual({ unit: 1, integration: 0, e2e: 0 })
    expect(r.remaining['packages/m']).toEqual({ unit: 2, integration: 1, e2e: 0 })
    expect(total(r.rewritten)).toBe(1)
    expect(total(r.unnecessary)).toBe(1)
  })
  it('overlapping classes count a test once in unnecessary', () => {
    const two = classify(recs(`it('x', () => { vi.fn() })`), baseline({ [`${F}::x`]: [1, 'pf'] }), cfg)
    expect(two[0]!.classes).toEqual(['U2', 'U6'])
    expect(total(reconcile(two, recs(`it('x', () => { vi.fn() })`), []).unnecessary)).toBe(1)
  })
})

describe('render', () => {
  const b = recs(`it('u', () => {}); it('regression #5', () => {})`)
  const rep = buildReport('rev', b, b.slice(1), undefined, cfg)
  it('markdown total row matches the reconciliation and states not measured classes', () => {
    const md = renderMarkdown(rep, undefined)
    expect(md).toContain('| **total** | | 2 | 2 | 1 | 1 | 1 | 0 | 0 | 1 | 2 |')
    expect(md).toContain('| U3 | not measured |')
    expect(rep.removed_ids).toEqual([`${F}::u`])
  })
  it('removal plan lists classes safest first and keeps protected tests out of removals', () => {
    const plan = renderRemovalPlan(rep)
    expect(plan.indexOf('## U2')).toBeLessThan(plan.indexOf('## U3'))
    expect(plan.indexOf('## U3')).toBeLessThan(plan.indexOf('## U8'))
    expect(plan).toContain(`- remove \`${F}::u\``)
    expect(plan).toContain(`- protected, kept \`${F}::regression #5\``)
    expect(plan).toContain('not measured: no U3 signal available.')
  })
})

describe('loadConfig', () => {
  it('rejects a non-numeric threshold and an unknown rollout', async () => {
    const { mkdtempSync, writeFileSync } = await import('fs')
    const { tmpdir } = await import('os')
    const { join } = await import('path')
    const dir = mkdtempSync(join(tmpdir(), 'cfg-'))
    const w = (o: object) => {
      writeFileSync(join(dir, 'c.json'), JSON.stringify({ ...cfg, ...o }))
      return join(dir, 'c.json')
    }
    expect(() => loadConfig(w({ maxSnapshotLines: 'x' }))).toThrow('maxSnapshotLines must be a number, got "x"')
    expect(() => loadConfig(w({ rollout: 'now' }))).toThrow('rollout must be')
    expect(loadConfig(w({})).rollout).toBe('report-only')
  })
})

describe('repeatCost (AC6)', () => {
  const b = baseline({})
  b.packages['packages/n'] = { runs: [], wall_ms_median: 4, tests: {} }
  it('multiplies one suite wall time by the repeating stages, derived not measured', () => {
    expect(repeatCost(b, ['implement', 'pre-push', 'review'])).toEqual({ suite_ms: 5, stages: 3, repeated_ms: 15 })
  })
  it('report separates repeat runs from duplicate cases and names the reuse identity', () => {
    const md = renderMarkdown(buildReport('rev', [], [], b, cfg), b, cfg)
    expect(md).toContain('implement, pre-push, review → 3 runs, 15 ms')
    expect(md).toContain('**repeat execution**, not duplicate test cases')
    expect(md).toContain('same evidence identity and custody')
  })
})
