import { describe, it, expect } from 'vitest'
import { createPerimeter, describePerimeter, type PerimeterInput } from './perimeter'

const base: PerimeterInput = {
  cwd: '/project',
  cwdDeclared: false,
  policyCap: 20,
  invocationKind: 'skill',
}

describe('createPerimeter', () => {
  it('refuses to build without any scope, with an actionable message (AC5)', () => {
    expect(() => createPerimeter(base)).toThrow(/No work perimeter declared/)
    expect(() => createPerimeter(base)).toThrow(/--root <id> and\/or --filter <tag>/)
  })

  it('accepts a root alone', () => {
    expect(createPerimeter({ ...base, root: '212' }).root).toBe('212')
  })

  it('accepts a filter alone, recording that the flag declared it', () => {
    const perimeter = createPerimeter({ ...base, filter: 'risk:green' })

    expect(perimeter.filter).toBe('risk:green')
    expect(perimeter.filterSource).toBe('--filter')
  })

  it("borrows the policy's eligibility label when no --filter is passed", () => {
    const perimeter = createPerimeter({ ...base, eligibility: 'risk:green' })

    expect(perimeter.filter).toBe('risk:green')
    expect(perimeter.filterSource).toBe('tech/automation.md')
  })

  it('lets --filter win over the policy label without widening anything', () => {
    const perimeter = createPerimeter({ ...base, filter: 'risk:green', eligibility: 'risk:yellow' })

    expect(perimeter.filter).toBe('risk:green')
    expect(perimeter.filterSource).toBe('--filter')
  })

  it('requires an explicit --cwd for a --prompt run, which carries no scope parameters', () => {
    expect(() => createPerimeter({ ...base, invocationKind: 'prompt' })).toThrow(
      /--prompt run cannot carry scope parameters/,
    )
    expect(createPerimeter({ ...base, invocationKind: 'prompt', cwdDeclared: true }).cwd).toBe(
      '/project',
    )
  })

  it('narrows the policy cap with --max-iterations', () => {
    const perimeter = createPerimeter({ ...base, root: '212', requestedCap: 3 })

    expect(perimeter.maxIterations).toBe(3)
    expect(perimeter.capSource).toBe('--max-iterations')
  })

  it('never lets a flag widen the policy cap', () => {
    const perimeter = createPerimeter({ ...base, root: '212', requestedCap: 100 })

    expect(perimeter.maxIterations).toBe(20)
    expect(perimeter.capSource).toBe('tech/automation.md')
  })

  it('keeps the boundary value: a flag equal to the policy cap reports the policy', () => {
    expect(createPerimeter({ ...base, root: '212', requestedCap: 20 }).capSource).toBe(
      'tech/automation.md',
    )
  })

  it.each([0, -1, 1.5, Number.NaN])('rejects an invalid policy cap %s', cap => {
    expect(() => createPerimeter({ ...base, root: '212', policyCap: cap })).toThrow(
      /Invalid iteration cap from the automation policy/,
    )
  })
})

describe('describePerimeter', () => {
  it('states scope, cwd and cap with their sources', () => {
    const perimeter = createPerimeter({
      ...base,
      root: '212',
      eligibility: 'risk:green',
      requestedCap: 2,
    })

    expect(describePerimeter(perimeter)).toBe(
      'Perimeter: root 212, filter risk:green (from tech/automation.md) · cwd /project · max 2 iteration(s) (from --max-iterations)',
    )
  })

  it('says so when a prompt run is bounded by its directory alone', () => {
    const perimeter = createPerimeter({
      ...base,
      invocationKind: 'prompt',
      cwdDeclared: true,
      requestedCap: 1,
    })

    expect(describePerimeter(perimeter)).toContain('cwd only (--prompt run)')
  })
})
