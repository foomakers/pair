import { validate, type ValidationDeps } from '.'

const deps: ValidationDeps = {
  skillExists: name =>
    ['pair-process-implement', 'pair-process-review', 'pair-process-fix', 'my-skill'].includes(
      name,
    ),
  gateKeys: ['quality-gate', 'smoke-tests'],
  launchInputs: ['card'],
  isSafeText: text => !text.includes('`') && !text.includes('\n'),
}

const QUICK = `version: 1
name: quick
steps:
  implement:
    kind: implement
    gates: [quality-gate]
  review:
    kind: review
`

const check = (text: string, over: Partial<ValidationDeps> = {}) =>
  validate(text, 'quick.yaml', { ...deps, ...over })

describe('loop validation (#670 AC-7)', () => {
  const loop = `version: 1
name: quick
steps:
  rounds:
    kind: loop
    until: review
    max: 2
    on-max: escalate
    steps:
      review: { kind: generic, skill: my-skill }
      fix: { kind: generic, skill: my-skill }
`

  it('does not expose outputs of children skipped on loop exit (#670-loop-outputs)', () => {
    const text = `version: 1
name: quick
steps:
  rounds:
    kind: loop
    until: first
    max: 2
    on-max: escalate
    steps:
      first: { kind: generic, skill: my-skill }
      review: { kind: review }
  fix: { kind: fix }
`
    const errors = check(text, { launchInputs: ['card', 'pr', 'head'] }).errors
    expect(errors.some(error => error.problem.includes("input 'findings'"))).toBe(true)
  })

  it.each([
    ['review:', 'steps.rounds.steps.review'],
    ['review: { kind: typo }', 'steps.rounds.steps.review.kind'],
  ])('diagnoses malformed child %s (#670-child-validation)', (child, key) => {
    const result = check(loop.replace('review: { kind: generic, skill: my-skill }', child))
    expect(
      result.errors.some(
        error => error.file === 'quick.yaml' && error.line > 0 && error.key === key,
      ),
    ).toBe(true)
  })

  it('accepts a bounded loop', () => {
    expect(check(loop).errors).toEqual([])
  })

  it.each([
    [
      'loop gates',
      loop.replace('    max: 2', '    gates: [quality-gate]\n    max: 2'),
      'gates is not allowed on a loop',
    ],
    ['missing max', loop.replace('    max: 2\n', ''), "missing key 'max'"],
    ['missing on-max', loop.replace('    on-max: escalate\n', ''), "missing key 'on-max'"],
    [
      'unknown until',
      loop.replace('until: review', 'until: absent'),
      "unknown until step 'absent'",
    ],
    [
      'on-failed child',
      loop.replace(
        'review: { kind: generic, skill: my-skill }',
        'review: { kind: generic, skill: my-skill, on-failed: continue }',
      ),
      'on-failed is not allowed inside a loop',
    ],
    [
      'nested loop',
      loop.replace(
        'fix: { kind: generic, skill: my-skill }',
        'fix: { kind: loop, until: a, max: 1, on-max: fail, steps: { a: { kind: generic, skill: my-skill } } }',
      ),
      'nested loop is not allowed',
    ],
  ])('refuses %s', (_name, text, problem) => {
    expect(check(text).errors.some(error => error.problem === problem)).toBe(true)
  })
})

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
      QUICK.replace('kind: review', 'kind: review\n    skill: missing-skill'),
      {
        line: 9,
        key: 'steps.review.skill',
        problem: "skill 'missing-skill' is not installed",
        fix: "install it, or name an installed skill in 'skill'",
      },
    ],
    [
      'a generic step with no skill',
      QUICK.replace('kind: review', 'kind: generic'),
      {
        line: 7,
        key: 'steps.review',
        problem: 'a generic step has no default skill',
        fix: "add 'skill' with the skill to run",
      },
    ],
    [
      '`uses` with a skill name',
      QUICK.replace('kind: review', 'kind: review\n    uses: my-skill'),
      {
        line: 9,
        key: 'steps.review.uses',
        problem: "'uses' does not name a skill: 'my-skill'",
        fix: 'write skill: my-skill',
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
        line: 6,
        key: 'steps.implement.gates.1',
        problem: "unknown gate key 'e2e'",
        fix: 'use one of quality-gate, smoke-tests',
      },
    ],
    [
      'a gate key in a list written one item per line',
      QUICK.replace('gates: [quality-gate]', 'gates:\n      - quality-gate\n      - e2e'),
      {
        line: 8,
        key: 'steps.implement.gates.1',
        problem: "unknown gate key 'e2e'",
        fix: 'use one of quality-gate, smoke-tests',
      },
    ],
    [
      'an unsafe text nested in a list of the options',
      QUICK.replace(
        'kind: review',
        'kind: generic\n    skill: my-skill\n    with:\n      notes:\n        - fine\n        - text: "a`b"',
      ),
      {
        line: 13,
        key: 'steps.review.with.notes.1.text',
        problem: '"a`b" is not safe to hand to an agent',
        fix: 'write short plain text: no backtick, no $(, no line break',
      },
    ],
    [
      'an option the kind does not declare',
      QUICK.replace('kind: review', 'kind: review\n    with:\n      floor: Major'),
      {
        line: 10,
        key: 'steps.review.with.floor',
        problem: "unknown key 'floor'",
        fix: 'use one of blocking',
      },
    ],
    [
      'an option text that is not safe to hand to an agent',
      QUICK.replace(
        'kind: review',
        'kind: generic\n    skill: my-skill\n    with:\n      note: "a`b"',
      ),
      {
        line: 11,
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
      'kind: generic\n    skill: my-skill\n    with:\n      gates: [whatever]',
    )
    expect(check(text).errors).toEqual([])
  })

  it('lets a later step use an output of an earlier one', () => {
    const { errors } = check(QUICK.replace('kind: review', 'kind: generic\n    skill: my-skill'))
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

describe('validate: on-failed (#708 AC-7)', () => {
  it('warns, without refusing, on the last step', () => {
    const { errors, warnings } = check(
      QUICK.replace('kind: review', 'kind: review\n    on-failed: continue'),
    )
    expect(errors).toEqual([])
    expect(warnings.map(one => one.key)).toEqual(['steps.review.on-failed'])
  })

  it('accepts continue before the last step without a warning', () => {
    const text = QUICK.replace('kind: implement', 'kind: implement\n    on-failed: continue')
    expect(check(text).warnings).toEqual([])
  })

  it('refuses any other value', () => {
    const { errors } = check(QUICK.replace('kind: review', 'kind: review\n    on-failed: retry'))
    expect(errors.map(one => one.key)).toEqual(['steps.review.on-failed'])
  })
})
