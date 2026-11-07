import { describe, it, expect } from 'vitest'
import { parseTests, gateViolations } from './inventory'

const F = 'packages/a/src/x.test.ts'
const SKIP = 'skip'
const ONLY = 'only'

const one = (src: string) => {
  const r = parseTests(F, src)
  return { r, g: gateViolations(r) }
}

describe('controls (already correct, must stay)', () => {
  it('c-r0-1a zero-assertion test with timeout stays in G1', () => {
    const { r, g } = one(`it('x', () => { run() }, 10_000)`)
    expect(r[0].assertions).toBe(0)
    expect(g.G1).toEqual([r[0].test_id])
  })
  it('c-r0-1b callback in last position counts expects', () => {
    const { r } = one(`it('x', () => { expect(1).toBe(1); expect(2).toBe(2) })`)
    expect(r[0].assertions).toBe(2)
  })
  it('c-r0-2a plain it skip is skipped and G2', () => {
    const { r, g } = one(`it.${SKIP}('i', () => { expect(1).toBe(1) })`)
    expect(r[0].skipped).toBe(true)
    expect(g.G2).toEqual([r[0].test_id])
  })
  it('c-r0-2b sibling outside a skipped describe is not skipped', () => {
    const { r } = one(
      `describe.${SKIP}('s', () => { it('a', () => { expect(1).toBe(1) }) })\nit('b', () => { expect(1).toBe(1) })`,
    )
    expect(r.find(t => t.test_id.endsWith('::b'))?.skipped).toBe(false)
  })
  it('c-r0-3a array it.each stays one parametrized record', () => {
    const { r } = one(`it.each([1, 2])('p %s', n => { expect(n).toBeTruthy() })`)
    expect(r).toHaveLength(1)
    expect(r[0].parametrized).toBe(true)
  })
  it('c-r0-3b describe path builds ids', () => {
    const { r } = one(`describe('d', () => { it('t', () => { expect(1).toBe(1) }) })`)
    expect(r[0].test_id).toBe(`${F}::d > t`)
  })
  it('c-r0-1c options-object in the middle: callback still counted, not G1', () => {
    const { r, g } = one(`it('x', { timeout: 1 }, () => { expect(1).toBe(1) })`)
    expect(r[0].assertions).toBe(1)
    expect(g.G1).toEqual([])
  })
  it('c-r0-2c plain it only is focused and G2', () => {
    const { r, g } = one(`it.${ONLY}('i', () => { expect(1).toBe(1) })`)
    expect(r[0].focused).toBe(true)
    expect(g.G2).toEqual([r[0].test_id])
  })
  it('c-r0-2d plain Playwright test skip/only forms flagged', () => {
    const { r } = one(
      `test.${SKIP}('a', () => { expect(1).toBe(1) })\ntest.${ONLY}('b', () => { expect(1).toBe(1) })`,
    )
    expect(r[0].skipped).toBe(true)
    expect(r[1].focused).toBe(true)
  })
})
