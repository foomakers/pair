import { next, start } from '.'
import { buildMessage } from '../dispatch'
import { kindByName } from '../kinds'
import { validate } from '../validate'
import { createMemoryFiles } from './memory-files'

// #674 AC-7: args are safe text, rejected before launch otherwise, and passed to the skill.
const deps = {
  skillExists: () => true,
  gateKeys: ['quality-gate'],
  launchInputs: ['card'],
  isSafeText: (text: string) => !text.includes('`') && !text.includes('\n'),
}
const workflow = (step: string, name = 'args') =>
  `version: 1\nname: ${name}\nsteps:\n  work: { ${step} }\n`
const check = (step: string) => validate(workflow(step), 'args.yaml', deps)
const agent = 'kind: generic, skill: vendor:example'

describe('#674 AC-7 skill arguments', () => {
  it('accepts text arguments independently of kind options', () => {
    expect(check(`${agent}, args: { spec: docs/spec.md, mode: strict }`).errors).toEqual([])
  })

  it('accepts a step without arguments', () => {
    expect(check(agent).errors).toEqual([])
  })

  it.each([
    ['unsafe text', `${agent}, args: { mode: "a\`b" }`],
    ['non-text value', `${agent}, args: { mode: 42 }`],
    ['non-map', `${agent}, args: [strict]`],
    ['host kind', 'kind: gate, with: { gates: [quality-gate] }, args: { mode: strict }'],
  ])('rejects %s as an args error before launch', (_case, step) => {
    const result = check(step)
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: expect.stringMatching(/args/),
          problem: expect.not.stringMatching(/unknown|not allowed.*key/i),
        }),
      ]),
    )
    expect(result.workflow).toBeUndefined()
  })

  it('rejects args on a workflow include before launch', () => {
    const include = 'kind: generic, uses: shared'
    const includeDeps = {
      ...deps,
      skillExists: (name: string) => name === 'vendor:example',
      resolveWorkflow: (name: string) =>
        name === 'shared' ? { file: 'shared.yaml', text: workflow(agent, name) } : undefined,
    }
    expect(validate(workflow(include), 'args.yaml', includeDeps).errors).toEqual([])

    const result = validate(
      workflow(`${include}, args: { mode: strict }`),
      'args.yaml',
      includeDeps,
    )
    expect(result.errors).toMatchObject([
      { key: 'steps.work.args', problem: expect.stringMatching(/include/i) },
    ])
    expect(result.workflow).toBeUndefined()
  })

  it('passes each pair through the engine and composes each invocation style', async () => {
    const run = { files: createMemoryFiles(), dir: '/runs/args' }
    const text = workflow(`${agent}, args: { spec: docs/spec.md, mode: strict }`)
    expect(await start(run, { text, file: 'args.yaml' }, { card: '674' })).toMatchObject({
      status: 'started',
    })
    const launch = (await next(run)).ready[0]!
    expect(launch).toMatchObject({
      uses: 'vendor:example',
      args: { spec: 'docs/spec.md', mode: 'strict' },
    })
    const slash = buildMessage(launch, kindByName.generic, { style: 'slash', ...deps })
    const instruction = buildMessage(launch, kindByName.generic, { style: 'instruction', ...deps })
    expect(slash.split('\n')[0]).toBe('/vendor:example spec=docs/spec.md mode=strict')
    expect(instruction.split('\n')[0]).toBe(
      'Run the vendor:example skill. Arguments: spec=docs/spec.md mode=strict',
    )
  })

  it.each(['slash', 'instruction'] as const)(
    'preserves argument boundaries around embedded key=value text in the %s invocation',
    style => {
      const message = (args: Record<string, string>) =>
        buildMessage(
          {
            id: 'work',
            kind: 'generic',
            uses: 'vendor:example',
            with: {},
            inputs: {},
            attempt: 1,
            args,
          },
          kindByName.generic,
          { style, ...deps },
        )
      const firstValue = message({ query: 'compare mode=preview', mode: 'strict' })
      const secondValue = message({ query: 'compare', mode: 'preview mode=strict' })

      expect(firstValue).toContain('compare mode=preview')
      expect(secondValue).toContain('preview mode=strict')
      expect(firstValue).not.toBe(secondValue)
    },
  )
})
