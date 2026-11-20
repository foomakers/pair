import { validate, type ValidationDeps } from '.'

const deps: ValidationDeps = {
  skillExists: name => ['pair-process-implement', 'pair-process-review', 'my-skill'].includes(name),
  gateKeys: ['quality-gate', 'smoke-tests'],
  launchInputs: ['card'],
  isSafeText: text => !text.includes('`') && !text.includes('\n'),
}

const QUICK = `version: 1
name: quick
steps:
  implement:
    kind: implement
    with:
      gates: [quality-gate]
  review:
    kind: review
`

const check = (text: string, over: Partial<ValidationDeps> = {}) =>
  validate(text, 'quick.yaml', { ...deps, ...over })

describe('validate (AC-3, AC-5)', () => {
  it('accepts a coherent workflow', () => {
    const { workflow, errors, warnings } = check(QUICK)
    expect(errors).toEqual([])
    expect(warnings).toEqual([])
    expect(workflow?.steps.map(step => step.id)).toEqual(['implement', 'review'])
  })

  it('reports a form error with the same position as the grammar (AC-2)', () => {
    const { workflow, errors } = check(QUICK.replace('version: 1', 'version: 2'))
    expect(workflow).toBeUndefined()
    expect(errors).toEqual([
      { file: 'quick.yaml', line: 1, key: 'version', problem: 'unknown value 2', fix: 'use 1' },
    ])
  })

  it.each([
    [
      'a skill that is not installed',
      QUICK.replace('kind: review', 'kind: review\n    uses: missing-skill'),
      {
        line: 10,
        key: 'steps.review.uses',
        problem: "skill 'missing-skill' is not installed",
        fix: "install it, or name an installed skill in 'uses'",
      },
    ],
    [
      'a generic step with no uses',
      QUICK.replace('kind: review', 'kind: generic'),
      {
        line: 8,
        key: 'steps.review',
        problem: 'a generic step has no default skill',
        fix: "add 'uses' with the skill to run",
      },
    ],
    [
      'an input no launch argument or earlier step provides',
      'version: 1\nname: quick\nsteps:\n  review:\n    kind: review\n',
      {
        line: 4,
        key: 'steps.review',
        problem: "input 'pr' is neither a launch argument nor an output of an earlier step",
        fix: "put a step that returns 'pr' before it",
      },
    ],
    [
      'a gate key the registry does not hold',
      QUICK.replace('[quality-gate]', '[quality-gate, e2e]'),
      {
        line: 7,
        key: 'steps.implement.with.gates.1',
        problem: "unknown gate key 'e2e'",
        fix: 'use one of quality-gate, smoke-tests',
      },
    ],
    [
      'a gate key in a list written one item per line',
      QUICK.replace('gates: [quality-gate]', 'gates:\n        - quality-gate\n        - e2e'),
      {
        line: 9,
        key: 'steps.implement.with.gates.1',
        problem: "unknown gate key 'e2e'",
        fix: 'use one of quality-gate, smoke-tests',
      },
    ],
    [
      'an unsafe text nested in a list of the options',
      QUICK.replace(
        'kind: review',
        'kind: generic\n    uses: my-skill\n    with:\n      notes:\n        - fine\n        - text: "a`b"',
      ),
      {
        line: 14,
        key: 'steps.review.with.notes.1.text',
        problem: '"a`b" is not safe to hand to an agent',
        fix: 'write short plain text: no backtick, no $(, no line break',
      },
    ],
    [
      'an option the kind does not declare',
      QUICK.replace('gates: [quality-gate]', 'gate: quality-gate'),
      {
        line: 7,
        key: 'steps.implement.with.gate',
        problem: "unknown key 'gate'",
        fix: 'use one of gates',
      },
    ],
    [
      'an option text that is not safe to hand to an agent',
      QUICK.replace(
        'kind: review',
        'kind: generic\n    uses: my-skill\n    with:\n      note: "a`b"',
      ),
      {
        line: 12,
        key: 'steps.review.with.note',
        problem: '"a`b" is not safe to hand to an agent',
        fix: 'write short plain text: no backtick, no $(, no line break',
      },
    ],
  ])('refuses %s', (_name, text, expected) => {
    const { workflow, errors, warnings } = check(text)
    expect(workflow).toBeUndefined()
    expect(warnings).toEqual([])
    expect(errors).toContainEqual({ file: 'quick.yaml', ...expected })
  })

  it('names the registry as the fix when it holds no key', () => {
    const { errors } = check(QUICK, { gateKeys: [] })
    expect(errors.map(error => error.fix)).toEqual([
      "give each gate a 'Key' in the Custom Gate Registry of way-of-working.md",
    ])
  })

  it('checks gate keys only where the kind declares gates: a generic `with` is free', () => {
    const text = QUICK.replace(
      'kind: review',
      'kind: generic\n    uses: my-skill\n    with:\n      gates: [whatever]',
    )
    expect(check(text).errors).toEqual([])
  })

  it('lets a later step use an output of an earlier one', () => {
    const { errors } = check(QUICK.replace('kind: review', 'kind: generic\n    uses: my-skill'))
    expect(errors).toEqual([])
  })

  it('refuses an unmet input even when the launch provides nothing', () => {
    const { errors } = check(QUICK, { launchInputs: [] })
    expect(errors.map(error => error.problem)).toEqual([
      "input 'card' is neither a launch argument nor an output of an earlier step",
      "input 'card' is neither a launch argument nor an output of an earlier step",
    ])
  })
})
