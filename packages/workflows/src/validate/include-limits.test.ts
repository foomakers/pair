import { expect, it } from 'vitest'
import { validate } from '.'

const include = (name: string, target: string) => ({
  file: `${name}.yaml`,
  text: `version: 1\nname: ${name}\nsteps:\n  use: { kind: generic, uses: ${target} }\n`,
})

it('rejects a workflow and skill sharing an include name (AC-4)', () => {
  const result = validate(
    'version: 1\nname: root\nsteps:\n  use: { kind: generic, uses: shared }\n',
    'root.yaml',
    {
      skillExists: name => name === 'shared' || name === 'worker',
      gateKeys: [],
      launchInputs: [],
      isSafeText: () => true,
      resolveWorkflow: name =>
        name === 'shared'
          ? {
              file: 'shared.yaml',
              text: 'version: 1\nname: shared\nsteps:\n  work: { kind: generic, skill: worker }\n',
            }
          : undefined,
    },
  )
  expect(result.workflow).toBeUndefined()
  expect(
    result.errors.some(
      error =>
        /shared/.test(error.problem) &&
        /rename|clash|conflict/i.test(`${error.problem} ${error.fix}`),
    ),
  ).toBe(true)
})

it.each([
  { target: 'one', expectedFile: 'three.yaml', diagnostic: 'include depth exceeds 3' },
  { target: 'missing', expectedFile: 'root.yaml', diagnostic: "unknown workflow 'missing'" },
])('rejects the invalid include chain starting with $target (AC-4)', entry => {
  const root = include('root', entry.target)
  const sources = [
    include('one', 'two'),
    include('two', 'three'),
    include('three', 'four'),
    include('four', 'worker'),
  ]
  const result = validate(root.text, root.file, {
    skillExists: name => name === 'worker',
    gateKeys: [],
    launchInputs: [],
    isSafeText: () => true,
    resolveWorkflow: name => sources.find(source => source.file === `${name}.yaml`),
  })
  expect(result.workflow).toBeUndefined()
  expect(result.errors).toContainEqual(
    expect.objectContaining({
      file: entry.expectedFile,
      problem: expect.stringContaining(entry.diagnostic),
    }),
  )
})
