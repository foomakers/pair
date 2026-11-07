import { execFileSync } from 'child_process'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { describe, it, expect, vi } from 'vitest'
import * as inv from './inventory'

type Policy = { maxMockAssertionRatio: number }
type Api = {
  loadPolicy: (file: string) => Policy
  gateViolations: (r: inv.TestRecord[], p: Policy) => { G1: string[]; U4: string[] }
}
const api = inv as unknown as Api
const POLICY_REL = 'docs/testing/test-policy.config.json'
const TEST_REL = 'packages/a/src/x.test.ts'
// 3 mocks / 1 assertion => ratio 3
const SRC = `it('three mocks', () => { vi.fn(); vi.fn(); vi.fn(); expect(1).toBe(1) })`

const makeRoot = (config: unknown): string => {
  const root = mkdtempSync(join(tmpdir(), 'tpc-'))
  mkdirSync(join(root, 'docs/testing'), { recursive: true })
  mkdirSync(join(root, 'packages/a/src'), { recursive: true })
  writeFileSync(join(root, POLICY_REL), JSON.stringify(config))
  writeFileSync(join(root, TEST_REL), SRC)
  return root
}
const cfgFile = (config: unknown): string => join(makeRoot(config), POLICY_REL)
const rec = (mocks: number, assertions: number, skipped = false): inv.TestRecord => ({
  ...inv.parseTests(TEST_REL, SRC)[0],
  mocks,
  assertions,
  skipped,
})
const u4 = (ratio: number, r: inv.TestRecord): string[] =>
  api.gateViolations([r], api.loadPolicy(cfgFile({ maxMockAssertionRatio: ratio }))).U4

describe('policy config on the audit path (r0-4)', () => {
  it('w-r0-4d buildInventory(root) reads <root>/docs/testing/test-policy.config.json: U4 flips with the threshold', () => {
    const lo = inv.buildInventory(makeRoot({ maxMockAssertionRatio: 1 }), [TEST_REL])
    const hi = inv.buildInventory(makeRoot({ maxMockAssertionRatio: 5 }), [TEST_REL])
    expect((lo.gates as { U4?: string[] }).U4).toEqual([lo.tests[0].test_id])
    expect((hi.gates as { U4?: string[] }).U4).toEqual([])
  })
  it('w-r0-4e main(root) writes test-audit/inventory.json whose U4 follows the root config', () => {
    const run = (ratio: number): { U4?: string[] } => {
      const root = makeRoot({ maxMockAssertionRatio: ratio })
      execFileSync('git', ['init', '-q'], { cwd: root })
      execFileSync('git', ['add', '-A'], { cwd: root })
      const log = vi.spyOn(console, 'log').mockImplementation(() => undefined)
      try {
        inv.main(root)
      } finally {
        log.mockRestore()
      }
      return JSON.parse(readFileSync(join(root, 'test-audit/inventory.json'), 'utf8')).gates
    }
    expect(run(1).U4).toHaveLength(1)
    expect(run(5).U4).toEqual([])
  })
  it('w-r0-4f no mocks never violates U4 (assertions 3 and 0), even at ratio 0', () => {
    expect(typeof api.loadPolicy).toBe('function')
    expect(u4(0, rec(0, 3))).toEqual([])
    expect(u4(0, rec(0, 0))).toEqual([])
  })
  it('w-r0-4g loadPolicy throws on a missing file and on a non-numeric ratio', () => {
    expect(typeof api.loadPolicy).toBe('function')
    const missing = join(makeRoot({}), 'absent.json')
    expect(() => api.loadPolicy(missing)).toThrow(Error)
    expect(() => api.loadPolicy(cfgFile({ maxMockAssertionRatio: '2' }))).toThrow(Error)
    expect(() => api.loadPolicy(cfgFile({}))).toThrow(Error)
  })
  it('w-r0-4i U4 ignores skip: skipped mocks>assertions is U4, not G1; unskipped zero-assertion mocks are both', () => {
    const p = api.loadPolicy(cfgFile({ maxMockAssertionRatio: 2 }))
    const skipped = rec(3, 0, true)
    const live = rec(3, 0)
    const g = api.gateViolations([skipped, live], p)
    expect(g.U4).toEqual([skipped.test_id, live.test_id].sort())
    expect(g.G1).toEqual([live.test_id])
  })
  it('w-r0-4h the consumer module names the same config file the doc names', () => {
    const src = readFileSync(join(__dirname, 'inventory.ts'), 'utf8')
    expect(src).toContain('test-policy.config.json')
  })
})
