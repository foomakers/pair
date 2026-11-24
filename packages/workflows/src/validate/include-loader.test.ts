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

it('rebases output references inside an include (INC-02, AC-1)', () => {
  const result = validate(
    'version: 1\nname: root\nsteps:\n  use: { kind: generic, uses: shared }\n',
    'root.yaml',
    {
      skillExists: name => name !== 'shared',
      gateKeys: [],
      launchInputs: ['card'],
      isSafeText: () => true,
      resolveWorkflow: () => ({
        file: 'shared.yaml',
        text: `version: 1
name: shared
steps:
  judge: { kind: implement }
  work: { kind: generic, skill: example, when: { output: judge.pr, is: [yes] } }
`,
      }),
    },
  )
  expect(result.errors).toEqual([])
  expect(result.workflow?.steps[1]?.when?.output).toBe('use/judge.pr')
})

it('rejects conditions on include callers (INC-03, AC-1)', () => {
  const result = validate(
    'version: 1\nname: root\nsteps:\n  use: { kind: generic, uses: shared, when: { output: prior.pr, is: [yes] } }\n',
    'root.yaml',
    {
      skillExists: name => name !== 'shared',
      gateKeys: [],
      launchInputs: ['card'],
      isSafeText: () => true,
      resolveWorkflow: () => ({
        file: 'shared.yaml',
        text: 'version: 1\nname: shared\nsteps:\n  work: { kind: generic, skill: example }\n',
      }),
    },
  )
  expect(
    result.errors.some(
      error => error.problem.includes('when') && error.problem.includes('include'),
    ),
  ).toBe(true)
})

it('rejects unknown workflow names on host steps (INC-04, AC-4)', () => {
  const result = validate(
    'version: 1\nname: root\nsteps:\n  gate: { kind: gate, uses: missing, with: { checks: [head-unchanged] } }\n',
    'root.yaml',
    {
      skillExists: () => false,
      gateKeys: [],
      launchInputs: ['card'],
      isSafeText: () => true,
      resolveWorkflow: () => undefined,
      availableWorkflows: ['shared'],
    },
  )
  expect(
    result.errors.some(error => error.problem.includes('missing') && error.fix.includes('shared')),
  ).toBe(true)
})
