import { runSteps, settingsOf, type StepEvent, type WorkflowHost } from '.'
import { start, type StepLaunch } from '../engine'
import { createMemoryFiles } from '../engine/memory-files'

const QUICK = `version: 1
name: quick
steps:
  implement:
    kind: implement
  review:
    kind: review
`
const SOURCE = { text: QUICK, file: 'quick.yaml' }
const DIR = '/main/.pair/working/runs/quick-627'
const HEAD = 'a'.repeat(40)
const fenced = (value: unknown) => `Done.\n\`\`\`json\n${JSON.stringify(value)}\n\`\`\``
const IMPLEMENTED = fenced({
  status: 'ok',
  summary: 'PR opened',
  branch: 'feature/US-627-x',
  pr: 12,
  head: HEAD,
})
const REVIEWED = fenced({
  status: 'ok',
  summary: 'approved',
  verdict: 'approved',
  reviewedHead: HEAD,
  findings: [],
})

type FakeSkill = (step: StepLaunch, message: string) => string | undefined | Promise<never>

/** A host whose "agents" are functions: one fake skill per skill name. */
function fakeHost(skills: Record<string, FakeSkill>) {
  const events: StepEvent[] = []
  const launched: { step: string; message: string }[] = []
  const host: WorkflowHost = {
    files: createMemoryFiles(),
    style: 'slash',
    isSafeText: text => !text.includes('`') && !text.includes('\n'),
    launch: async (step, message) => {
      launched.push({ step: step.id, message })
      return (skills[step.uses] as FakeSkill)(step, message)
    },
    report: event => void events.push(event),
  }
  return { host, events, launched }
}

const statesOf = (host: WorkflowHost) =>
  Object.fromEntries(
    Object.entries(
      (
        JSON.parse(host.files.readFileSync(`${DIR}/state.json`)) as {
          steps: Record<string, { state: string }>
        }
      ).steps,
    ).map(([id, step]) => [id, step.state]),
  )

describe('runSteps: a linear run (AC-1)', () => {
  it('runs the steps in file order, reports each outcome and leaves every step ok', async () => {
    const { host, events, launched } = fakeHost({
      'pair-process-implement': () => IMPLEMENTED,
      'pair-process-review': () => REVIEWED,
    })
    await start({ files: host.files, dir: DIR }, SOURCE, { card: '627' })

    const outcome = await runSteps(host, DIR)

    expect(outcome.run).toBe('done')
    expect(launched.map(one => one.step)).toEqual(['implement', 'review'])
    expect(launched[1]?.message).toContain('- pr: 12')
    expect(events).toEqual([
      { step: 'implement', kind: 'implement', state: 'running' },
      { step: 'implement', kind: 'implement', state: 'ok', summary: 'PR opened' },
      { step: 'review', kind: 'review', state: 'running' },
      { step: 'review', kind: 'review', state: 'ok', summary: 'approved' },
    ])
    expect(statesOf(host)).toEqual({ implement: 'ok', review: 'ok' })
  })

  it('stops at the step that fails and launches nothing after it', async () => {
    const { host, launched } = fakeHost({
      'pair-process-implement': () =>
        fenced({ status: 'failed', summary: 'gate red', reason: 'quality-gate' }),
      'pair-process-review': () => REVIEWED,
    })
    await start({ files: host.files, dir: DIR }, SOURCE, { card: '627' })

    expect(await runSteps(host, DIR)).toEqual({
      run: 'failed',
      last: {
        step: 'implement',
        kind: 'implement',
        state: 'failed',
        summary: 'gate red',
        reason: 'quality-gate',
      },
    })
    expect(launched.map(one => one.step)).toEqual(['implement'])
    expect(statesOf(host)).toEqual({ implement: 'failed', review: 'pending' })
  })
})

describe('runSteps: results and resume (AC-4, AC-6)', () => {
  it.each([
    ['a final message with no result', () => 'All done.', 'invalid-result'],
    ['an agent that died or timed out', () => undefined, 'no-result'],
  ] as const)('fails the step on %s', async (_name, skill, reason) => {
    const { host } = fakeHost({ 'pair-process-implement': skill })
    await start({ files: host.files, dir: DIR }, SOURCE, { card: '627' })
    const outcome = await runSteps(host, DIR)
    expect(outcome.run).toBe('failed')
    expect(outcome.last).toMatchObject({ step: 'implement', state: 'failed', reason })
  })

  it('reports the reason and the detail of a result that breaks the contract', async () => {
    const { host, events } = fakeHost({ 'pair-process-implement': () => 'All done.' })
    await start({ files: host.files, dir: DIR }, SOURCE, { card: '627' })
    await runSteps(host, DIR)
    expect(events[1]).toEqual({
      step: 'implement',
      kind: 'implement',
      state: 'failed',
      summary: 'the final message carries no implement result',
      reason: 'invalid-result',
      detail: 'no fenced json block in the final message',
    })
  })

  it('runs for a host that listens to no event', async () => {
    const { host } = fakeHost({
      'pair-process-implement': () => IMPLEMENTED,
      'pair-process-review': () => REVIEWED,
    })
    await start({ files: host.files, dir: DIR }, SOURCE, { card: '627' })
    const silent: WorkflowHost = {
      files: host.files,
      style: host.style,
      isSafeText: host.isSafeText,
      launch: host.launch,
    }
    expect((await runSteps(silent, DIR)).run).toBe('done')
  })

  it('parks on needs-human, then resumes at that step without running the ok ones again', async () => {
    const answers = [fenced({ status: 'needs-human', summary: 'a decision is needed' }), REVIEWED]
    const { host, launched } = fakeHost({
      'pair-process-implement': () => IMPLEMENTED,
      'pair-process-review': () => answers.shift() as string,
    })
    const run = { files: host.files, dir: DIR }
    await start(run, SOURCE, { card: '627' })
    expect((await runSteps(host, DIR)).run).toBe('parked')

    await start(run, SOURCE, { card: '627' })
    expect((await runSteps(host, DIR)).run).toBe('done')
    expect(launched.map(one => one.step)).toEqual(['implement', 'review', 'review'])
  })

  it('leaves an interrupted step running on disk and runs it again at the next launch', async () => {
    const answers: FakeSkill[] = [() => Promise.reject(new Error('interrupted')), () => IMPLEMENTED]
    const { host, launched } = fakeHost({
      'pair-process-implement': (step, message) => (answers.shift() as FakeSkill)(step, message),
      'pair-process-review': () => REVIEWED,
    })
    const run = { files: host.files, dir: DIR }
    await start(run, SOURCE, { card: '627' })
    await expect(runSteps(host, DIR)).rejects.toThrow('interrupted')
    expect(statesOf(host)).toEqual({ implement: 'running', review: 'pending' })

    await start(run, SOURCE, { card: '627' })
    expect((await runSteps(host, DIR)).run).toBe('done')
    expect(launched.map(one => one.step)).toEqual(['implement', 'implement', 'review'])
  })

  it('fails a step whose inputs are not safe to hand to an agent, without launching it', async () => {
    const { host, launched } = fakeHost({ 'pair-process-implement': () => IMPLEMENTED })
    await start({ files: host.files, dir: DIR }, SOURCE, { card: '627`rm' })
    const outcome = await runSteps(host, DIR)
    expect(outcome.last).toMatchObject({ state: 'failed', reason: 'unsafe-value' })
    expect(launched).toEqual([])
  })
})

describe('runSteps: telemetry (US-697 AC-1, AC-2)', () => {
  it('appends one record per executed step, with the usage the host measured, then the closing record', async () => {
    const { host } = fakeHost({
      'pair-process-implement': () => IMPLEMENTED,
      'pair-process-review': () => REVIEWED,
    })
    const metered: WorkflowHost = {
      ...host,
      launch: (step, message, meter) => {
        meter({ read: 100, cached: 1000, written: 10 })
        return host.launch(step, message, meter)
      },
    }
    await start({ files: host.files, dir: DIR }, SOURCE, { card: '627' })
    // The clock is read at the start and at the end of each step.
    const clock = ['10:00:00', '10:01:30', '10:02:00', '10:02:30'].map(
      time => new Date(`2026-11-21T${time}.000Z`),
    )

    await runSteps(metered, DIR, {
      host: 'pair-run',
      settings: { engine: 'claude', model: 'claude-fable-5-2' },
      now: () => clock.shift() as Date,
    })

    const tokens = {
      read: { value: 100, source: 'measured' },
      cached: { value: 1000, source: 'measured' },
      written: { value: 10, source: 'measured' },
    }
    const identity = { run: 'quick-627', workflow: 'quick', card: '627' }
    const launchedWith = { host: 'pair-run', engine: 'claude', model: 'claude-fable-5-2' }
    expect(
      host.files
        .readFileSync(`${DIR}/telemetry.jsonl`)
        .trimEnd()
        .split('\n')
        .map(line => JSON.parse(line) as unknown),
    ).toEqual([
      {
        type: 'step',
        ...identity,
        step: 'implement',
        kind: 'implement',
        uses: 'pair-process-implement',
        ...launchedWith,
        startedAt: '2026-11-21T10:00:00.000Z',
        durationMs: 90_000,
        tokens,
        status: 'ok',
        attempt: 1,
      },
      {
        type: 'step',
        ...identity,
        step: 'review',
        kind: 'review',
        uses: 'pair-process-review',
        ...launchedWith,
        startedAt: '2026-11-21T10:02:00.000Z',
        durationMs: 30_000,
        tokens,
        status: 'ok',
        attempt: 1,
      },
      {
        type: 'run',
        ...identity,
        status: 'done',
        durationMs: 120_000,
        tokens: {
          read: { value: 200, source: 'measured' },
          cached: { value: 2000, source: 'measured' },
          written: { value: 20, source: 'measured' },
        },
        steps: 2,
      },
    ])
  })
})

describe('runSteps: a host that cannot measure usage (US-697 AC-4)', () => {
  it('estimates read from the message sent and written from the final message, as a lower bound', async () => {
    const answer = fenced({ status: 'failed', summary: 'gate red', reason: 'quality-gate' })
    const { host, launched } = fakeHost({ 'pair-process-implement': () => answer })
    await start({ files: host.files, dir: DIR }, SOURCE, { card: '627' })

    await runSteps(host, DIR, { host: 'session', settings: { engine: 'claude' } })

    const sent = launched[0]?.message.length as number
    const final = answer.length
    const [step] = host.files.readFileSync(`${DIR}/telemetry.jsonl`).split('\n')
    expect(JSON.parse(step as string)).toMatchObject({
      host: 'session',
      status: 'failed',
      reason: 'quality-gate',
      tokens: {
        read: { value: Math.ceil(sent / 4), source: 'estimated' },
        cached: { value: null, source: 'unknown' },
        written: { value: Math.ceil(final / 4), source: 'estimated' },
      },
      estimate: 'lower-bound-from-text',
    })
  })
})

describe('runSteps: the telemetry switch (US-697 AC-5)', () => {
  const SETTINGS = { host: 'pair-run', settings: { engine: 'claude' } } as const

  it('writes no file and runs the same when telemetry is off', async () => {
    const { host, events } = fakeHost({
      'pair-process-implement': () => IMPLEMENTED,
      'pair-process-review': () => REVIEWED,
    })
    await start({ files: host.files, dir: DIR }, SOURCE, { card: '627' })
    const off = await runSteps(host, DIR)
    expect(host.files.existsSync(`${DIR}/telemetry.jsonl`)).toBe(false)

    const on = fakeHost({
      'pair-process-implement': () => IMPLEMENTED,
      'pair-process-review': () => REVIEWED,
    })
    await start({ files: on.host.files, dir: DIR }, SOURCE, { card: '627' })
    expect(await runSteps(on.host, DIR, SETTINGS)).toEqual(off)
    expect(on.events).toEqual(events)
    expect(on.host.files.readFileSync(`${DIR}/state.json`)).toBe(
      host.files.readFileSync(`${DIR}/state.json`),
    )
  })

  it.each([
    ['a host that listens', true],
    ['a host that does not', false],
  ])(
    'never fails a step on a write error, for %s: reported once, the run goes on',
    async (_name, listens) => {
      const { host } = fakeHost({
        'pair-process-implement': () => IMPLEMENTED,
        'pair-process-review': () => REVIEWED,
      })
      const files = host.files
      const broken: WorkflowHost = {
        ...host,
        files: {
          ...files,
          writeFile: (path, content) =>
            path.includes('telemetry.jsonl')
              ? Promise.reject(new Error('EACCES: permission denied'))
              : files.writeFile(path, content),
        },
      }
      await start({ files, dir: DIR }, SOURCE, { card: '627' })
      const warnings: string[] = []

      const outcome = await runSteps(broken, DIR, {
        ...SETTINGS,
        ...(listens && { warn: (message: string) => void warnings.push(message) }),
      })

      expect(outcome.run).toBe('done')
      expect(statesOf(host)).toEqual({ implement: 'ok', review: 'ok' })
      expect(warnings).toEqual(
        listens
          ? ['telemetry was not written: EACCES: permission denied — the run goes on without it']
          : [],
      )
    },
  )
})

describe('settingsOf', () => {
  it('gives every step the settings of the run', () => {
    const run = { engine: 'claude', model: 'm' }
    expect(settingsOf(run, 'implement')).toBe(run)
    expect(settingsOf(run, 'review')).toBe(run)
  })
})
