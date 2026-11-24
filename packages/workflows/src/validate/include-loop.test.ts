import { describe, expect, it } from 'vitest'
import { validate } from '.'

const source = (name: string, steps: string) => ({
  file: `${name}.yaml`,
  text: `version: 1\nname: ${name}\nsteps:\n${steps}\n`,
})
const loop = (child: string) =>
  `  rounds:\n    kind: loop\n    until: work\n    max: 2\n    on-max: fail\n    steps:\n      work: ${child}`
const leaf = '{ kind: generic, skill: ok }'
const include = '{ kind: generic, uses: shared }'

function check(root: ReturnType<typeof source>, shared: ReturnType<typeof source>) {
  return validate(root.text, root.file, {
    skillExists: name => name === 'ok' || name === 'pair-process-implement',
    gateKeys: [],
    launchInputs: ['card'],
    isSafeText: () => true,
    resolveWorkflow: name => (name === 'shared' ? shared : undefined),
  })
}

describe('include and loop nesting (#699 AC-8)', () => {
  it('expands an include inside a loop when it contains no loop', () => {
    const result = check(source('root', loop(include)), source('shared', `  task: ${leaf}`))
    expect(result.errors).toEqual([])
    expect(result.workflow?.steps[0]?.steps?.map(step => step.id)).toEqual(['work/task'])
  })

  it('allows an include to introduce a loop outside a loop', () => {
    const result = check(source('root', `  shared: ${include}`), source('shared', loop(leaf)))
    expect(result.errors).toEqual([])
    expect(result.workflow?.steps[0]?.kind).toBe('loop')
  })

  it('rejects a loop introduced inside a loop at the included source', () => {
    const result = check(source('root', loop(include)), source('shared', loop(leaf)))
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          problem: 'nested loop is not allowed',
          file: 'shared.yaml',
          line: 4,
        }),
      ]),
    )
  })

  it('locates errors in an included loop child at its source line', () => {
    const shared = source('shared', loop('{ kind: generic, skill: missing }'))
    const result = check(source('root', `  shared: ${include}`), shared)
    expect(result.errors).toEqual(
      expect.arrayContaining([expect.objectContaining({ file: 'shared.yaml', line: 10 })]),
    )
  })
})

it('expands nested multi-step includes in loop order and targets the final step (#699 AC-8)', () => {
  const root = source('root', loop(include))
  const shared = source('shared', `  first: ${leaf}\n  inner: { kind: generic, uses: nested }`)
  const nested = source('nested', `  one: ${leaf}\n  two: ${leaf}`)
  const result = validate(root.text, root.file, {
    skillExists: name => name === 'ok',
    gateKeys: [],
    launchInputs: [],
    isSafeText: () => true,
    resolveWorkflow: name => ({ shared, nested })[name],
  })
  expect(result.errors).toEqual([])
  expect(result.workflow?.steps[0]?.steps?.map(step => step.id)).toEqual([
    'work/first',
    'work/inner/one',
    'work/inner/two',
  ])
  expect(result.workflow?.steps[0]?.until).toBe('work/inner/two')
})

it('keeps source locations distinct when loop and outer includes use the same child ID (#699 AC-8)', () => {
  const root = source('root', `  work: { kind: generic, uses: outer }\n${loop(include)}`)
  const outer = source('outer', '  task: { kind: generic, skill: missing-outer }')
  const shared = source('shared', '  task: { kind: generic, skill: missing-inner }')
  const result = validate(root.text, root.file, {
    skillExists: () => false,
    gateKeys: [],
    launchInputs: [],
    isSafeText: () => true,
    resolveWorkflow: name => ({ outer, shared })[name],
  })
  expect(result.errors).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        problem: "skill 'missing-outer' is not installed",
        file: 'outer.yaml',
        line: 4,
      }),
      expect.objectContaining({
        problem: "skill 'missing-inner' is not installed",
        file: 'shared.yaml',
        line: 4,
      }),
    ]),
  )
})

it('binds included loop children by full address without shadowing top-level callers (INC-02)', () => {
  const root = source(
    'root',
    `  reuse: { kind: implement, uses: outer }
  after: { kind: implement, when: { output: reuse.pr, is: [1] } }
  rounds:
    kind: loop
    until: done
    max: 2
    on-max: fail
    steps:
      reuse: { kind: implement, uses: shared }
      next: { kind: implement, when: { output: rounds/reuse.pr, is: [1] } }
      done: { kind: implement }`,
  )
  const shared = source(
    'shared',
    `  build: { kind: implement }
  check: { kind: implement, when: { output: build.pr, is: [1] } }
  final: { kind: implement }`,
  )
  const outer = source('outer', '  different: { kind: implement }')
  const result = validate(root.text, root.file, {
    skillExists: name => name === 'pair-process-implement',
    gateKeys: [],
    launchInputs: ['card'],
    isSafeText: () => true,
    resolveWorkflow: name => ({ outer, shared })[name],
  })
  expect(result.errors).toEqual([])
  expect(result.workflow!.steps[1]!.when!.output).toBe('reuse/different.pr')
  expect(result.workflow!.steps[2]!.steps![1]!.when!.output).toBe('rounds/reuse/build.pr')
  expect(result.workflow!.steps[2]!.steps![3]!.when!.output).toBe('rounds/reuse/final.pr')
})

it('validates a loop condition in an included workflow (INC-02)', () => {
  const root = source('root', '  reuse: { kind: generic, uses: shared }')
  const shared = source(
    'shared',
    `  rounds:
    kind: loop
    until: done
    max: 2
    on-max: fail
    steps:
      build: { kind: implement }
      next: { kind: implement, when: { output: rounds/build.pr, is: [1] } }
      done: { kind: implement }`,
  )
  const result = check(root, shared)
  expect(result.errors).toEqual([])
  expect(result.workflow?.steps[0]?.steps?.[1]?.when?.output).toBe('reuse/rounds/build.pr')
})
