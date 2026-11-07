import { describe, it, expect } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parseTests, gateViolations, buildInventory } from './inventory'

const F = 'packages/a/src/x.test.ts'
const SKIP = 'skip'
const ONLY = 'only'

const one = (src: string) => {
  const r = parseTests(F, src)
  return { r, g: gateViolations(r) }
}

describe('r0-1 trailing timeout argument', () => {
  it('w-r0-1a counts expects when a numeric timeout trails the callback', () => {
    const { r, g } = one(`it('x', () => { expect(1).toBe(1) }, 10_000)`)
    expect(r[0].assertions).toBe(1)
    expect(g.G1).toEqual([])
  })
  it('w-r0-1b counts every expect of an async test with timeout', () => {
    const { r, g } = one(
      `it('g2-w1', async () => { expect(a).toBe(1); expect(b).toBe(2); expect(c).toBe(3) }, 60_000)`,
    )
    expect(r[0].assertions).toBe(3)
    expect(g.G1).toEqual([])
  })
  it('w-r0-1c counts expect.hasAssertions as an assertion signal', () => {
    const { r, g } = one(`it('x', async () => { expect.hasAssertions(); await run() })`)
    expect(r[0].assertions).toBeGreaterThanOrEqual(1)
    expect(g.G1).toEqual([])
  })
  it('w-r0-1d counts expect.assertions as an assertion signal', () => {
    const { r } = one(`it('x', () => { expect.assertions(1); run() })`)
    expect(r[0].assertions).toBeGreaterThanOrEqual(1)
  })
})

describe('r0-2 skip/only propagation', () => {
  it('w-r0-2a describe skip makes children skipped and G2, not G1', () => {
    const { r, g } = one(`describe.${SKIP}('s', () => { it('i', () => { expect(1).toBe(1) }) })`)
    expect(r[0].skipped).toBe(true)
    expect(g.G2).toEqual([r[0].test_id])
    expect(g.G1).toEqual([])
  })
  it('w-r0-2b describe only makes children focused and G2', () => {
    const { r, g } = one(`describe.${ONLY}('s', () => { it('i', () => { expect(1).toBe(1) }) })`)
    expect(r[0].focused).toBe(true)
    expect(g.G2).toEqual([r[0].test_id])
  })
  it('w-r0-2c describe skipIf makes children skipped and G2', () => {
    const { r, g } = one(
      `describe.skipIf(cond)('s', () => { it('i', () => { expect(1).toBe(1) }) })`,
    )
    expect(r[0].skipped).toBe(true)
    expect(g.G2).toEqual([r[0].test_id])
  })
  it('w-r0-2d it skipIf is flagged skipped and G2', () => {
    const { r, g } = one(`it.skipIf(cond)('i', () => { expect(1).toBe(1) })`)
    expect(r[0].skipped).toBe(true)
    expect(g.G2).toEqual([r[0].test_id])
  })
  it('w-r0-2e it runIf is flagged skipped and G2', () => {
    const { r, g } = one(`it.runIf(cond)('i', () => { expect(1).toBe(1) })`)
    expect(r[0].skipped).toBe(true)
    expect(g.G2).toEqual([r[0].test_id])
  })
  it('w-r0-2f nested skip propagates through an inner describe', () => {
    const { r } = one(
      `describe.${SKIP}('a', () => { describe('b', () => { it('i', () => { expect(1).toBe(1) }) }) })`,
    )
    expect(r[0].skipped).toBe(true)
  })
})

describe('r0-3 tagged templates and test.describe', () => {
  it('w-r0-3a tagged it.each yields one parametrized record', () => {
    const { r } = one("it.each`a|b\n${1}|${2}`('tagged', ({a}) => { expect(a).toBe(1) })")
    expect(r).toHaveLength(1)
    expect(r[0].parametrized).toBe(true)
    expect(r[0].assertions).toBe(1)
  })
  it('w-r0-3b test.describe contributes the suite path to ids', () => {
    const { r } = one(`test.describe('suite', () => { test('t', () => { expect(1).toBe(1) }) })`)
    expect(r).toHaveLength(1)
    expect(r[0].test_id).toBe(`${F}::suite > t`)
  })
  it('w-r0-3c interaction: test.describe skip propagates to children', () => {
    const { r } = one(
      `test.describe.${SKIP}('suite', () => { test('t', () => { expect(1).toBe(1) }) })`,
    )
    expect(r).toHaveLength(1)
    expect(r[0].test_id).toBe(`${F}::suite > t`)
    expect(r[0].skipped).toBe(true)
  })
  it('w-r0-3d interaction: tagged it.each with trailing timeout counts expects', () => {
    const { r, g } = one("it.each`a\n${1}`('t', ({a}) => { expect(a).toBe(1) }, 5000)")
    expect(r).toHaveLength(1)
    expect(r[0].assertions).toBe(1)
    expect(g.G1).toEqual([])
  })
})

describe('r0-1 callback position classes', () => {
  it('w-r0-1f function-expression callback with trailing timeout counted', () => {
    const { r } = one(`it('x', function () { expect(1).toBe(1) }, 10_000)`)
    expect(r[0].assertions).toBe(1)
  })
})

describe('r0-2 more skip/only classes', () => {
  it('w-r0-2g describe runIf makes children skipped and G2', () => {
    const { r, g } = one(
      `describe.runIf(cond)('s', () => { it('i', () => { expect(1).toBe(1) }) })`,
    )
    expect(r[0].skipped).toBe(true)
    expect(g.G2).toEqual([r[0].test_id])
  })
  it('w-r0-2h it skip inside describe only is skipped and focused, G2', () => {
    const { r, g } = one(
      `describe.${ONLY}('s', () => { it.${SKIP}('i', () => { expect(1).toBe(1) }) })`,
    )
    expect(r[0].skipped).toBe(true)
    expect(r[0].focused).toBe(true)
    expect(g.G2).toEqual([r[0].test_id])
  })
})

describe('r0-3 more test.describe forms and buildInventory', () => {
  it('w-r0-3e test.describe.serial contributes the suite path', () => {
    const { r } = one(
      `test.describe.serial('suite', () => { test('t', () => { expect(1).toBe(1) }) })`,
    )
    expect(r).toHaveLength(1)
    expect(r[0].test_id).toBe(`${F}::suite > t`)
  })
  it('w-r0-3f buildInventory reconciles tagged each + timeout + describe skip', () => {
    const root = mkdtempSync(join(tmpdir(), 'inv-'))
    try {
      mkdirSync(join(root, 'p'))
      writeFileSync(
        join(root, 'p', 'a.test.ts'),
        `describe.${SKIP}('s', () => {\n  it.each\`a\n\${1}\`('t', ({ a }) => { expect(a).toBe(1) }, 5000)\n})\n`,
      )
      const inv = buildInventory(root, ['p/a.test.ts'])
      expect(inv.total).toBe(1)
      expect(inv.gates.G1).toEqual([])
      expect(inv.gates.G2).toHaveLength(1)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})
