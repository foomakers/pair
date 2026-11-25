import { runSteps, type StepEvent, type WorkflowHost } from '.'
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

describe('loop telemetry (#670 AC-6)', () => {
  it('records each inner execution with its round', async () => {
    const text = `version: 1
name: quick
steps:
  implement: { kind: implement }
  rounds:
    kind: loop
    until: review
    max: 2
    on-max: fail
    steps:
      review: { kind: review }
      fix: { kind: fix }
`
    let reviews = 0
    const failedReview = fenced({
      status: 'failed',
      summary: 'gap',
      verdict: 'changes-requested',
      reviewedHead: HEAD,
      findings: [{ id: 'f', severity: 'Major', title: 'gap', blocking: true }],
    })
    const fixed = fenced({
      status: 'ok',
      summary: 'fixed',
      head: HEAD,
      resolutions: [{ id: 'f', status: 'resolved', reason: 'fixed' }],
    })
    const { host } = fakeHost({
      'pair-process-implement': () => IMPLEMENTED,
      'pair-process-review': () => (++reviews === 1 ? failedReview : REVIEWED),
      'pair-process-fix': () => fixed,
    })
    await start({ files: host.files, dir: DIR }, { text, file: 'quick.yaml' }, { card: '627' })
    expect(
      (await runSteps(host, DIR, { host: 'pair-run', settings: () => ({ engine: 'claude' }) })).run,
    ).toBe('done')
    const records = host.files
      .readFileSync(`${DIR}/telemetry.jsonl`)
      .trimEnd()
      .split('\n')
      .map(line => JSON.parse(line))
    expect(
      records.filter(record => record.type === 'step').map(record => [record.step, record.round]),
    ).toEqual([
      ['implement', undefined],
      ['rounds/review', 1],
      ['rounds/fix', 1],
      ['rounds/review', 2],
    ])
  })
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

describe('runSteps: delegated implementation activation (#723 F8)', () => {
  it.each([
    ['Review', 'Review', 'done', ['skill sets Review', 'implementation starts']],
    ['none', 'none', 'done', ['implementation starts']],
    ['Done', 'none', 'done', ['implementation starts', 'host sets Done']],
    ['Review', 'Review', 'skipped', []],
  ] as const)('hands off state %s as %s for a %s run', async (state, target, result, expected) => {
    const board: string[] = []
    const { host, launched } = fakeHost({
      'pair-process-implement': (_step, message) => {
        if (result === 'skipped')
          return fenced({ status: 'failed', reason: 'card-held', summary: 'Held by alice' })
        const startState = /^- board-state: (.+)$/m.exec(message)?.[1] ?? 'In Progress'
        if (startState !== 'none') board.push(`skill sets ${startState}`)
        board.push('implementation starts')
        return IMPLEMENTED
      },
    })
    const text = `version: 1\nname: quick\nsteps:\n  implement: { kind: implement, state: ${state} }\n`
    await start({ files: host.files, dir: DIR }, { text, file: 'quick.yaml' }, { card: '627' })

    const outcome = await runSteps(
      {
        ...host,
        transition: async event => {
          if (event.state === 'running') board.push('host sets start state')
          if (event.state === 'ok' && state === 'Done') board.push('host sets Done')
        },
      },
      DIR,
    )

    expect(outcome.run).toBe(result)
    expect(board).toEqual(expected)
    expect(launched[0]?.message).toContain(`- board-state: ${target}\n`)
  })

  it.each([
    ['', '', undefined],
    ['', ', with: { assignee: alice }', 'alice'],
    ['assign: none\n', '', 'none'],
    ['assign: none\n', ', assign: alice', 'alice'],
    ['assign: me\n', ', with: { assignee: alice }', undefined],
  ] as const)(
    '#723 F12: delegates assignment with workflow %j and step options %j',
    async (workflow, options, expected) => {
      const { host, launched } = fakeHost({ 'pair-process-implement': () => IMPLEMENTED })
      const text = `version: 1\nname: quick\n${workflow}steps:\n  implement: { kind: implement, state: Review${options} }\n`
      await start({ files: host.files, dir: DIR }, { text, file: 'quick.yaml' }, { card: '627' })

      expect((await runSteps({ ...host, transition: async () => {} }, DIR)).run).toBe('done')
      expect(/^- assignee: (.+)$/m.exec(launched[0]?.message ?? '')?.[1]).toBe(expected)
    },
  )

  it('#723 F12: warns before launch when clearing the assignee requires a host hook', async () => {
    const { host, events, launched } = fakeHost({
      'pair-process-implement': () => {
        expect(events[0]).toMatchObject({
          state: 'running',
          summary: expect.stringMatching(/Warning:.*unassign.*assignCard/),
        })
        return IMPLEMENTED
      },
    })
    const text = `version: 1\nname: quick\nassign: unassign\nsteps:\n  implement: { kind: implement }\n`
    await start({ files: host.files, dir: DIR }, { text, file: 'quick.yaml' }, { card: '627' })

    expect((await runSteps(host, DIR)).run).toBe('done')
    expect(launched[0]?.message).toContain('- assignee: none\n')
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

  it.each(['blocked', 'needs-decision'])(
    '#728 AC-1: records %s in state and telemetry, then resumes at the stopped step',
    async status => {
      const answers = [fenced({ status, summary: 'waiting' }), REVIEWED]
      const { host, launched } = fakeHost({
        'pair-process-implement': () => IMPLEMENTED,
        'pair-process-review': () => answers.shift(),
      })
      const run = { files: host.files, dir: DIR }
      await start(run, SOURCE, { card: '627' })
      const outcome = await runSteps(host, DIR, {
        host: 'pair-run',
        settings: () => ({ engine: 'claude' }),
      })

      expect.soft(statesOf(host)).toEqual({ implement: 'ok', review: status })
      const records = host.files
        .readFileSync(`${DIR}/telemetry.jsonl`)
        .trimEnd()
        .split('\n')
        .map(line => JSON.parse(line))
      expect
        .soft(records)
        .toContainEqual(expect.objectContaining({ type: 'step', step: 'review', status }))
      expect(outcome.run).toBe('parked')

      await start(run, SOURCE, { card: '627' })
      expect((await runSteps(host, DIR)).run).toBe('done')
      expect(launched.map(one => one.step)).toEqual(['implement', 'review', 'review'])
    },
  )

  it.each(['exhausted', 'skipped', 'needs-human', 'unknown'])(
    '#728 AC-2: rejects a step result of %s and retries it on resume',
    async status => {
      const answers = [fenced({ status, summary: 'invalid status' }), IMPLEMENTED]
      const { host, launched } = fakeHost({
        'pair-process-implement': () => answers.shift(),
        'pair-process-review': () => REVIEWED,
      })
      const run = { files: host.files, dir: DIR }
      await start(run, SOURCE, { card: '627' })

      const outcome = await runSteps(host, DIR)
      expect(outcome.run).toBe('failed')
      expect(outcome.last).toMatchObject({
        step: 'implement',
        state: 'failed',
        reason: 'invalid-result',
        detail: `status: unknown value "${status}"`,
      })
      expect(statesOf(host)).toEqual({ implement: 'failed', review: 'pending' })

      await start(run, SOURCE, { card: '627' })
      expect((await runSteps(host, DIR)).run).toBe('done')
      expect(launched.map(one => one.step)).toEqual(['implement', 'implement', 'review'])
    },
  )

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
      settings: () => ({ engine: 'claude', model: 'claude-fable-5-2' }),
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
        schema: 2,
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
        schema: 2,
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
        schema: 2,
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

    await runSteps(host, DIR, { host: 'session', settings: () => ({ engine: 'claude' }) })

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
  const SETTINGS = { host: 'pair-run', settings: () => ({ engine: 'claude' }) } as const

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

describe('runSteps: settings per step (#672 AC-1)', () => {
  it('telemetry records the settings the configuration resolves for each step', async () => {
    const { host } = fakeHost({
      'pair-process-implement': () => IMPLEMENTED,
      'pair-process-review': () => REVIEWED,
    })
    await start({ files: host.files, dir: DIR }, SOURCE, { card: '627' })
    await runSteps(host, DIR, {
      host: 'pair-run',
      settings: id => ({ engine: 'claude', model: id === 'review' ? 'opus' : 'sonnet' }),
    })
    const lines = host.files.readFileSync(`${DIR}/telemetry.jsonl`).trimEnd().split('\n')
    expect(lines.map(line => (JSON.parse(line) as { model?: string }).model)).toEqual([
      'sonnet',
      'opus',
      undefined,
    ])
  })
})
