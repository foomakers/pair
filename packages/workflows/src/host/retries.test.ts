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

function startTest(steps: string, answers: readonly AgentLaunchResult[]) {
  const files = createMemoryFiles()
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
      return answer
    },
  }
  const text = `version: 1\nname: quick\nsteps:\n${steps}\n`
  return {
    sent,
    state: () => JSON.parse(files.readFileSync('/run/state.json')) as RunStateFile,
    telemetry: () =>
      files
        .readFileSync('/run/telemetry.jsonl')
        .trim()
        .split('\n')
        .map(line => JSON.parse(line) as StepTelemetry),
    run: async () => {
      await start(run, { text, file: 'quick.yaml' }, { card: '704' })
      return runSteps(host, run.dir, { host: 'pair-run', settings: () => ({ engine: 'fake' }) })
    },
  }
}

const work = (options = '') => `  work: { kind: generic, skill: work${options} }`

describe('#704: process retries', () => {
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
  const attempts = [1, 2].map(attempt => ({ ...diagnosis, attempt }))
  expect(test.state().steps['work']).toMatchObject({ state: 'ok', executions: 3, attempts })
  const safeDiagnosis = { ...diagnosis, detail: '[redacted]', stderrTail: ['[redacted]'] }
  expect(test.telemetry().filter(entry => entry.type === 'step')).toEqual([
    expect.objectContaining({ attempt: 1, reason: 'fault', diagnosis: safeDiagnosis }),
    expect.objectContaining({ attempt: 2, reason: 'fault', diagnosis: safeDiagnosis }),
    expect.objectContaining({ attempt: 3, status: 'ok' }),
  ])
  expect(outcome.faults).toEqual([{ step: 'work', attempts }])
})
