import { expect, it } from 'vitest'
import { validate } from '.'

it('reports validation errors at the included source line (AC-1)', () => {
  const result = validate(
    'version: 1\nname: root\nsteps:\n  shared: { kind: generic, uses: shared }\n',
    'root.yaml',
    {
      skillExists: () => false,
      gateKeys: [],
      launchInputs: [],
      isSafeText: () => true,
      resolveWorkflow: () => ({
        file: 'shared.yaml',
        text: 'version: 1\nname: shared\nsteps:\n  work:\n    kind: generic\n    skill: missing\n',
      }),
    },
  )
  expect(result.errors).toHaveLength(1)
  expect(result.errors[0]).toMatchObject({ file: 'shared.yaml', line: 6 })
})
