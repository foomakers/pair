import { runSteps, settleAgentStep, type StepEvent, type WorkflowHost } from '.'
import { next, start, type StepLaunch } from '../engine'
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

it('#696/#704: settles a conversation from the final message even when its envelope contains other metadata', async () => {
  const files = createMemoryFiles()
  const run = { dir: DIR, files }
  await start(run, SOURCE, { card: '627' })
  const [step] = (await next(run)).ready
  const envelope = { final: IMPLEMENTED, result: { status: 'blocked' as const, summary: 'draft' } }
  const host: WorkflowHost = {
    files,
    style: 'instruction',
    isSafeText: () => true,
    launch: async () => {
      throw new Error('unexpected launch')
    },
  }
  expect(await settleAgentStep(host, run, step!, envelope)).toMatchObject({ status: 'ok', pr: 12 })
})

const telemetryOf = (host: WorkflowHost) =>
  host.files
    .readFileSync(`${DIR}/telemetry.jsonl`)
    .trimEnd()
    .split('\n')
    .map(line => JSON.parse(line))

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
      findings: [{ id: 'f', severity: 'Major', title: 'gap', blocking: true, origin: 'new' }],
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
    const records = telemetryOf(host)
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

it('#700 AC-3 records open, resolved and new findings for each review round', async () => {
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
  const finding = (id: string, origin: string) => ({
    id,
    severity: 'Major',
    title: id,
    blocking: true,
    origin,
  })
  let reviews = 0
  let firstState: unknown
  const { host } = fakeHost({
    'pair-process-implement': () => IMPLEMENTED,
    'pair-process-review': () =>
      fenced({
        status: 'failed',
        summary: 'gaps',
        verdict: 'changes-requested',
        reviewedHead: HEAD,
        findings:
          ++reviews === 1
            ? [finding('a', 'new'), finding('b', 'new')]
            : [finding('b', 'carried'), finding('c', 'new')],
      }),
    'pair-process-fix': () => {
      firstState ??= JSON.parse(host.files.readFileSync(`${DIR}/state.json`)).steps['rounds/review']
      return fenced({ status: 'ok', summary: 'fixed', head: HEAD, resolutions: [] })
    },
  })
  await start({ files: host.files, dir: DIR }, { text, file: 'quick.yaml' }, { card: '627' })
  await runSteps(host, DIR, { host: 'pair-run', settings: () => ({ engine: 'claude' }) })
  const secondState = JSON.parse(host.files.readFileSync(`${DIR}/state.json`)).steps[
    'rounds/review'
  ]
  const reviewRecords = telemetryOf(host).filter(record => record.step === 'rounds/review')
  const firstCounts = { open: 2, resolved: 0, new: 2 }
  const secondCounts = { open: 2, resolved: 1, new: 1 }
  expect.soft(firstState).toMatchObject({ round: 1, findingCounts: firstCounts })
  expect.soft(secondState).toMatchObject({ round: 2, findingCounts: secondCounts })
  expect(reviewRecords).toMatchObject([
    { round: 1, findingCounts: firstCounts },
    { round: 2, findingCounts: secondCounts },
  ])
})

describe('#728 AC-17: escalation telemetry', () => {
  it('records exhaustion before ending a run skipped by assignment (#723 AC-4, #728 AC-13/14/17)', async () => {
    const text = `version: 1
name: quick
assign: none
steps:
  implement: { kind: implement }
  rounds:
    kind: loop
    until: review
    max: 1
    escalate: { exhausted: continue }
    steps:
      review: { kind: review }
      fix: { kind: implement, when: { output: implement.status, is: [failed] } }
  fallback:
    kind: implement
    assign: me
    when: { output: rounds.status, is: [exhausted] }
`
    const { host, launched } = fakeHost({
      'pair-process-implement': () => IMPLEMENTED,
      'pair-process-review': () => fenced({ status: 'failed', summary: 'gap' }),
    })
    const assignCard: NonNullable<WorkflowHost['assignCard']> = async assign =>
      assign === 'me' ? 'held by alice' : undefined
    await start({ files: host.files, dir: DIR }, { ...SOURCE, text }, { card: '627' })

    const outcome = await runSteps({ ...host, assignCard }, DIR, {
      host: 'pair-run',
      settings: () => ({ engine: 'claude' }),
    })

    expect(outcome).toMatchObject({
      run: 'skipped',
      last: { step: 'fallback', reason: 'card-held', summary: 'held by alice' },
    })
    expect(launched.map(one => one.step)).toEqual(['implement', 'rounds/review'])
    expect(statesOf(host)).toMatchObject({ rounds: 'exhausted', fallback: 'pending' })
    const records = telemetryOf(host)
    expect(records.filter(record => record.type === 'step').map(record => record.step)).toEqual([
      'implement',
      'rounds/review',
      'rounds',
    ])
    expect(records.at(-2)).toMatchObject({
      status: 'exhausted',
      escalate: { status: 'exhausted', do: 'continue' },
    })
    expect(records.at(-1)).toMatchObject({ type: 'run', status: 'skipped' })
  })

  it.each([
    ['failed', 'escalate: { failed: continue }', 'done', 'continue'],
    [
      'needs-decision',
      'escalate: { needs-decision: { do: stop, comment: Pick } }',
      'parked',
      'stop',
    ],
    ['blocked', '', 'parked', undefined],
    ['failed', 'on-failed: continue', 'done', undefined],
    ['ok', 'escalate: { failed: stop }', 'done', undefined],
  ])(
    'records %s with policy %s only when its explicit rule fires',
    async (status, rule, end, action) => {
      const { host } = fakeHost({
        'pair-process-implement': () => IMPLEMENTED,
        'pair-process-review': () =>
          status === 'ok' ? REVIEWED : fenced({ status, summary: 'waiting', reason: 'condition' }),
      })
      const text = `${QUICK}${rule === '' ? '' : `    ${rule}\n`}  later: { kind: implement }\n`
      await start({ files: host.files, dir: DIR }, { ...SOURCE, text }, { card: '627' })

      const outcome = await runSteps(host, DIR, {
        host: 'pair-run',
        settings: () => ({ engine: 'claude' }),
      })

      expect(outcome.run).toBe(end)
      const row = telemetryOf(host).find(
        record => record.type === 'step' && record.step === 'review',
      )
      expect(row).toMatchObject({ schema: 2, status })
      if (action === undefined) expect(row).not.toHaveProperty('escalate')
      else expect(row?.escalate).toEqual({ status, do: action })
    },
  )

  it.each([
    ['escalate: { exhausted: continue }', '', 'done', 'continue', 3],
    [
      'escalate: { exhausted: stop }',
      ', when: { output: implement.status, is: [failed] }',
      'parked',
      'stop',
      2,
    ],
    ['on-max: fail', '', 'failed', undefined, 3],
    ['on-max: escalate', '', 'parked', undefined, 3],
  ])('records exhausted with policy %s and child condition %s', async (...scenario) => {
    const [rule, when, end, action, steps] = scenario
    const text = `version: 1
name: quick
steps:
  implement: { kind: implement }
  rounds:
    kind: loop
    until: review
    max: 1
    ${rule}
    steps:
      review: { kind: review }
      fix: { kind: implement${when} }
`
    const { host, launched } = fakeHost({
      'pair-process-implement': () => IMPLEMENTED,
      'pair-process-review': () => fenced({ status: 'failed', summary: 'gap' }),
    })
    const metered: WorkflowHost = {
      ...host,
      launch: (step, message, meter) => {
        meter({ read: 7, cached: 3, written: 2 })
        return host.launch(step, message, meter)
      },
    }
    await start({ files: host.files, dir: DIR }, { ...SOURCE, text }, { card: '627' })

    let tick = 0
    const outcome = await runSteps(metered, DIR, {
      host: 'pair-run',
      settings: () => ({ engine: 'claude' }),
      now: () => new Date(10 * tick++),
    })

    expect(outcome.run).toBe(end)
    expect(statesOf(host)).toMatchObject({
      rounds: 'exhausted',
      'rounds/fix': when === '' ? 'ok' : 'skipped',
    })
    expect(launched).toHaveLength(steps)
    const records = telemetryOf(host)
    const rounds = records.filter(record => record.type === 'step' && record.step === 'rounds')
    expect(rounds).toMatchObject([
      {
        schema: 2,
        kind: 'loop',
        status: 'exhausted',
        round: 1,
        tokens: { read: { value: 0 }, cached: { value: 0 }, written: { value: 0 } },
      },
    ])
    if (action === undefined) expect(rounds[0]).not.toHaveProperty('escalate')
    else expect(rounds[0]?.escalate).toEqual({ status: 'exhausted', do: action })
    expect(records.at(-1)).toMatchObject({
      type: 'run',
      status: end,
      steps,
      durationMs: 10 * steps,
      tokens: {
        read: { value: 7 * steps, source: 'measured' },
        cached: { value: 3 * steps, source: 'measured' },
        written: { value: 2 * steps, source: 'measured' },
      },
    })
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
      const final = await (skills[step.uses] as FakeSkill)(step, message)
      return final === undefined
        ? {
            fault: {
              kind: 'crash',
              detail: 'engine exited',
              exitCode: 1,
              signal: null,
              elapsedMs: 9,
              stderrTail: [],
            },
          }
        : { final }
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

describe('#728 AC-8: escalation comments', () => {
  const source = {
    ...SOURCE,
    text: `${QUICK}    escalate:
      needs-decision: { do: stop, comment: 'Decision: {reason}. Confirm: {reason}.' }
      blocked: { do: stop, comment: 'Blocked: {reason}.' }
  later: { kind: implement }
`,
  }
  const card = '627'
  const result = (status = 'needs-decision', reason?: string) =>
    fenced({ status, summary: 'waiting', ...(reason !== undefined && { reason }) })
  type Comment = { card: string; marker: string; body: string }

  it('uses one card comment for the same stop and new comments for a new status and restart', async () => {
    const answers = [
      result('needs-decision', 'pick A or B'),
      result('needs-decision', 'pick A or B'),
      result('blocked'),
      result('needs-decision', 'pick A or B'),
    ]
    const fake = fakeHost({
      'pair-process-implement': () => IMPLEMENTED,
      'pair-process-review': () => answers.shift(),
    })
    const comments = new Map<string, Comment>()
    const host = {
      ...fake.host,
      commentOnCard: async (comment: Comment) => {
        expect(statesOf(host).review).toMatch(/^(needs-decision|blocked)$/)
        comments.set(comment.marker, comment)
      },
    }
    const run = { files: host.files, dir: DIR }
    const stop = async (restart = false) => {
      await start(run, source, { card, restart })
      expect((await runSteps(host, DIR)).run).toBe('parked')
    }

    await stop()
    await stop()
    const afterRetry = [...comments.values()]
    expect.soft(afterRetry).toEqual([
      {
        card,
        marker: expect.stringMatching(/\S/),
        body: 'Decision: pick A or B. Confirm: pick A or B.',
      },
    ])
    await stop()
    await stop(true)
    expect([...comments.values()].map(comment => comment.body)).toEqual([
      'Decision: pick A or B. Confirm: pick A or B.',
      'Blocked: no reason given.',
      'Decision: pick A or B. Confirm: pick A or B.',
    ])
    expect(fake.launched.map(step => step.step)).not.toContain('later')
  })

  it.each(['absent', 'unavailable'] as const)(
    'keeps the workflow parked and warns when the comment host is %s',
    async capability => {
      const fake = fakeHost({
        'pair-process-implement': () => IMPLEMENTED,
        'pair-process-review': () => result(),
      })
      const warn = vi.fn()
      const commentOnCard = vi.fn(async (_comment: Comment) => {
        throw new Error('permission denied')
      })
      const host = { ...fake.host, warn, ...(capability === 'unavailable' && { commentOnCard }) }

      await start({ files: host.files, dir: DIR }, source, { card })
      expect((await runSteps(host, DIR)).run).toBe('parked')
      expect(statesOf(host)).toMatchObject({ review: 'needs-decision', later: 'pending' })
      if (capability === 'unavailable') expect.soft(commentOnCard).toHaveBeenCalledOnce()
      expect(warn).toHaveBeenCalledWith(
        expect.stringMatching(/comment.*(?:not written|could not be written)/i),
      )
    },
  )

  it('posts again when another round exhausts the loop, including after a skipped final step', async () => {
    const text = `version: 1
name: quick
steps:
  implement: { kind: implement }
  rounds:
    kind: loop
    until: review
    max: 1
    escalate: { exhausted: { do: stop, comment: 'Review did not converge.' } }
    steps:
      review: { kind: review }
      fix: { kind: implement, when: { output: implement.status, is: [failed] } }
`
    const fake = fakeHost({
      'pair-process-implement': () => IMPLEMENTED,
      'pair-process-review': () => result('failed'),
    })
    const comments = new Map<string, string>()
    const host = {
      ...fake.host,
      commentOnCard: async ({ marker, body }: Comment) => void comments.set(marker, body),
    }
    const run = { files: host.files, dir: DIR }
    const telemetry = { host: 'pair-run' as const, settings: () => ({ engine: 'claude' }) }
    const loop = { ...SOURCE, text }

    await start(run, loop, { card })
    expect((await runSteps(host, DIR, telemetry)).run).toBe('parked')
    expect((await start(run, loop, { card })).status).toBe('parked')
    expect.soft([...comments.values()]).toEqual(['Review did not converge.'])
    await start(run, loop, { card, moreRounds: 1 })
    expect((await runSteps(host, DIR, telemetry)).run).toBe('parked')
    expect([...comments.values()]).toEqual(['Review did not converge.', 'Review did not converge.'])
  })
})

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
