import { createMemoryFiles } from '../engine/memory-files'
import { start, type RunStateFile } from '../engine'
import type { StepTelemetry } from '../telemetry'
import { runSteps, type AgentLaunchResult, type WorkflowHost } from '.'

const result = (status: string, reason?: string): AgentLaunchResult => ({
  final: `\`\`\`json\n${JSON.stringify({ status, summary: status, reason })}\n\`\`\``,
})
const ok = result('ok')
const crash: AgentLaunchResult = {
  fault: {
    kind: 'crash',
    detail: 'agent exited',
    exitCode: 1,
    signal: null,
    elapsedMs: 83,
    stderrTail: ['before exit'],
  },
}
const malformed = { final: 'no JSON' }

function startTest(steps: string, answers: readonly (AgentLaunchResult | Error)[]) {
  const files = createMemoryFiles()
  const rename = files.rename
  const refused = new Map<string, { count: number; message: string }>()
  let interruptedRetry: string | undefined
  files.rename = async (from, to) => {
    const failure = refused.get(to)
    if (failure) {
      if (--failure.count === 0) refused.delete(to)
      throw new Error(failure.message)
    }
    await rename(from, to)
    if (to === statePath && interruptedRetry !== undefined) {
      const saved = state().steps[interruptedRetry]
      if (saved?.executions === 2 && saved.attempts?.[0]?.attempt === 1) {
        interruptedRetry = undefined
        throw new Error('retry reservation interrupted')
      }
    }
  }
  const run = { dir: '/run', files }
  const sent: { attempt: number; round?: number | undefined; message: string }[] = []
  const host: WorkflowHost = {
    files,
    style: 'instruction',
    isSafeText: () => true,
    launch: async ({ attempt, round }, message) => {
      const answer = answers[sent.length]
      sent.push({ attempt, round, message })
      if (!answer) throw new Error('unexpected launch')
      if (answer instanceof Error) throw answer
      return answer
    },
  }
  const text = `version: 1\nname: quick\nsteps:\n${steps}\n`
  const statePath = '/run/state.json'
  const state = () => JSON.parse(files.readFileSync(statePath)) as RunStateFile
  return {
    sent,
    state,
    refuseNextTelemetryWrites: (count: number) => {
      refused.set('/run/telemetry.jsonl', { count, message: 'write refused' })
    },
    interruptResultWrite: (id: string) => {
      refused.set(`/run/steps/${id}/result.json`, { count: 1, message: 'result write interrupted' })
    },
    interruptRetryReservation: (id: string) => {
      interruptedRetry = id
    },
    useLegacyState: () =>
      files.writeFile(
        statePath,
        JSON.stringify(state(), (key, value) => (key === 'remainingRetries' ? undefined : value)),
      ),
    telemetry: () =>
      files
        .readFileSync('/run/telemetry.jsonl')
        .trim()
        .split('\n')
        .map(line => JSON.parse(line) as StepTelemetry),
    run: async (engine = 'fake') => {
      await start(run, { text, file: 'quick.yaml' }, { card: '704' })
      return runSteps(host, run.dir, { host: 'pair-run', settings: () => ({ engine }) })
    },
  }
}

const work = (options = '') => `  work: { kind: generic, skill: work${options} }`

describe('#704: process retries', () => {
  it.each([1, 2])(
    '#704 F18: settles a persisted exhausted attempt from its original execution after %i refused writes',
    async count => {
      const test = startTest(work(', retries: 0'), [crash])
      test.interruptResultWrite('work')
      await expect(test.run('first-engine')).rejects.toThrow('result write interrupted')
      test.refuseNextTelemetryWrites(count)
      expect((await test.run('later-engine')).run).toBe('parked')
      expect(test.sent).toHaveLength(1)
      expect(test.telemetry()[0]).toMatchObject({
        engine: 'first-engine',
        durationMs: 83,
        tokens: { read: { value: null, source: 'unknown' } },
        diagnosis: { kind: 'crash' },
      })
    },
  )

  it.each([crash, malformed])(
    'relaunches with the identical message and next attempt (AC-2)',
    async fault => {
      const test = startTest(work(', retries: 1'), [fault, ok])
      expect((await test.run()).run).toBe('done')
      expect(test.sent.map(attempt => attempt.attempt)).toEqual([1, 2])
      expect(test.sent[1]?.message).toBe(test.sent[0]?.message)
    },
  )

  it.each([
    [crash, 'parked', 'blocked', 'fault'],
    [malformed, 'failed', 'failed', 'invalid-result'],
  ] as const)(
    'uses the last fault when retries are exhausted (AC-3)',
    async (last, run, state, reason) => {
      const test = startTest(work(', retries: 1'), [crash, last])
      expect(await test.run()).toMatchObject({ run, last: { state, reason } })
      expect(test.sent).toHaveLength(2)
    },
  )

  it.each([
    { path: 'work', steps: work(', retries: 0') },
    {
      path: 'loop/work/round-1',
      steps: `  loop:\n    kind: loop\n    until: work\n    max: 1\n    on-max: fail\n    steps:\n    ${work(', retries: 0')}`,
    },
  ])('#704 F2: finalizes the recorded fault at $path on resume (AC-2, AC-3)', async row => {
    const test = startTest(row.steps, [crash, ok])
    test.interruptResultWrite(row.path)
    await expect(test.run()).rejects.toThrow('result write interrupted')

    expect(await test.run()).toMatchObject({ run: 'parked', last: { reason: 'fault' } })
    expect(test.sent.map(attempt => attempt.attempt)).toEqual([1])
    expect(test.telemetry().filter(entry => entry.diagnosis !== undefined)).toHaveLength(1)
  })

  it.each([
    { id: 'work', round: undefined, steps: work(', retries: 1') },
    {
      id: 'loop/work',
      round: 1,
      steps: `  loop:\n    kind: loop\n    until: work\n    max: 1\n    on-max: fail\n    steps:\n    ${work(', retries: 1')}`,
    },
  ])('#704 F10: restores fault telemetry for $id after reservation (AC-4)', async row => {
    const test = startTest(row.steps, [crash, ok])
    test.interruptRetryReservation(row.id)
    await expect(test.run()).rejects.toThrow('retry reservation interrupted')
    const outcome = await test.run()
    expect(outcome).toMatchObject({
      run: 'done',
      faults: [{ step: row.id, attempts: [{ attempt: 1, kind: 'crash' }] }],
    })

    const entries = test.telemetry().filter(entry => entry.type === 'step')
    expect(entries).toEqual([
      expect.objectContaining({
        step: row.id,
        host: 'pair-run',
        engine: 'fake',
        attempt: 1,
        ...(row.round !== undefined && { round: row.round }),
        reason: 'fault',
        diagnosis: {
          kind: 'crash',
          detail: '[redacted]',
          exitCode: 1,
          signal: null,
          elapsedMs: 83,
          stderrTail: ['[redacted]'],
        },
      }),
      expect.objectContaining({ step: row.id, status: 'ok' }),
    ])

    await test.run()
    expect(test.telemetry().filter(entry => entry.diagnosis !== undefined)).toHaveLength(1)
  })

  it.each([
    { retries: 1, legacy: false },
    { retries: 2, legacy: false },
    { retries: 1, legacy: true },
  ])(
    '#704 F2: resumes with the unspent part of a budget of $retries (AC-2, legacy=$legacy)',
    async ({ retries, legacy }) => {
      const test = startTest(work(`, retries: ${retries}`), [
        crash,
        new Error('interrupted'),
        crash,
        ok,
      ])
      await expect(test.run()).rejects.toThrow('interrupted')
      expect(test.state().steps['work']).toMatchObject({ state: 'running', executions: 2 })
      if (legacy) await test.useLegacyState()

      expect(await test.run()).toMatchObject({ run: retries === 1 ? 'parked' : 'done' })
      expect(test.sent.map(attempt => attempt.attempt)).toEqual(
        retries === 1 ? [1, 2, 3] : [1, 2, 3, 4],
      )
      expect(new Set(test.sent.map(attempt => attempt.message)).size).toBe(1)
    },
  )

  it('routes the exhausted fault through blocked escalation (AC-3)', async () => {
    const steps = `${work(', retries: 0, escalate: { blocked: continue }')}
  fallback: { kind: generic, skill: work, when: { output: work.status, is: [blocked] } }`
    const test = startTest(steps, [crash, ok])
    expect(await test.run()).toMatchObject({ run: 'done', last: { step: 'fallback' } })
  })

  it('keeps legacy fault handling when retries is absent (AC-2)', async () => {
    const test = startTest(work(), [crash])
    expect(await test.run()).toMatchObject({ run: 'failed', last: { reason: 'no-result' } })
    expect(test.sent).toHaveLength(1)
  })

  it.each(['failed', 'blocked', 'needs-decision'])(
    'never retries a returned %s (AC-2)',
    async status => {
      const agent = '  work: { kind: implement, retries: 2 }'
      const test = startTest(agent, [result(status, 'invalid-result')])
      expect(await test.run()).toMatchObject({ last: { state: status } })
      expect(test.sent).toHaveLength(1)
    },
  )

  it('retries a loop child within its one allowed round (AC-5)', async () => {
    const steps = `  loop:
    kind: loop
    until: work
    max: 1
    on-max: fail
    steps:
    ${work(', retries: 1')}`
    const test = startTest(steps, [crash, ok])
    expect((await test.run()).run).toBe('done')
    expect(test.sent.map(attempt => attempt.round)).toEqual([1, 1])
  })
})

it('#704 AC-4: records every fault even when a retry succeeds', async () => {
  const test = startTest(work(', retries: 2'), [crash, crash, ok])
  const outcome = await test.run()
  const diagnosis = {
    kind: 'crash',
    detail: 'agent exited',
    exitCode: 1,
    signal: null,
    elapsedMs: 83,
    stderrTail: ['before exit'],
  }
  const attempts = [1, 2].map(attempt => ({
    ...diagnosis,
    attempt,
    origin: { host: 'pair-run', engine: 'fake' },
  }))
  expect(test.state().steps['work']).toMatchObject({ state: 'ok', executions: 3, attempts })
  const safeDiagnosis = { ...diagnosis, detail: '[redacted]', stderrTail: ['[redacted]'] }
  expect(test.telemetry().filter(entry => entry.type === 'step')).toEqual([
    expect.objectContaining({ attempt: 1, reason: 'fault', diagnosis: safeDiagnosis }),
    expect.objectContaining({ attempt: 2, reason: 'fault', diagnosis: safeDiagnosis }),
    expect.objectContaining({ attempt: 3, status: 'ok' }),
  ])
  expect(outcome.faults).toEqual([{ step: 'work', attempts }])
})
