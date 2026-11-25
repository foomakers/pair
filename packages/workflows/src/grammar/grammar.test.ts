import { cardStateOf, formatError, parseWorkflow } from '.'

const QUICK = `version: 1
name: quick
description: Implement a card and review the result.
steps:
  implement:
    kind: implement
    with:
      gates: [quality-gate]
  review:
    kind: review
`

/** `QUICK` with one part replaced — every refusal below is one seeded departure from a valid file. */
const seeded = (from: string, to: string) => QUICK.replace(from, to)
const PLAIN = 'write the value in full, as plain YAML'
const STEP_ID = '^[a-z][a-z0-9-]*$'

describe('card state of a step (#672 AC-13)', () => {
  const stepWith = (extra: string) =>
    parseWorkflow(
      QUICK.replace('kind: review\n', `kind: review\n    ${extra}\n`),
      'workflows/quick.yaml',
    )

  it.each([
    ['implement', undefined, { state: 'In Progress', when: 'start' }],
    ['fix', undefined, { state: 'In Progress', when: 'start' }],
    ['review', undefined, { state: 'Review', when: 'start' }],
    ['generic', undefined, undefined],
    ['review', 'none', undefined],
    ['merge', undefined, { state: 'Done', when: 'end' }],
    ['merge', 'none', undefined],
    ['merge', 'Review', { state: 'Review', when: 'start' }],
    ['gate', undefined, undefined],
    ['generic', 'Done', { state: 'Done', when: 'end' }],
    ['generic', 'Ready', { state: 'Ready', when: 'end' }],
    ['implement', 'Review', { state: 'Review', when: 'start' }],
  ] as const)('%s with state %s', (kind, state, expected) => {
    expect(cardStateOf({ kind, ...(state && { state }) })).toEqual(expected)
  })

  it('reads the state key and refuses a value that is not a macrostate or none', () => {
    expect(stepWith('state: Review').workflow?.steps[1]?.state).toBe('Review')
    expect(stepWith('state: Shipped').errors.length).toBeGreaterThan(0)
  })
})

describe('interactive steps (#696 AC-2)', () => {
  it.each([true, false])('reads interactive: %s as a boolean', interactive => {
    const { workflow, errors } = parseWorkflow(
      seeded('kind: review', `kind: review\n    interactive: ${String(interactive)}`),
      'workflows/quick.yaml',
    )
    expect(errors).toEqual([])
    expect(workflow?.steps[1]).toMatchObject({ interactive })
  })

  it('rejects a quoted boolean', () => {
    const { errors } = parseWorkflow(
      seeded('kind: review', 'kind: review\n    interactive: "true"'),
      'workflows/quick.yaml',
    )
    expect(errors).toEqual([
      expect.objectContaining({
        line: 11,
        key: 'steps.review.interactive',
        problem: 'expected boolean, found string "true"',
      }),
    ])
  })
})

describe('workflow aliases (#672 AC-11)', () => {
  const ALIASED = QUICK.replace(
    'steps:\n',
    'aliases:\n  build: { effort: medium }\n  judge: { engine: claude, model: claude-opus-5-5, effort: high }\nsteps:\n',
  )
    .replace('kind: implement\n', 'kind: implement\n    alias: build\n')
    .replace('kind: review\n', 'kind: review\n    alias: judge\n')

  it('reads the declared aliases and the alias of each step', () => {
    const { workflow, errors } = parseWorkflow(ALIASED, 'workflows/quick.yaml')
    expect(errors).toEqual([])
    expect(workflow?.aliases).toEqual({
      build: { effort: 'medium' },
      judge: { engine: 'claude', model: 'claude-opus-5-5', effort: 'high' },
    })
    expect(workflow?.steps.map(step => step.alias)).toEqual(['build', 'judge'])
  })

  it.each([
    [
      'a step citing an undeclared alias',
      ALIASED.replace('alias: judge', 'alias: ghost'),
      { key: 'steps.review.alias', problem: "alias 'ghost' is not declared in aliases" },
    ],
    [
      'a step citing an alias with no aliases at all',
      QUICK.replace('kind: review\n', 'kind: review\n    alias: judge\n'),
      { key: 'steps.review.alias', problem: "alias 'judge' is not declared in aliases" },
    ],
    [
      'an unknown key in an alias default',
      ALIASED.replace('build: { effort: medium }', 'build: { effort: medium, speed: 1 }'),
      { key: 'aliases.build.speed', problem: "unknown key 'speed'" },
    ],
  ])('refuses %s', (_, text, expected) => {
    const { errors } = parseWorkflow(text, 'workflows/quick.yaml')
    expect(errors).toEqual([expect.objectContaining(expected)])
  })
})

describe('workflow assignment (#723 AC-6)', () => {
  const ASSIGNMENT = `version: 1
name: quick
# workflow
steps:
  build:
    kind: implement
    # step
  retry:
    kind: loop
    until: check
    max: 2
    steps:
      check:
        kind: review
        # child
`
  const positions = {
    workflow: { line: 3, key: 'assign' },
    step: { line: 7, key: 'steps.build.assign' },
    child: { line: 15, key: 'steps.retry.steps.check.assign' },
  } as const
  const file = 'workflows/quick.yaml'

  it.each([
    ['me', 'alice', 'unassign'],
    ['alice', 'none', 'me'],
    ['none', 'unassign', 'bot-pair'],
    ['unassign', 'bot-pair', 'alice'],
    ['bot-pair', 'me', 'none'],
  ])('preserves workflow %s, step %s and loop child %s', (assign, step, child) => {
    const text = ASSIGNMENT.replace('# workflow', `assign: ${assign}`)
      .replace('# step', `assign: ${step}`)
      .replace('# child', `assign: ${child}`)
    const { workflow, errors } = parseWorkflow(text, file)
    expect(errors).toEqual([])
    expect(workflow).toMatchObject({
      assign,
      steps: [
        { id: 'build', assign: step },
        { id: 'retry', steps: [{ id: 'check', assign: child }] },
      ],
    })
  })

  it.each([
    ['null', 'workflow'],
    ['7', 'step'],
    ['""', 'child'],
    ['" alice "', 'workflow'],
    ['"@me"', 'step'],
    ['"alice/review"', 'child'],
    ['"alice;true"', 'step'],
  ] as const)('refuses assign: %s at %s with a positioned fix', (value, position) => {
    const text = ASSIGNMENT.replace(`# ${position}`, `assign: ${value}`)
    const { workflow, errors } = parseWorkflow(text, file)
    expect(workflow).toBeUndefined()
    expect(errors).toEqual([
      expect.objectContaining({
        file,
        ...positions[position],
        problem: expect.stringMatching(/expected string|does not match/),
        fix: expect.stringMatching(/^write a value (?:of type string$|matching \^)/),
      }),
    ])
  })
})

describe('parseWorkflow (AC-2)', () => {
  it('reads a valid file into steps in file order', () => {
    const { workflow, errors } = parseWorkflow(QUICK, 'workflows/quick.yaml')
    expect(errors).toEqual([])
    expect(workflow).toMatchObject({ version: 1, name: 'quick' })
    expect(workflow).not.toHaveProperty('assign')
    expect(workflow?.steps).toEqual([
      { id: 'implement', kind: 'implement', with: { gates: ['quality-gate'] } },
      { id: 'review', kind: 'review' },
    ])
  })

  it.each([
    [
      'an unknown version',
      seeded('version: 1', 'version: 2'),
      { line: 1, key: 'version', problem: 'unknown value 2', fix: 'use 1' },
    ],
    [
      'an unknown top-level key',
      seeded('description:', 'descripton:'),
      {
        line: 3,
        key: 'descripton',
        problem: "unknown key 'descripton'",
        fix: 'use one of version, name, select, description, outputs, aliases, assign, steps',
      },
    ],
    [
      'an unknown step key',
      seeded('    with:\n      gates: [quality-gate]', '    retry: always'),
      {
        line: 7,
        key: 'steps.implement.retry',
        problem: "unknown key 'retry'",
        fix: expect.stringMatching(/^use one of .*\bkind\b.*\bskill\b/),
      },
    ],
    [
      'an unknown kind',
      seeded('kind: review', 'kind: deploy'),
      {
        line: 10,
        key: 'steps.review.kind',
        problem: 'unknown value "deploy"',
        fix: 'use one of "implement", "review", "fix", "generic", "gate", "approval", "merge", "refine-story", "plan-tasks", "loop"',
      },
    ],
    [
      'empty steps',
      'version: 1\nname: quick\nsteps: {}\n',
      { line: 3, key: 'steps', problem: 'is empty', fix: 'add at least one entry' },
    ],
    [
      'steps with no value',
      'version: 1\nname: quick\nsteps:\n',
      {
        line: 3,
        key: 'steps',
        problem: 'expected object, found null',
        fix: 'write a value of type object',
      },
    ],
    [
      'a duplicate key',
      seeded('  review:\n', '  implement:\n'),
      {
        line: 9,
        key: '',
        problem: 'Map keys must be unique',
        fix: 'remove or rename the second key',
      },
    ],
    [
      'an anchor',
      seeded('gates: [quality-gate]', 'gates: &g [quality-gate]'),
      { line: 8, key: '', problem: 'anchor &g is not allowed', fix: PLAIN },
    ],
    [
      'an alias',
      seeded('    kind: review', '    kind: review\n    with: *g'),
      { line: 11, key: '', problem: 'alias *g is not allowed', fix: PLAIN },
    ],
    [
      'a tag',
      seeded('name: quick', 'name: !!str quick'),
      { line: 2, key: '', problem: 'tag tag:yaml.org,2002:str is not allowed', fix: PLAIN },
    ],
    [
      'a name that differs from the file name',
      seeded('name: quick', 'name: fast'),
      {
        line: 2,
        key: 'name',
        problem: "name 'fast' differs from the file name 'quick'",
        fix: 'write name: quick',
      },
    ],
    [
      'a step id that is not a safe directory name',
      seeded('  review:', '  ../review:'),
      {
        line: 9,
        key: 'steps.../review',
        problem: `key '../review' does not match ${STEP_ID}`,
        fix: `rename it to match ${STEP_ID}`,
      },
    ],
    [
      'a step with no kind',
      seeded('    kind: review\n', '    skill: my-skill\n'),
      { line: 9, key: 'steps.review', problem: "missing key 'kind'", fix: "add 'kind'" },
    ],
    [
      'a `skill` that is not a skill name',
      seeded('kind: review', 'kind: review\n    skill: My Skill'),
      {
        line: 11,
        key: 'steps.review.skill',
        problem: '"My Skill" does not match ^[a-z0-9][a-z0-9:._-]*$',
        fix: 'write a value matching ^[a-z0-9][a-z0-9:._-]*$',
      },
    ],
    [
      'a `with` that is not a map',
      seeded('kind: review', 'kind: review\n    with: 3'),
      {
        line: 11,
        key: 'steps.review.with',
        problem: 'expected object, found integer 3',
        fix: 'write a value of type object',
      },
    ],
    [
      'a name that is not text',
      seeded('name: quick', 'name: 7'),
      {
        line: 2,
        key: 'name',
        problem: 'expected string, found integer 7',
        fix: 'write a value of type string',
      },
    ],
    [
      'a description that is not text',
      seeded('description: Implement a card and review the result.', 'description: [a]'),
      {
        line: 3,
        key: 'description',
        problem: 'expected string, found array ["a"]',
        fix: 'write a value of type string',
      },
    ],
    [
      'two documents in one file',
      `${QUICK}---\nversion: 1\n`,
      {
        line: 11,
        key: '',
        problem: 'Source contains multiple documents; please use YAML.parseAllDocuments()',
        fix: 'keep one document per file',
      },
    ],
    [
      'a document that is not a map',
      '- quick\n',
      {
        line: 1,
        key: '',
        problem: 'expected object, found array ["quick"]',
        fix: 'write a value of type object',
      },
    ],
  ])('refuses %s, naming file, line, key and fix', (_name, text, expected) => {
    const { workflow, errors } = parseWorkflow(text, 'workflows/quick.yaml')
    expect(workflow).toBeUndefined()
    expect(errors).toContainEqual({ file: 'workflows/quick.yaml', ...expected })
  })

  it('names the line of a YAML syntax error and tells to correct it', () => {
    const { workflow, errors } = parseWorkflow(
      seeded('gates: [quality-gate]', 'gates: [quality-gate'),
      'quick.yaml',
    )
    expect(workflow).toBeUndefined()
    expect(errors[0]).toMatchObject({ file: 'quick.yaml', key: '', fix: 'correct the YAML syntax' })
    expect(errors[0]?.line).toBeGreaterThanOrEqual(8)
    expect(errors[0]?.problem).not.toMatch(/ at line \d+/)
  })

  it('reports a missing required key on the document', () => {
    const { errors } = parseWorkflow('version: 1\nname: quick\n', 'quick.yaml')
    expect(errors.map(formatError)).toEqual([
      "quick.yaml:1: missing key 'steps' — fix: add 'steps'",
    ])
  })

  it('formats an error as file:line: key: problem — fix', () => {
    const { errors } = parseWorkflow(seeded('kind: review', 'kind: deploy'), 'quick.yaml')
    expect(errors.map(formatError)).toEqual([
      'quick.yaml:10: steps.review.kind: unknown value "deploy" — fix: use one of "implement", "review", "fix", "generic", "gate", "approval", "merge", "refine-story", "plan-tasks", "loop"',
    ])
  })
})
