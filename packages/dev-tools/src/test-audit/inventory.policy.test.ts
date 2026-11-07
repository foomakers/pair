import { mkdtempSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { describe, it, expect } from 'vitest'
import * as inv from './inventory'

type Api = {
  loadPolicy: (file: string) => { maxMockAssertionRatio: number }
  gateViolations: (r: inv.TestRecord[], p: unknown) => { U4: string[] }
}
const api = inv as unknown as Api

const cfg = (ratio: number): string => {
  const file = join(mkdtempSync(join(tmpdir(), 'tp-')), 'test-policy.config.json')
  writeFileSync(file, JSON.stringify({ maxMockAssertionRatio: ratio }))
  return file
}
const rec = (mocks: number, assertions: number): inv.TestRecord => ({
  ...inv.parseTests('packages/a/src/x.test.ts', `it('t', () => { expect(1).toBe(1) })`)[0],
  mocks,
  assertions,
})
const u4 = (ratio: number, r: inv.TestRecord): string[] =>
  api.gateViolations([r], api.loadPolicy(cfg(ratio))).U4

describe('policy config consumer (r0-4)', () => {
  it('w-r0-4a changing maxMockAssertionRatio in the config changes the gate result', () => {
    const r = rec(3, 1)
    expect(u4(1, r)).toEqual([r.test_id])
    expect(u4(5, r)).toEqual([])
  })
  it('w-r0-4b loadPolicy returns the value from the given file', () => {
    expect(api.loadPolicy(cfg(7)).maxMockAssertionRatio).toBe(7)
  })
  it('w-r0-4c boundary: equal passes, above fails, mocks without assertions fail', () => {
    expect(u4(2, rec(2, 1))).toEqual([])
    const above = rec(3, 1)
    expect(u4(2, above)).toEqual([above.test_id])
    const none = rec(1, 0)
    expect(u4(2, none)).toEqual([none.test_id])
  })
})
