import { expect, it } from 'vitest'
import { expand } from '.'

it('selects the output of a nested include (AC-2)', () => {
  const sources: Record<string, string> = {
    root: 'version: 1\nname: root\nsteps:\n  outer: { kind: fix, uses: shared }\n',
    shared:
      'version: 1\nname: shared\noutputs: { from: inner }\nsteps:\n  inner: { kind: fix, uses: leaf }\n',
    leaf: 'version: 1\nname: leaf\nsteps:\n  work: { kind: fix }\n',
  }
  const result = expand({ file: 'root.yaml', text: sources.root! }, name =>
    sources[name] ? { file: `${name}.yaml`, text: sources[name]! } : undefined,
  )
  expect(result.errors).toEqual([])
  expect(result.workflow?.steps.map(step => step.id)).toEqual(['outer/inner/work'])
})

it('rebases loop references and binds typed caller outputs (INC-02)', () => {
  const sources: Record<string, string> = {
    root: `version: 1
name: root
steps:
  repair: { kind: fix, uses: shared }
  after: { kind: fix, when: { output: repair.pr, is: [1] } }
`,
    shared: `version: 1
name: shared
outputs: { from: work }
steps:
  repeat:
    kind: loop
    until: judge
    max: 2
    on-max: fail
    steps:
      judge: { kind: fix }
      next: { kind: fix, when: { output: repeat/judge.pr, is: [1] } }
  work: { kind: fix }
`,
  }
  const result = expand({ file: 'root.yaml', text: sources.root! }, name =>
    sources[name] ? { file: `${name}.yaml`, text: sources[name]! } : undefined,
  )
  expect(result.errors).toEqual([])
  expect(result.workflow?.steps[0]?.steps?.[1]?.when?.output).toBe('repair/repeat/judge.pr')
  expect(result.workflow?.steps.at(-1)?.when?.output).toBe('repair/work.pr')
})
