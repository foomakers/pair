import { hashOf, next, record, start, type RunDirectory } from '.'
import { createMemoryFiles } from './memory-files'

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
const SOURCE = { text: QUICK, file: 'workflows/quick.yaml' }
const DIR = '/main/.pair/working/runs/quick-627'
const HEAD = 'a'.repeat(40)
const IMPLEMENTED = {
  status: 'ok',
  summary: 'PR opened',
  branch: 'feature/US-627-x',
  pr: 12,
  head: HEAD,
}
const REVIEWED = {
  status: 'ok',
  summary: 'approved',
  verdict: 'approved',
  reviewedHead: HEAD,
  findings: [],
}

function open(): RunDirectory & { files: ReturnType<typeof createMemoryFiles> } {
  return { files: createMemoryFiles(), dir: DIR }
}
const stateOf = (run: RunDirectory) =>
  JSON.parse(run.files.readFileSync(`${DIR}/state.json`)) as {
    steps: Record<string, { state: string }>
  }
const statesOf = (run: RunDirectory) =>
  Object.fromEntries(Object.entries(stateOf(run).steps).map(([id, step]) => [id, step.state]))

describe('engine: a linear run (AC-1)', () => {
  it('starts with a frozen copy and every step pending', async () => {
    const run = open()
    expect(await start(run, SOURCE, { card: '627' })).toEqual({ status: 'started', warnings: [] })
    expect(run.files.readFileSync(`${DIR}/workflow.yaml`)).toBe(QUICK)
    expect(stateOf(run)).toEqual({
      schemaVersion: 1,
      workflow: { name: 'quick', hash: hashOf(QUICK) },
      card: '627',
      steps: { implement: { state: 'pending' }, review: { state: 'pending' } },
    })
  })

  it('hands out the steps in file order, each with the outputs of the ones before, until done', async () => {
    const run = open()
    await start(run, SOURCE, { card: '627' })

    expect(await next(run)).toEqual({
      run: 'running',
      ready: [
        {
          id: 'implement',
          kind: 'implement',
          uses: 'pair-process-implement',
          with: { gates: ['quality-gate'] },
          inputs: { card: '627' },
          attempt: 1,
        },
      ],
    })
    expect(statesOf(run)).toEqual({ implement: 'running', review: 'pending' })
    await record(run, 'implement', IMPLEMENTED, 'final message')

    expect(await next(run)).toEqual({
      run: 'running',
      ready: [
        {
          id: 'review',
          kind: 'review',
          uses: 'pair-process-review',
          with: {},
          inputs: { card: '627', pr: 12, head: HEAD },
          attempt: 1,
        },
      ],
    })
    await record(run, 'review', REVIEWED)

    expect(await next(run)).toEqual({ run: 'done', ready: [] })
    expect(statesOf(run)).toEqual({ implement: 'ok', review: 'ok' })
  })

  it('keeps the validated result, the outputs and the final message of a step', async () => {
    const run = open()
    await start(run, SOURCE, { card: '627' })
    await next(run)
    await record(run, 'implement', IMPLEMENTED, 'final message')
    expect(JSON.parse(run.files.readFileSync(`${DIR}/steps/implement/result.json`))).toEqual(
      IMPLEMENTED,
    )
    expect(run.files.readFileSync(`${DIR}/steps/implement/output.log`)).toBe('final message')
    expect(stateOf(run).steps['implement']).toEqual({
      state: 'ok',
      executions: 1,
      summary: 'PR opened',
      outputs: { branch: 'feature/US-627-x', pr: 12, head: HEAD },
    })
  })

  it('names the hash of the frozen workflow by its algorithm', () => {
    expect(hashOf('')).toBe(
      'sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    )
  })

  it('archives nothing on a first start', async () => {
    const run = open()
    await start(run, SOURCE, { card: '627' })
    expect(run.files.existsSync(`${DIR}/archive`)).toBe(false)
  })

  it('gives a generic step every scalar produced so far, and no list', async () => {
    const run = open()
    const text = `${QUICK}  notes:\n    kind: generic\n    uses: my-skill\n`
    await start(run, { text, file: 'workflows/quick.yaml' }, { card: '627' })
    await next(run)
    await record(run, 'implement', IMPLEMENTED)
    await next(run)
    await record(run, 'review', REVIEWED)
    expect((await next(run)).ready).toEqual([
      {
        id: 'notes',
        kind: 'generic',
        uses: 'my-skill',
        with: {},
        inputs: {
          card: '627',
          branch: 'feature/US-627-x',
          pr: 12,
          head: HEAD,
          verdict: 'approved',
          reviewedHead: HEAD,
        },
        attempt: 1,
      },
    ])
  })

  it('keeps no output.log for a step recorded without a final message', async () => {
    const run = open()
    await start(run, SOURCE, { card: '627' })
    await next(run)
    await record(run, 'implement', IMPLEMENTED)
    expect(run.files.existsSync(`${DIR}/steps/implement/output.log`)).toBe(false)
  })

  it('writes state.json through a temp file, never in place', async () => {
    const run = open()
    const written: string[] = []
    const writeFile = run.files.writeFile
    run.files.writeFile = async (path, content) => {
      written.push(path)
      await writeFile(path, content)
    }
    await start(run, SOURCE, { card: '627' })
    expect(written).toContain(`${DIR}/state.json.tmp`)
    expect(written).not.toContain(`${DIR}/state.json`)
    expect(run.files.existsSync(`${DIR}/state.json.tmp`)).toBe(false)
  })
})

describe('engine: outcomes and resume (AC-6)', () => {
  async function runUntilReview(result: unknown) {
    const run = open()
    await start(run, SOURCE, { card: '627' })
    await next(run)
    await record(run, 'implement', IMPLEMENTED)
    await next(run)
    await record(run, 'review', result)
    return run
  }

  it.each([
    ['failed', { status: 'failed', summary: 'one blocking finding', reason: 'blocking' }, 'failed'],
    ['needs-human', { status: 'needs-human', summary: 'a decision is needed' }, 'parked'],
  ] as const)('stops on a %s step and resumes from it', async (state, result, halted) => {
    const run = await runUntilReview(result)
    expect(await next(run)).toEqual({ run: halted, ready: [] })
    expect(statesOf(run)).toEqual({ implement: 'ok', review: state })

    expect(await start(run, SOURCE, { card: '627' })).toEqual({ status: 'resumed', warnings: [] })
    expect(stateOf(run).steps).toMatchObject({
      implement: { state: 'ok' },
      review: { state: 'pending' },
    })
    const resumed = await next(run)
    expect(resumed.ready.map(step => step.id)).toEqual(['review'])
    expect(resumed.ready[0]?.inputs).toEqual({ card: '627', pr: 12, head: HEAD })
  })

  it('records a result that breaks the kind contract as failed, invalid-result', async () => {
    const run = open()
    await start(run, SOURCE, { card: '627' })
    await next(run)
    const settled = await record(run, 'implement', { ...IMPLEMENTED, pr: '12' })
    expect(settled).toEqual({
      status: 'failed',
      reason: 'invalid-result',
      summary: 'the result does not match the implement contract',
      detail: 'pr: expected integer, found string "12"',
    })
    expect(await next(run)).toEqual({ run: 'failed', ready: [] })
    expect(stateOf(run).steps['implement']).toEqual({
      state: 'failed',
      executions: 1,
      summary: 'the result does not match the implement contract',
      reason: 'invalid-result',
      detail: 'pr: expected integer, found string "12"',
      outputs: {},
    })
  })

  it('starts over a run that recorded no step yet', async () => {
    const run = open()
    await start(run, SOURCE, { card: '627' })
    const now = new Date('2026-11-20T10:00:00.000Z')
    expect((await start(run, SOURCE, { card: '627', restart: true, now })).status).toBe('started')
    expect(run.files.existsSync(`${DIR}/archive/2026-11-20T10-00-00-000Z/state.json`)).toBe(true)
  })

  it('hands out again a step left running by an interrupted launch', async () => {
    const run = open()
    await start(run, SOURCE, { card: '627' })
    await next(run)
    // the process dies here: nothing is recorded
    expect(await start(run, SOURCE, { card: '627' })).toEqual({ status: 'resumed', warnings: [] })
    // the second launch of the step is its second execution (PR #714 Q4)
    expect((await next(run)).ready.map(step => [step.id, step.attempt])).toEqual([['implement', 2]])
  })

  it('does nothing on a complete run', async () => {
    const run = await runUntilReview(REVIEWED)
    expect(await start(run, SOURCE, { card: '627' })).toEqual({ status: 'complete', warnings: [] })
    expect(await next(run)).toEqual({ run: 'done', ready: [] })
  })

  it('archives the run and starts over on restart', async () => {
    const run = await runUntilReview(REVIEWED)
    const now = new Date('2026-11-20T10:00:00.000Z')
    expect(await start(run, SOURCE, { card: '627', restart: true, now })).toEqual({
      status: 'started',
      warnings: [],
    })
    expect(statesOf(run)).toEqual({ implement: 'pending', review: 'pending' })
    const archived = `${DIR}/archive/2026-11-20T10-00-00-000Z`
    expect(run.files.existsSync(`${archived}/state.json`)).toBe(true)
    expect(run.files.existsSync(`${archived}/workflow.yaml`)).toBe(true)
    expect(run.files.existsSync(`${archived}/steps/implement/result.json`)).toBe(true)
    expect(run.files.existsSync(`${DIR}/steps`)).toBe(false)
  })

  it.each([
    [
      'written by another version',
      (state: string) => JSON.stringify({ ...JSON.parse(state), schemaVersion: 2 }),
    ],
    ['that is not JSON', () => '{ "schemaVersion": 1, "steps"'],
  ])('archives a state file %s and starts over on restart (#712 r0-7)', async (_name, damage) => {
    const run = open()
    await start(run, SOURCE, { card: '627' })
    const broken = damage(run.files.readFileSync(`${DIR}/state.json`))
    await run.files.writeFile(`${DIR}/state.json`, broken)
    const now = new Date('2026-11-20T10:00:00.000Z')
    expect(await start(run, SOURCE, { card: '627', restart: true, now })).toEqual({
      status: 'started',
      warnings: [],
    })
    expect(statesOf(run)).toEqual({ implement: 'pending', review: 'pending' })
    expect(run.files.readFileSync(`${DIR}/archive/2026-11-20T10-00-00-000Z/state.json`)).toBe(
      broken,
    )
  })

  it('warns when the workflow file changed, and keeps the frozen copy', async () => {
    const run = open()
    await start(run, SOURCE, { card: '627' })
    const changed = { ...SOURCE, text: QUICK.replace('  review:\n    kind: review\n', '') }
    expect(await start(run, changed, { card: '627' })).toEqual({
      status: 'resumed',
      warnings: [
        `workflows/quick.yaml changed after this run started: the frozen copy in ${DIR} is used`,
      ],
    })
    expect(run.files.readFileSync(`${DIR}/workflow.yaml`)).toBe(QUICK)
    expect(Object.keys(stateOf(run).steps)).toEqual(['implement', 'review'])
  })

  it.each([
    [
      'next before start',
      (run: RunDirectory) => next(run),
      `run-not-started: no state.json in ${DIR}`,
    ],
    [
      'record before start',
      (run: RunDirectory) => record(run, 'implement', IMPLEMENTED),
      `run-not-started: no state.json in ${DIR}`,
    ],
  ])('refuses %s', async (_name, act, message) => {
    await expect(act(open())).rejects.toThrow(message)
  })

  it('refuses a result for a step the workflow does not have', async () => {
    const run = open()
    await start(run, SOURCE, { card: '627' })
    await expect(record(run, 'deploy', IMPLEMENTED)).rejects.toThrow(
      `step-unknown: deploy is not a step of ${DIR}`,
    )
  })

  it('refuses a state file written by another version', async () => {
    const run = open()
    await start(run, SOURCE, { card: '627' })
    const state = { ...stateOf(run), schemaVersion: 2 }
    await run.files.writeFile(`${DIR}/state.json`, JSON.stringify(state))
    await expect(next(run)).rejects.toThrow(
      `run-state-unreadable: ${DIR}/state.json has schema version 2, this version reads 1 — start over with --restart`,
    )
  })

  it('refuses to start from a workflow that is not valid', async () => {
    const text = QUICK.replace('version: 1', 'version: 2')
    await expect(start(open(), { ...SOURCE, text }, { card: '627' })).rejects.toThrow(
      'workflow-invalid: unknown value 2',
    )
  })

  it('refuses to resume the run of another card', async () => {
    const run = open()
    await start(run, SOURCE, { card: '627' })
    await expect(start(run, SOURCE, { card: '628' })).rejects.toThrow(
      `run-mismatch: ${DIR} is the run of card 627, not of card 628`,
    )
  })
})
