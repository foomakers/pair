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
