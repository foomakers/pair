import { describe, expect, it } from 'vitest'
import { expand } from '.'
import { assignmentFor } from '../grammar'

const run = (caller: string, steps: string, outputs = '') => {
  const root = {
    file: 'root.yaml',
    text: `version: 1\nname: root\nsteps:\n  call: { ${caller}, uses: shared }\n`,
  }
  const shared = {
    file: 'shared.yaml',
    text: `version: 1\nname: shared\nsteps:\n${steps}\n${outputs}`,
  }
  return expand(root, name => (name === 'shared' ? shared : undefined))
}

describe('include caller contract (AC-2, AC-3)', () => {
  it('forwards options to the selected output and failure routing to the last step', () => {
    const result = run(
      'kind: fix, with: { gates: [quality-gate] }, on-failed: stop',
      '  work: { kind: fix }\n  finish: { kind: generic, skill: finish }',
      'outputs: { from: work }',
    )
    expect(result.errors).toEqual([])
    expect(result.workflow?.steps[0]?.with).toEqual({ gates: ['quality-gate'] })
    expect(result.workflow?.steps[1]?.['on-failed']).toBe('stop')
  })

  it('rebases the resume route of an included workflow (#726)', () => {
    const result = run(
      'kind: generic',
      `  review: { kind: review }
  gate: { kind: gate, on-resume: { reason: head-changed, step: review } }`,
    )
    expect(result.errors).toEqual([])
    expect(result.workflow?.steps[1]).toMatchObject({
      id: 'call/gate',
      'on-resume': { reason: 'head-changed', step: 'call/review' },
    })
  })

  it('accepts the last step as the default output', () => {
    expect(run('kind: fix', '  work: { kind: fix }').errors).toEqual([])
  })

  it('rejects an incompatible selected output for a typed caller', () => {
    expect(run('kind: fix', '  work: { kind: generic, skill: x }').errors.length).toBeGreaterThan(0)
  })

  it('allows a generic caller with an incompatible output', () => {
    expect(run('kind: generic', '  work: { kind: fix }').errors).toEqual([])
  })

  it.each([
    'context: [story]',
    'prompt: hello',
    'interactive: true',
    'gates: [quality-gate]',
    'state: none',
    'on-resume: { reason: head-moved, step: prior }',
  ])('rejects caller %s', option => {
    expect(run(`kind: fix, ${option}`, '  work: { kind: fix }').errors.length).toBeGreaterThan(0)
  })

  it('rejects with when the selected step has a different kind', () => {
    expect(
      run('kind: fix, with: { gates: [quality-gate] }', '  work: { kind: generic, skill: x }')
        .errors.length,
    ).toBeGreaterThan(0)
  })
})

describe('#723 assignment through an include (AC-6, AC-8)', () => {
  it.each([
    ['included workflow', '', 'bot-pair'],
    ['caller', ', assign: me', 'me'],
  ])('preserves leaf overrides over the %s default', (_source, override, expected) => {
    const root = {
      file: 'root.yaml',
      text: `version: 1
name: root
assign: mallory
steps:
  call: { kind: generic, uses: shared${override} }
`,
    }
    const shared = {
      file: 'shared.yaml',
      text: `version: 1
name: shared
assign: bot-pair
steps:
  build: { kind: implement }
  review: { kind: review, assign: alice }
`,
    }
    const result = expand(root, name => (name === 'shared' ? shared : undefined))
    expect(result.errors).toEqual([])
    const workflow = result.workflow!
    expect(workflow.steps.map(step => [step.id, assignmentFor(workflow, step)?.value])).toEqual([
      ['call/build', expected],
      ['call/review', 'alice'],
    ])
  })
})
