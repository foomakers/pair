import { describe, it, expect } from 'vitest'

import { parseTests } from './inventory'

const one = (src: string) => parseTests('packages/a/src/x.test.ts', src)[0]!

describe('assertions delegated to helpers (U2 must not flag them)', () => {
  it('counts assertions inside a same-file helper function the test calls', () => {
    const r = one(`function check2(v) { expect(v).toBe(1) }
      it('t', () => { check2(1) })`)
    expect(r.assertions).toBe(1)
  })
  it('follows helper arrow functions transitively and survives recursion', () => {
    const r = one(`const a = (v) => { b(v); a(v) }
      const b = (v) => { expect(v).toBe(1) }
      it('t', () => { a(1) })`)
    expect(r.assertions).toBe(1)
  })
  it('counts assertion-named imported helpers (expectX, assertX, checkX)', () => {
    expect(one(`it('t', () => { expectNoViolations(page) })`).assertions).toBe(1)
    expect(one(`it('t', () => { assertShape(x) })`).assertions).toBe(1)
    expect(one(`it('t', () => { checkA11y(page) })`).assertions).toBe(1)
  })
  it('does not count ordinary calls that merely start with the same letters', () => {
    expect(one(`it('t', () => { checkout(); shoulder(); expected(1) })`).assertions).toBe(0)
  })
  it('a test calling only non-asserting helpers stays at 0', () => {
    const r = one(`function setup() { return 1 }
      it('t', () => { setup() })`)
    expect(r.assertions).toBe(0)
  })
})
