import {
  findingCountsOf,
  frozenConfiguration,
  hashOf,
  next,
  record,
  start,
  type RunDirectory,
} from '.'
import { buildMessage } from '../dispatch'
import { kindByName, settle } from '../kinds'
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

describe('#700 AC-3 review finding origin', () => {
  const finding = { id: 'a', severity: 'Minor', title: 'note', blocking: false }

  it.each(['new', 'carried'])('accepts origin %s', origin => {
    expect(
      settle(kindByName.review, { ...REVIEWED, findings: [{ ...finding, origin }] }).status,
    ).toBe('ok')
  })

  it.each([undefined, 'resolved'])('rejects invalid origin %s', origin => {
    expect(
      settle(kindByName.review, { ...REVIEWED, findings: [{ ...finding, origin }] }),
    ).toMatchObject({
      status: 'failed',
      reason: 'invalid-result',
    })
  })
})

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
          interactive: false,
          with: { gates: ['quality-gate'] },
          startState: 'In Progress',
          assignment: { value: 'me', source: 'default' },
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
          interactive: false,
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
    expect(run.files.existsSync(`${DIR}/steps/implement/handoff.md`)).toBe(false)
    expect(stateOf(run).steps['implement']).toEqual({
      state: 'ok',
      executions: 1,
      summary: 'PR opened',
      outputs: { branch: 'feature/US-627-x', pr: 12, head: HEAD },
    })
  })

  it('resumes an interrupted run and keeps each host and actual model (#696 AC-4/AC-5)', async () => {
    const run = open()
    await start(run, SOURCE, { card: '627' })
    await next(run)
    const pairRun = { host: 'pair-run', model: 'claude-sonnet-5-5', output: 'CLI result' } as const
    await record(run, 'implement', IMPLEMENTED, pairRun)
    expect((await next(run)).ready[0]).toMatchObject({ id: 'review', attempt: 1 })

    const resumed = { dir: run.dir, files: run.files }
    expect(await start(resumed, SOURCE, { card: '627' })).toMatchObject({ status: 'resumed' })
    expect((await next(resumed)).ready[0]).toMatchObject({ id: 'review', attempt: 2 })
    const session = { host: 'session', model: 'claude-opus-5-5', output: 'Session result' } as const
    await record(resumed, 'review', REVIEWED, session)

    expect((await next(resumed)).run).toBe('done')
    expect(stateOf(resumed).steps).toMatchObject({
      implement: { state: 'ok', executions: 1, host: 'pair-run', model: 'claude-sonnet-5-5' },
      review: { state: 'ok', executions: 2, host: 'session', model: 'claude-opus-5-5' },
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
    const text = `${QUICK}  notes:\n    kind: generic\n    skill: my-skill\n`
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
        interactive: false,
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

describe('engine: step context (#698 AC-1/AC-2/AC-6)', () => {
  const earlier = '## Implementation notes\n\n- The checklist is ready.'
  const latest = '## Review notes\n\n- Keep the current test.'

  it.each([
    ['default', '', undefined],
    ['handoff', '\n    context: handoff', earlier],
  ])('preserves review inputs with %s context', async (_mode, context, handoff) => {
    const run = open()
    const text = QUICK.replace('kind: review', `kind: review${context}`)
    await start(run, { ...SOURCE, text }, { card: '627' })
    await next(run)
    await record(run, 'implement', { ...IMPLEMENTED, handoff: earlier })

    const [review] = (await next(run)).ready
    expect(review).toMatchObject({ id: 'review', inputs: { card: '627', pr: 12, head: HEAD } })
    if (handoff === undefined) expect(review).not.toHaveProperty('handoff')
    else expect(review).toHaveProperty('handoff', handoff)
  })

  it.each([
    ['default', '', latest, latest],
    ['fresh', '\n    context: fresh', latest, undefined],
    ['missing', '', undefined, undefined],
    ['empty', '', '', undefined],
  ])(
    'uses the last executed step with %s context or handoff',
    async (_case, context, saved, expected) => {
      const run = open()
      const text = `${QUICK}  skipped:
    kind: generic
    skill: my-skill
    when: { output: review.verdict, is: [changes-requested] }
  notes:
    kind: generic
    skill: my-skill${context}
`
      await start(run, { ...SOURCE, text }, { card: '627' })
      await next(run)
      await record(run, 'implement', { ...IMPLEMENTED, handoff: earlier })
      await next(run)
      await record(run, 'review', saved === undefined ? REVIEWED : { ...REVIEWED, handoff: saved })

      const [notes] = (await next(run)).ready
      expect(notes).toMatchObject({ id: 'notes', inputs: { card: '627', pr: 12, head: HEAD } })
      if (expected === undefined) expect(notes).not.toHaveProperty('handoff')
      else expect(notes).toHaveProperty('handoff', expected)
    },
  )

  it('launches a literal before-prompt from YAML', async () => {
    const run = open()
    const prompt = 'Document ${card} literally.'
    const text = QUICK.replace(
      'kind: implement',
      `kind: implement\n    prompt: ${prompt}\n    prompt-at: before`,
    )
    await start(run, { ...SOURCE, text }, { card: '627' })

    const [step] = (await next(run)).ready
    if (step === undefined) throw new Error('expected implement launch')
    const message = buildMessage(step, kindByName.implement, {
      style: 'slash',
      isSafeText: () => true,
    })
    expect(message.split('/pair-process-implement')[0]).toContain(prompt)
  })
})

describe('engine: handoff storage (#698 AC-3)', () => {
  const handoff = `# Notes\n\n${'word '.repeat(797)}last`
  const path = `${DIR}/steps/implement/handoff.md`

  it.each([800, 801])('records an ok step with a %i-word handoff', async words => {
    const run = open()
    await start(run, SOURCE, { card: '627' })
    await next(run)
    const result = await record(run, 'implement', {
      ...IMPLEMENTED,
      handoff: words === 800 ? handoff : `${handoff} overflow`,
    })

    expect(result.status).toBe('ok')
    const stored = run.files.readFileSync(path)
    expect(stored).toContain(handoff)
    if (words === 800) expect(stored.trimEnd()).toBe(handoff)
    else {
      expect(stored).not.toContain('overflow')
      expect(stored.slice(handoff.length)).toMatch(/\btruncated\b/i)
    }
  })
})

describe('interactive launches (#696 AC-2)', () => {
  it('hands the host an interactive step', async () => {
    const run = open()
    const text = QUICK.replace('kind: implement\n', 'kind: implement\n    interactive: true\n')
    await start(run, { ...SOURCE, text }, { card: '627' })

    expect((await next(run)).ready[0]).toMatchObject({ id: 'implement', interactive: true })
  })
})

describe('loop rounds (#670 AC-1–AC-6)', () => {
  const text = `version: 1
name: quick
steps:
  implement:
    kind: implement
  rounds:
    kind: loop
    until: review
    max: 2
    on-max: escalate
    steps:
      review: { kind: review }
      fix: { kind: fix }
`
  const source = { text, file: 'workflows/quick.yaml' }
  const findings = [{ id: 'a', severity: 'Major', title: 'gap', blocking: true, origin: 'new' }]
  const failedReview = {
    status: 'failed',
    summary: 'gap',
    verdict: 'changes-requested',
    reviewedHead: HEAD,
    findings,
  }
  const fixed = {
    status: 'ok',
    summary: 'fixed',
    head: HEAD,
    resolutions: [{ id: 'a', status: 'resolved', reason: 'fixed' }],
  }

  async function opened(definition = source) {
    const run = open()
    await start(run, definition, { card: '627' })
    await next(run)
    await record(run, 'implement', IMPLEMENTED)
    return run
  }

  it('hands the host an interactive loop child (#696 AC-2)', async () => {
    const run = open()
    const interactive = text.replace(
      'review: { kind: review }',
      'review: { kind: review, interactive: true }',
    )
    await start(run, { ...source, text: interactive }, { card: '627' })
    await next(run)
    await record(run, 'implement', IMPLEMENTED)

    expect((await next(run)).ready[0]).toMatchObject({ id: 'rounds/review', interactive: true })
  })

  describe('#728 AC-3: legacy parked run migration', () => {
    const statePath = `${DIR}/state.json`
    const telemetryPath = `${DIR}/telemetry.jsonl`
    const parked = { executions: 2, reason: 'needs-human', outputs: { findings } }
    const originalState = {
      schemaVersion: 1,
      workflow: { name: 'quick', hash: hashOf(text) },
      card: '627',
      steps: {
        implement: { state: 'ok', executions: 2, outputs: { pr: 12, head: HEAD } },
        rounds: { state: 'needs-human', ...parked },
        'rounds/review': { state: 'failed', round: 2, executions: 2, outputs: { findings } },
        'rounds/fix': { state: 'ok', round: 2, executions: 2 },
      },
      loops: {
        rounds: { round: 2, max: 2, exhausted: true, untilResult: { findings } },
      },
      latest: { status: 'needs-human', head: HEAD },
    }
    const identity = { schema: 2, run: 'quick-627', workflow: 'quick', card: '627' }
    const tokens = {
      read: { value: 12, source: 'measured' },
      cached: { value: 4, source: 'measured' },
      written: { value: 3, source: 'measured' },
    }
    const implementation = {
      ...identity,
      type: 'step',
      step: 'implement',
      kind: 'implement',
      uses: 'pair-process-implement',
      host: 'pair-run',
      engine: 'codex',
      startedAt: '2026-11-21T10:00:00.000Z',
      durationMs: 400,
      tokens,
      attempt: 1,
    }
    const priorAttempt = { ...implementation, status: 'needs-human', reason: 'needs-human' }
    const successfulAttempt = { ...implementation, status: 'ok', attempt: 2 }
    const closing = {
      ...identity,
      type: 'run',
      status: 'parked',
      durationMs: 800,
      steps: 2,
      tokens,
    }
    const originalTelemetry = [priorAttempt, successfulAttempt, closing]
    const migratedState = {
      ...originalState,
      steps: { ...originalState.steps, rounds: { state: 'needs-decision', ...parked } },
    }
    const migratedTelemetry = [
      { ...priorAttempt, status: 'needs-decision' },
      successfulAttempt,
      closing,
    ]
    const telemetryText = (records: typeof originalTelemetry) =>
      records.map(record => `${JSON.stringify(record)}\n`).join('')

    function saved(state = originalState, telemetry = originalTelemetry) {
      return {
        dir: DIR,
        files: createMemoryFiles({
          [`${DIR}/workflow.yaml`]: text,
          [statePath]: `${JSON.stringify(state, null, 2)}\n`,
          [telemetryPath]: telemetryText(telemetry),
        }),
      }
    }

    const persistedFiles = (run: RunDirectory) => [
      stateOf(run),
      run.files
        .readFileSync(telemetryPath)
        .trimEnd()
        .split('\n')
        .map(line => JSON.parse(line) as unknown),
    ]

    it('renames saved statuses and preserves both files and the parked loop', async () => {
      const run = saved()
      expect(await start(run, source, { card: '627' })).toEqual({ status: 'parked', warnings: [] })
      expect(persistedFiles(run)).toEqual([migratedState, migratedTelemetry])
    })

    it('leaves already migrated files untouched on resume', async () => {
      const run = saved(migratedState, migratedTelemetry)
      const write = vi.spyOn(run.files, 'writeFile')

      expect(await start(run, source, { card: '627' })).toEqual({ status: 'parked', warnings: [] })
      expect(write).not.toHaveBeenCalled()
    })

    it('#728 AC-3 F3: preserves telemetry when replacement is interrupted and retries', async () => {
      const run = saved()
      const rename = run.files.rename
      const interrupt = vi.spyOn(run.files, 'rename').mockImplementation(async (from, to) => {
        if (to === telemetryPath) throw new Error('interrupted migration')
        await rename(from, to)
      })

      const started = await start(run, source, { card: '627' })
      expect(started.status).toBe('parked')
      expect(persistedFiles(run)).toEqual([migratedState, originalTelemetry])
      interrupt.mockRestore()

      expect(await start(run, source, { card: '627' })).toEqual({ status: 'parked', warnings: [] })
      expect(persistedFiles(run)).toEqual([migratedState, migratedTelemetry])
    })
  })

  it('exits on the until result before later steps', async () => {
    const run = await opened()
    expect((await next(run)).ready[0]).toMatchObject({
      id: 'rounds/review',
      round: 1,
      inputs: { pr: 12, head: HEAD },
    })
    await record(run, 'rounds/review', REVIEWED)
    expect(await next(run)).toEqual({ ready: [], run: 'done' })
    expect(run.files.existsSync(`${DIR}/steps/rounds/review/round-1/result.json`)).toBe(true)
  })

  it('passes failed review outputs to fix, then begins the next round with its latest head', async () => {
    const run = await opened()
    await next(run)
    await record(run, 'rounds/review', failedReview)
    expect((await next(run)).ready[0]).toMatchObject({
      id: 'rounds/fix',
      interactive: false,
      round: 1,
      inputs: { findings },
    })
    await record(run, 'rounds/fix', fixed)
    expect((await next(run)).ready[0]).toMatchObject({
      id: 'rounds/review',
      round: 2,
      inputs: { head: HEAD },
    })
  })

  it('#700 AC-3 passes the previous review findings into the next round', async () => {
    const run = await opened()
    const previous = [
      { id: 'a', severity: 'Major', title: 'gap', blocking: true, origin: 'new' },
      { id: 'b', severity: 'Minor', title: 'note', blocking: false, origin: 'new' },
    ]
    await next(run)
    await record(run, 'rounds/review', { ...failedReview, findings: previous })
    await next(run)
    await record(run, 'rounds/fix', fixed)
    expect((await next(run)).ready[0]).toMatchObject({
      id: 'rounds/review',
      round: 2,
      inputs: { findings: previous },
    })
  })

  it('#700 AC-3 retains each round’s finding counts across subsequent rounds and resume', async () => {
    const run = await opened()
    const finding = (id: string, origin: string) => ({
      id,
      severity: 'Major',
      title: id,
      blocking: true,
      origin,
    })
    await next(run)
    await record(run, 'rounds/review', {
      ...failedReview,
      findings: [finding('a', 'new'), finding('b', 'new')],
    })
    await next(run)
    await record(run, 'rounds/fix', fixed)
    await next(run)
    await record(run, 'rounds/review', {
      ...failedReview,
      findings: [finding('b', 'carried'), finding('c', 'new')],
    })
    const counts = [
      { open: 2, resolved: 0, new: 2 },
      { open: 2, resolved: 1, new: 1 },
    ]
    expect.soft(findingCountsOf(run, 'rounds/review', 1)).toEqual(counts[0])
    expect.soft(findingCountsOf(run, 'rounds/review', 2)).toEqual(counts[1])
    await next(run)
    await record(run, 'rounds/fix', fixed)
    expect((await next(run)).run).toBe('parked')
    expect(
      await start(run, source, { card: '627', moreRounds: 1, requestedBy: 'rucka' }),
    ).toMatchObject({ status: 'resumed' })
    expect.soft(findingCountsOf(run, 'rounds/review', 1)).toEqual(counts[0])
    expect(findingCountsOf(run, 'rounds/review', 2)).toEqual(counts[1])
  })

  describe('loop handoff (#698 AC-8)', () => {
    const reviewHandoff = '## Review notes\n\n- Add a regression test.'
    const fixHandoff = '## Fix notes\n\n- The new test covers the gap.'
    const withHandoff = {
      ...source,
      text: text
        .replace('review: { kind: review }', 'review: { kind: review, context: handoff }')
        .replace('fix: { kind: fix }', 'fix: { kind: fix, context: handoff }'),
    }

    it('passes the preceding step handoff into the first loop child', async () => {
      const run = open()
      const handoff = '## Implementation notes\n\n- The PR is ready.'
      await start(run, withHandoff, { card: '627' })
      await next(run)
      await record(run, 'implement', { ...IMPLEMENTED, handoff })

      const [review] = (await next(run)).ready
      expect(review).toMatchObject({ id: 'rounds/review', round: 1, handoff })
    })

    it('passes the failed review handoff to fix in the same round', async () => {
      const run = await opened(withHandoff)
      await next(run)
      await record(run, 'rounds/review', { ...failedReview, handoff: reviewHandoff })

      const [fix] = (await next(run)).ready
      expect(fix).toMatchObject({
        id: 'rounds/fix',
        round: 1,
        inputs: { findings },
        handoff: reviewHandoff,
      })
    })

    it.each([
      ['handoff', withHandoff, { ...fixed, handoff: fixHandoff }, fixHandoff],
      ['missing handoff', withHandoff, fixed, undefined],
      ['fresh review', source, { ...fixed, handoff: fixHandoff }, undefined],
    ])(
      'uses the immediate predecessor across rounds with %s',
      async (_, definition, result, expected) => {
        const run = await opened(definition)
        await next(run)
        await record(run, 'rounds/review', { ...failedReview, handoff: reviewHandoff })
        await next(run)
        await record(run, 'rounds/fix', result)

        const [review] = (await next(run)).ready
        expect(review).toMatchObject({ id: 'rounds/review', round: 2, inputs: { head: HEAD } })
        if (expected === undefined) expect(review).not.toHaveProperty('handoff')
        else expect(review).toHaveProperty('handoff', expected)
      },
    )
  })

  it('counts another failed step as a spent round and parks at max', async () => {
    const run = await opened()
    await next(run)
    await record(run, 'rounds/review', failedReview)
    await next(run)
    await record(run, 'rounds/fix', { ...fixed, status: 'failed', reason: 'gate' })
    expect((await next(run)).ready[0]).toMatchObject({ id: 'rounds/review', round: 2 })
    await record(run, 'rounds/review', failedReview)
    await next(run)
    await record(run, 'rounds/fix', fixed)
    expect((await next(run)).run).toBe('parked')
    expect(stateOf(run).steps.rounds).toMatchObject({
      state: 'exhausted',
      outputs: { findings },
    })
    expect(await start(run, source, { card: '627' })).toEqual({ status: 'parked', warnings: [] })
    expect(await start(run, source, { card: '627', moreRounds: 1, requestedBy: 'rucka' })).toEqual({
      status: 'resumed',
      warnings: [],
    })
    expect((await next(run)).ready[0]).toMatchObject({ id: 'rounds/review', round: 3 })
  })

  it('passes the latest loop head to a following review (#670-loop-outputs)', async () => {
    const run = open()
    await start(run, { ...source, text: text + '  final: { kind: review }\n' }, { card: '627' })
    await next(run)
    await record(run, 'implement', IMPLEMENTED)
    await next(run)
    await record(run, 'rounds/review', failedReview)
    await next(run)
    const newer = 'b'.repeat(40)
    await record(run, 'rounds/fix', { ...fixed, head: newer })
    await next(run)
    await record(run, 'rounds/review', { ...REVIEWED, reviewedHead: newer })
    expect((await next(run)).ready[0]?.inputs.head).toBe(newer)
  })

  it.each([false, true])(
    'keeps parked reconfiguration consistent with grant %s (#670-reconfigure-budget)',
    async grant => {
      const run = await opened()
      for (let round = 0; round < 2; round++) {
        await next(run)
        await record(run, 'rounds/review', failedReview)
        await next(run)
        await record(run, 'rounds/fix', fixed)
      }
      const configuration = {
        text: 'version: 1\nname: c\ndefaults: { engine: codex }\nsteps: { rounds: { max: 4 } }\n',
      }
      await start(run, source, {
        card: '627',
        reconfigure: true,
        configuration,
        ...(grant ? { moreRounds: 1 } : {}),
      })
      expect(stateOf(run).loops.rounds.max).toBe(grant ? 3 : 4)
      expect(stateOf(run).configuration).toBeDefined()
      expect(run.files.readFileSync(`${DIR}/configuration.yaml`, 'utf8')).toBe(configuration.text)
    },
  )

  it('increments attempts across rounds and grants (#670-telemetry-attempt)', async () => {
    const run = await opened()
    for (let attempt = 1; attempt <= 3; attempt++) {
      if (attempt === 3) await start(run, source, { card: '627', moreRounds: 1 })
      expect((await next(run)).ready[0]?.attempt).toBe(attempt)
      await record(run, 'rounds/review', failedReview)
      expect((await next(run)).ready[0]?.attempt).toBe(attempt)
      await record(run, 'rounds/fix', fixed)
    }
  })

  it('resumes needs-decision at the same step and round', async () => {
    const run = await opened()
    await next(run)
    await record(run, 'rounds/review', { status: 'needs-decision', summary: 'decision' })
    expect((await next(run)).run).toBe('parked')
    await start(run, source, { card: '627' })
    expect((await next(run)).ready[0]).toMatchObject({ id: 'rounds/review', round: 1 })
  })

  it('fails after max when on-max is fail', async () => {
    const run = open()
    const failSource = {
      text: text.replace('max: 2', 'max: 1').replace('on-max: escalate', 'on-max: fail'),
      file: source.file,
    }
    await start(run, failSource, { card: '627' })
    await next(run)
    await record(run, 'implement', IMPLEMENTED)
    await next(run)
    await record(run, 'rounds/review', failedReview)
    await next(run)
    await record(run, 'rounds/fix', fixed)
    expect((await next(run)).run).toBe('failed')
    expect(statesOf(run).rounds).toBe('exhausted')
    expect(await start(run, failSource, { card: '627' })).toEqual({
      status: 'failed',
      warnings: [],
    })
  })

  it('exits when until is the last step', async () => {
    const run = open()
    const lastSource = { text: text.replace('until: review', 'until: fix'), file: source.file }
    await start(run, lastSource, { card: '627' })
    await next(run)
    await record(run, 'implement', IMPLEMENTED)
    await next(run)
    await record(run, 'rounds/review', failedReview)
    await next(run)
    await record(run, 'rounds/fix', fixed)
    expect((await next(run)).run).toBe('done')
  })

  it.each([
    ['exhaustion', failedReview, 'exhausted'],
    ['convergence', REVIEWED, 'ok'],
  ] as const)(
    'routes to the fallback only after %s (#728 AC-13, AC-14)',
    async (_, result, state) => {
      const definition = {
        ...source,
        text:
          text
            .replace('max: 2', 'max: 1')
            .replace('on-max: escalate', 'escalate: { exhausted: continue }') +
          '  fallback: { kind: implement, when: { output: rounds.status, is: [exhausted] } }\n',
      }
      const run = await opened(definition)
      expect((await next(run)).ready[0]?.id).toBe('rounds/review')
      await record(run, 'rounds/review', result)
      if (state === 'exhausted') {
        expect((await next(run)).ready[0]?.id).toBe('rounds/fix')
        await record(run, 'rounds/fix', fixed)
        expect((await next(run)).ready[0]?.id).toBe('fallback')
      } else {
        expect(await next(run)).toMatchObject({
          run: 'done',
          ready: [],
          skipped: [{ id: 'fallback' }],
        })
      }
      expect(statesOf(run).rounds).toBe(state)
    },
  )

  it('parks at an explicit exhaustion stop and reopens only that loop with a grant (#728 AC-7, AC-13)', async () => {
    const definition = {
      ...source,
      text:
        text
          .replace('max: 2', 'max: 1')
          .replace('on-max: escalate', 'escalate: { exhausted: { do: stop, comment: Stuck } }') +
        '  final: { kind: review }\n',
    }
    const run = await opened(definition)
    await next(run)
    await record(run, 'rounds/review', failedReview)
    await next(run)
    await record(run, 'rounds/fix', fixed)
    expect(await next(run)).toEqual({ run: 'parked', ready: [] })
    expect(statesOf(run)).toMatchObject({ implement: 'ok', rounds: 'exhausted', final: 'pending' })
    expect((await start(run, definition, { card: '627' })).status).toBe('parked')
    expect((await start(run, definition, { card: '627', moreRounds: 1 })).status).toBe('resumed')
    expect((await next(run)).ready[0]).toMatchObject({ id: 'rounds/review', round: 2 })
  })

  it.each([
    ['stop', 'failed', []],
    ['continue', 'running', ['rounds/review']],
  ] as const)(
    'applies a child failed rule of %s before the until step (#728 AC-5, AC-7)',
    async (action, status, ready) => {
      const definition = {
        ...source,
        text: text.replace(
          '      review: { kind: review }\n      fix: { kind: fix }',
          `      build: { kind: implement, escalate: { failed: ${action} } }\n      review: { kind: review }`,
        ),
      }
      const run = await opened(definition)
      expect((await next(run)).ready[0]).toMatchObject({ id: 'rounds/build', round: 1 })
      await record(run, 'rounds/build', { status: 'failed', summary: 'build failed' })
      const after = await next(run)
      expect(after.run).toBe(status)
      expect(after.ready.map(step => step.id)).toEqual(ready)
      if (action === 'stop') {
        expect((await start(run, definition, { card: '627' })).status).toBe('resumed')
        expect((await next(run)).ready[0]).toMatchObject({
          id: 'rounds/build',
          round: 1,
          attempt: 2,
        })
      }
    },
  )

  it('uses only the frozen configuration max for a loop', async () => {
    const run = open()
    await start(run, source, {
      card: '627',
      configuration: {
        text: 'version: 1\nname: c\ndefaults: { engine: codex }\nsteps: { rounds: { max: 4 } }\n',
      },
    })
    expect(JSON.parse(run.files.readFileSync(`${DIR}/state.json`)).loops.rounds.max).toBe(4)
  })
})

describe('engine: outcomes and resume (AC-6)', () => {
  async function runUntilReview(result: unknown, source = SOURCE) {
    const run = open()
    await start(run, source, { card: '627' })
    await next(run)
    await record(run, 'implement', IMPLEMENTED)
    await next(run)
    await record(run, 'review', result)
    return run
  }

  it.each([
    ['failed', { status: 'failed', summary: 'one blocking finding', reason: 'blocking' }, 'failed'],
    ['needs-decision', { status: 'needs-decision', summary: 'a decision is needed' }, 'parked'],
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

  it.each([
    ['failed', 'failed'],
    ['blocked', 'parked'],
    ['needs-decision', 'parked'],
  ] as const)(
    'stops on explicit %s and resumes only that step (#728 AC-6, AC-7)',
    async (status, halted) => {
      const source = {
        ...SOURCE,
        text: `${QUICK}    escalate: { ${status}: stop }\n  later: { kind: implement }\n`,
      }
      const run = await runUntilReview({ status, summary: 'check failed', reason: 'check' }, source)
      expect(await next(run)).toEqual({ run: halted, ready: [] })
      expect(statesOf(run)).toEqual({ implement: 'ok', review: status, later: 'pending' })

      expect((await start(run, source, { card: '627' })).status).toBe('resumed')
      expect((await next(run)).ready[0]).toMatchObject({ id: 'review', attempt: 2 })
    },
  )

  it('keeps a continued failure settled when resuming a later blocked step (#728 AC-5, AC-7)', async () => {
    const source = {
      ...SOURCE,
      text: `version: 1
name: quick
steps:
  implement: { kind: implement, on-failed: continue }
  fallback:
    kind: implement
    when: { output: implement.status, is: [failed] }
    escalate: { blocked: stop }
`,
    }
    const run = open()
    await start(run, source, { card: '627' })
    await next(run)
    await record(run, 'implement', { status: 'failed', summary: 'first model failed' })
    expect((await next(run)).ready[0]?.id).toBe('fallback')
    await record(run, 'fallback', { status: 'blocked', summary: 'no token' })
    expect((await next(run)).run).toBe('parked')

    expect((await start(run, source, { card: '627' })).status).toBe('resumed')
    expect(statesOf(run).implement).toBe('failed')
    expect((await next(run)).ready[0]).toMatchObject({ id: 'fallback', attempt: 2 })
  })

  it('#728 AC-3 F2: keeps a legacy step parked until explicit resume', async () => {
    const run = await runUntilReview({ status: 'needs-decision', summary: 'a decision is needed' })
    const path = `${DIR}/state.json`
    const saved = stateOf(run)
    saved.steps['review'] = { ...saved.steps['review'], state: 'needs-human' }
    run.files.entries.set(path, JSON.stringify(saved))

    expect(await next(run)).toEqual({ run: 'parked', ready: [] })
    expect(stateOf(run).steps['review']).toEqual({
      ...saved.steps['review'],
      state: 'needs-decision',
    })
    expect((await start(run, SOURCE, { card: '627' })).status).toBe('resumed')
    expect((await next(run)).ready[0]).toMatchObject({ id: 'review', attempt: 2 })
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

describe('engine: on-failed (#708 AC-7)', () => {
  const FIX = { status: 'ok', summary: 'fixed', head: HEAD, resolutions: [] }
  const CHANGES = {
    status: 'failed',
    summary: 'blocking',
    reason: 'blocking-findings',
    verdict: 'changes-requested',
    reviewedHead: HEAD,
    findings: [{ id: 'F1', severity: 'Major', title: 't', blocking: true, origin: 'new' }],
  }
  const text = (policy: string) =>
    `${QUICK.replace('kind: review', `kind: review${policy}`)}  fix:\n    kind: fix\n`
  const opened = async (policy: string, changes = CHANGES) => {
    const run = open()
    await start(run, { text: text(policy), file: 'workflows/quick.yaml' }, { card: '627' })
    await record(run, 'implement', IMPLEMENTED)
    await next(run)
    await record(run, 'review', changes)
    return run
  }

  it.each([
    ['stop', '', 'failed'],
    ['continue', '\n    on-failed: continue', 'running'],
  ])('a failed step with %s leaves the run %s', async (_name, policy, run) => {
    expect((await next(await opened(policy))).run).toBe(run)
  })

  it('retains and forwards a failed review handoff (#698 AC-2/AC-3)', async () => {
    const handoff = '## Follow-up\n\n- Add the missing assertion.'
    const changes = { ...CHANGES, handoff }
    const run = await opened('\n    on-failed: continue', changes)

    expect(statesOf(run).review).toBe('failed')
    expect(run.files.readFileSync(`${DIR}/steps/review/handoff.md`).trimEnd()).toBe(handoff)
    expect((await next(run)).ready[0]).toMatchObject({
      id: 'fix',
      handoff,
      inputs: { findings: CHANGES.findings, pr: 12 },
    })
  })

  it('hands the next step the outputs of the failed one, and the last step decides the run', async () => {
    const run = await opened('\n    on-failed: continue')
    const { ready } = await next(run)
    expect(ready[0]).toMatchObject({ id: 'fix', inputs: { findings: CHANGES.findings, pr: 12 } })
    await record(run, 'fix', FIX)
    expect((await next(run)).run).toBe('done')
  })

  it('a failed last step with continue still fails the run', async () => {
    const run = await opened('\n    on-failed: continue')
    await next(run)
    await record(run, 'fix', {
      status: 'failed',
      summary: 'x',
      reason: 'gate',
      head: HEAD,
      resolutions: [],
    })
    expect((await next(run)).run).toBe('failed')
  })

  it('needs-decision parks the run whatever on-failed says', async () => {
    const run = open()
    await start(
      run,
      { text: text('\n    on-failed: continue'), file: 'workflows/quick.yaml' },
      { card: '627' },
    )
    await record(run, 'implement', IMPLEMENTED)
    await next(run)
    await record(run, 'review', { status: 'needs-decision', summary: 'x', reason: 'decide' })
    expect((await next(run)).run).toBe('parked')
  })
})

describe('engine: frozen configuration (#672 AC-7)', () => {
  const A = { text: 'name: a\n', override: { aliases: {} } }
  const B = { text: 'name: b\n' }
  const read = (run: RunDirectory) => stateOf(run) as { configuration?: unknown }

  it('freezes the copy and records the override in state.json', async () => {
    const run = open()
    await start(run, SOURCE, { card: '627', configuration: A })
    expect(frozenConfiguration(run)).toBe(A.text)
    expect(read(run).configuration).toEqual({ hash: hashOf(A.text), override: A.override })
  })

  it('a resume keeps the copy and reports a changed source', async () => {
    const run = open()
    await start(run, SOURCE, { card: '627', configuration: A })
    const resumed = await start(run, SOURCE, { card: '627', configuration: B })
    expect(frozenConfiguration(run)).toBe(A.text)
    expect(resumed.warnings.join()).toContain('configuration changed')
  })

  it('--reconfigure replaces the copy and leaves ok steps ok', async () => {
    const run = open()
    await start(run, SOURCE, { card: '627', configuration: A })
    await next(run)
    await record(run, 'implement', IMPLEMENTED)
    const resumed = await start(run, SOURCE, { card: '627', configuration: B, reconfigure: true })
    expect(resumed.warnings).toEqual([])
    expect(frozenConfiguration(run)).toBe(B.text)
    expect(read(run).configuration).toEqual({ hash: hashOf(B.text) })
    expect(statesOf(run)).toEqual({ implement: 'ok', review: 'pending' })
  })

  it('a run started without a configuration keeps none, and its resume says one now applies', async () => {
    const run = open()
    await start(run, SOURCE, { card: '627' })
    const resumed = await start(run, SOURCE, { card: '627', configuration: A })
    expect(frozenConfiguration(run)).toBeUndefined()
    expect(resumed.warnings.join()).toContain('started with no configuration')
  })
})

it('keeps the replacement head through a review/fix replay (#726)', async () => {
  const source = {
    file: 'delivery.yaml',
    text: `version: 1
name: delivery
steps:
  implement: { kind: implement }
  rounds:
    kind: loop
    until: review
    max: 2
    on-max: escalate
    steps:
      review: { kind: review }
      fix: { kind: fix }
  gate: { kind: gate, with: { checks: [head-unchanged] } }
`,
  }
  const run = open()
  await start(run, source, { card: '627' })
  await next(run)
  await record(run, 'implement', IMPLEMENTED)
  await next(run)
  await record(run, 'rounds/review', REVIEWED)
  await next(run)
  await record(run, 'gate', { status: 'failed', summary: 'Head moved', reason: 'head-changed' })

  const replacement = 'b'.repeat(40)
  const repaired = 'c'.repeat(40)
  await start(run, source, {
    card: '627',
    replay: { from: 'rounds', inputs: { head: replacement } },
  })
  expect((await next(run)).ready[0]).toMatchObject({
    id: 'rounds/review',
    round: 1,
    inputs: { head: replacement },
  })
  await record(run, 'rounds/review', {
    ...REVIEWED,
    status: 'failed',
    verdict: 'changes-requested',
    reviewedHead: replacement,
    findings: [{ id: 'F1', severity: 'Major', title: 'Regression', blocking: true, origin: 'new' }],
  })
  await start(run, source, { card: '627' })
  expect((await next(run)).ready[0]).toMatchObject({
    id: 'rounds/fix',
    round: 1,
    inputs: { head: replacement, findings: [{ id: 'F1' }] },
  })
  await record(run, 'rounds/fix', {
    status: 'ok',
    summary: 'Fixed',
    head: repaired,
    resolutions: [],
  })
  expect((await next(run)).ready[0]).toMatchObject({
    id: 'rounds/review',
    round: 2,
    inputs: { head: repaired },
  })
  await record(run, 'rounds/review', { ...REVIEWED, reviewedHead: repaired })
  expect((await next(run)).ready[0]).toMatchObject({
    id: 'gate',
    inputs: { reviewedHead: repaired },
  })
})
