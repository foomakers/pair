import { describe, it, expect } from 'vitest'
import { parseTests, summarize, gateViolations, levelOf, moduleOf } from './inventory'

const src = `
describe('billing', () => {
  describe('total', () => {
    it('applies discount', () => { expect(1).toBe(1); expect(2).toBe(2) })
    it('logs only', () => { console.log('x') })
    it.skip('skipped', () => { expect(1).toBe(1) })
    it.only('focused', () => { expect(1).toBe(1) })
    it.each([1, 2])('param %s', n => { expect(n).toBeTruthy() })
    it('mocks', () => { const f = vi.fn(); f(); expect(f).toHaveBeenCalled() })
  })
})
it('applies discount', () => { expect(1).toBe(1) })
it('applies discount', () => { expect(1).toBe(1) })
`

describe('parseTests', () => {
  const r = parseTests('packages/a/src/x.test.ts', src)
  const by = (s: string) => r.find(t => t.test_id.endsWith(s))!

  it('builds stable ids with describe path and disambiguates duplicates', () => {
    expect(by('billing > total > applies discount').assertions).toBe(2)
    expect(r.map(t => t.test_id)).toContain('packages/a/src/x.test.ts::applies discount#2')
  })
  it('flags zero assertions, skip, only, parametrized, mocks', () => {
    expect(by('logs only').assertions).toBe(0)
    expect(by('skipped').skipped).toBe(true)
    expect(by('focused').focused).toBe(true)
    expect(by('param %s').parametrized).toBe(true)
    expect(by('mocks').mocks).toBe(1)
  })
  it('marks runner signals not measured, never estimated', () => {
    expect(by('logs only').duration_ms_median).toBe('not measured')
  })
  it('reconciles counts and gate violations', () => {
    expect(summarize(r)['packages/a'].unit).toBe(r.length)
    const g = gateViolations(r)
    expect(g.G1).toHaveLength(1)
    expect(g.G2).toHaveLength(2)
  })
})

describe('level/module', () => {
  it.each([
    ['apps/website/e2e/a.spec.ts', 'e2e', 'apps/website'],
    ['packages/x/test/integration/a.test.ts', 'integration', 'packages/x'],
    ['.claude/workflows/a.test.mjs', 'unit', '.claude/workflows'],
    ['qa/a.test.mjs', 'unit', 'qa'],
  ])('%s', (f, l, m) => {
    expect(levelOf(f)).toBe(l)
    expect(moduleOf(f)).toBe(m)
  })
})
