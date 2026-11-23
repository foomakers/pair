import { expect, it } from 'vitest'
import { validate } from '.'

it('validates expanded steps in caller order (AC-1)', () => {
  const source = `version: 1
name: root
steps:
  before: { kind: generic, skill: example }
  shared: { kind: generic, uses: shared }
  after: { kind: generic, skill: example }
`
  const deps = {
    skillExists: (name: string) => name === 'example',
    gateKeys: [],
    launchInputs: [],
    isSafeText: () => true,
    resolveWorkflow: (name: string) =>
      name === 'shared'
        ? {
            file: 'shared.yaml',
            text: 'version: 1\nname: shared\nsteps:\n  work: { kind: generic, skill: example }\n',
          }
        : undefined,
  }
  const result = validate(source, 'root.yaml', deps)
  expect(result.errors).toEqual([])
  expect(result.workflow?.steps.map(step => step.id)).toEqual(['before', 'shared/work', 'after'])
})
