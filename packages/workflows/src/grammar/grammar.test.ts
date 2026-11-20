import { formatError, parseWorkflow } from '.'

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

describe('parseWorkflow (AC-2)', () => {
  it('reads a valid file into steps in file order', () => {
    const { workflow, errors } = parseWorkflow(QUICK, 'workflows/quick.yaml')
    expect(errors).toEqual([])
    expect(workflow).toMatchObject({ version: 1, name: 'quick' })
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
        fix: 'use one of version, name, description, steps',
      },
    ],
    [
      'an unknown step key',
      seeded('    with:\n      gates: [quality-gate]', '    when: always'),
      {
        line: 7,
        key: 'steps.implement.when',
        problem: "unknown key 'when'",
        fix: 'use one of kind, uses, with',
      },
    ],
    [
      'an unknown kind',
      seeded('kind: review', 'kind: merge'),
      {
        line: 10,
        key: 'steps.review.kind',
        problem: 'unknown value "merge"',
        fix: 'use one of "implement", "review", "generic"',
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

  it('reports a missing required key on the document', () => {
    const { errors } = parseWorkflow('version: 1\nname: quick\n', 'quick.yaml')
    expect(errors.map(formatError)).toEqual(["quick.yaml:1: missing key 'steps' — fix: add 'steps'"])
  })

  it('formats an error as file:line: key: problem — fix', () => {
    const { errors } = parseWorkflow(seeded('kind: review', 'kind: merge'), 'quick.yaml')
    expect(errors.map(formatError)).toEqual([
      'quick.yaml:10: steps.review.kind: unknown value "merge" — fix: use one of "implement", "review", "generic"',
    ])
  })
})
