import { describe, expect, it } from 'vitest'
import { expand } from '.'

const source = (name: string, steps: string) => ({
  file: `${name}.yaml`,
  text: `version: 1\nname: ${name}\nsteps:\n${steps}\n`,
})

describe('workflow includes (AC-1)', () => {
  it('expands recursively in order and retains source positions', () => {
    const root = source(
      'root',
      '  before: { kind: generic, skill: x }\n  fix: { kind: generic, uses: shared }\n  after: { kind: generic, skill: x }',
    )
    const shared = source('shared', '  inner: { kind: generic, uses: nested }')
    const nested = source('nested', '  work: { kind: generic, skill: x }')
    const result = expand(root, name => ({ shared, nested })[name])
    expect(result.errors).toEqual([])
    expect(result.workflow?.steps.map(step => step.id)).toEqual([
      'before',
      'fix/inner/work',
      'after',
    ])
    expect(result.origins['fix/inner/work']).toEqual({ file: 'nested.yaml', line: 4 })
  })
})

describe('include limits (AC-4)', () => {
  it('reports the include chain for a cycle', () => {
    const root = source('root', '  again: { kind: generic, uses: root }')
    expect(expand(root, () => root).errors[0]?.problem).toContain('root.yaml')
  })
})
