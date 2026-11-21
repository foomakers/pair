import {
  closeRun,
  estimated,
  measured,
  recordStep,
  TELEMETRY_FILE,
  type StepExecution,
  type Tokens,
} from '.'
import { start, type RunDirectory } from '../engine'
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
const FILE = `${DIR}/${TELEMETRY_FILE}`

async function open(): Promise<RunDirectory> {
  const run = { files: createMemoryFiles(), dir: DIR }
  await start(run, SOURCE, { card: '627' })
  return run
}

const recordsOf = (run: RunDirectory): unknown[] =>
  run.files
    .readFileSync(FILE)
    .trimEnd()
    .split('\n')
    .map(line => JSON.parse(line) as unknown)

const IMPLEMENT: StepExecution = {
  step: { id: 'implement', kind: 'implement', uses: 'pair-process-implement' },
  host: 'pair-run',
  settings: { engine: 'claude', model: 'claude-fable-5-2', effort: 'high' },
  startedAt: new Date('2026-11-21T10:00:00.000Z'),
  durationMs: 90_000,
  tokens: measured({ read: 100, cached: 1000, written: 10 }),
  status: 'ok',
}
const REVIEW: StepExecution = {
  ...IMPLEMENT,
  step: { id: 'review', kind: 'review', uses: 'pair-process-review' },
  durationMs: 30_000,
  tokens: measured({ read: 20, cached: 200, written: 2 }),
}
const IDENTITY = { run: 'quick-627', workflow: 'quick', card: '627' }

describe('step record (US-697 AC-1, AC-3)', () => {
  it('appends one record with identity, kind, host, engine, model, times, tokens with their source, outcome and attempt', async () => {
    const run = await open()
    await recordStep(run, IMPLEMENT)
    expect(recordsOf(run)).toEqual([
      {
        type: 'step',
        ...IDENTITY,
        step: 'implement',
        kind: 'implement',
        uses: 'pair-process-implement',
        host: 'pair-run',
        engine: 'claude',
        model: 'claude-fable-5-2',
        effort: 'high',
        startedAt: '2026-11-21T10:00:00.000Z',
        durationMs: 90_000,
        tokens: {
          read: { value: 100, source: 'measured' },
          cached: { value: 1000, source: 'measured' },
          written: { value: 10, source: 'measured' },
        },
        status: 'ok',
        attempt: 1,
      },
    ])
  })

  it('writes one record per execution of a re-executed step, numbered, with the reason of a failure', async () => {
    const run = await open()
    await recordStep(run, { ...IMPLEMENT, status: 'failed', reason: 'quality-gate' })
    await recordStep(run, REVIEW)
    await recordStep(run, IMPLEMENT)
    expect(recordsOf(run)).toMatchObject([
      { step: 'implement', status: 'failed', reason: 'quality-gate', attempt: 1 },
      { step: 'review', attempt: 1 },
      { step: 'implement', status: 'ok', attempt: 2 },
    ])
  })

  it('leaves out the model and the effort a step launched without', async () => {
    const run = await open()
    await recordStep(run, { ...IMPLEMENT, settings: { engine: 'codex' } })
    const [record] = recordsOf(run)
    expect(record).toMatchObject({ engine: 'codex' })
    expect(record).not.toHaveProperty('model')
    expect(record).not.toHaveProperty('effort')
    expect(record).not.toHaveProperty('reason')
  })
})

describe('estimate from text (US-697 AC-4)', () => {
  it('estimates read and written as a quarter of the characters, rounded up, and leaves cached unknown', () => {
    expect(estimated('x'.repeat(400), 'y'.repeat(41))).toEqual({
      read: { value: 100, source: 'estimated' },
      cached: { value: null, source: 'unknown' },
      written: { value: 11, source: 'estimated' },
    })
  })

  it('marks a record with estimated tokens as a lower bound', async () => {
    const run = await open()
    await recordStep(run, { ...IMPLEMENT, tokens: estimated('sent', 'final') })
    expect(recordsOf(run)).toMatchObject([{ estimate: 'lower-bound-from-text' }])
  })
})

describe('closing record (US-697 AC-2)', () => {
  it('holds the outcome, the number of executions and totals that are the sums of the step records', async () => {
    const run = await open()
    await recordStep(run, IMPLEMENT)
    await recordStep(run, REVIEW)
    await closeRun(run, 'done')
    expect(recordsOf(run).at(-1)).toEqual({
      type: 'run',
      ...IDENTITY,
      status: 'done',
      durationMs: 120_000,
      tokens: {
        read: { value: 120, source: 'measured' },
        cached: { value: 1200, source: 'measured' },
        written: { value: 12, source: 'measured' },
      },
      steps: 2,
    })
  })

  it('sums mixed sources as an estimate and lists unknown entries instead of counting them as zero', async () => {
    const run = await open()
    const fromText: Tokens = {
      read: { value: 7, source: 'estimated' },
      cached: { value: null, source: 'unknown' },
      written: { value: null, source: 'unknown' },
    }
    const unknown = { value: null, source: 'unknown' } as const
    await recordStep(run, { ...IMPLEMENT, tokens: { ...IMPLEMENT.tokens, written: unknown } })
    await recordStep(run, { ...REVIEW, tokens: fromText })
    await closeRun(run, 'parked')
    expect(recordsOf(run).at(-1)).toMatchObject({
      status: 'parked',
      tokens: {
        read: { value: 107, source: 'estimated' },
        cached: { value: 1000, source: 'measured', unknown: ['review#1'] },
        written: { value: null, source: 'unknown', unknown: ['implement#1', 'review#1'] },
      },
    })
  })

  it('keeps one closing record, the last line, when a closed run moves again and closes again', async () => {
    const run = await open()
    await recordStep(run, { ...IMPLEMENT, status: 'failed', reason: 'quality-gate' })
    await closeRun(run, 'failed')
    await recordStep(run, IMPLEMENT)
    await closeRun(run, 'done')
    expect(recordsOf(run)).toMatchObject([
      { type: 'step', attempt: 1 },
      { type: 'step', attempt: 2 },
      { type: 'run', status: 'done', steps: 2, durationMs: 180_000 },
    ])
  })

  it('starts a restarted run on an empty file: the records of the archived run stay with it', async () => {
    const run = await open()
    await recordStep(run, IMPLEMENT)
    const now = new Date('2026-11-21T12:00:00.000Z')
    await start(run, SOURCE, { card: '627', restart: true, now })
    expect(run.files.existsSync(FILE)).toBe(false)
    expect(run.files.existsSync(`${DIR}/archive/2026-11-21T12-00-00-000Z/${TELEMETRY_FILE}`)).toBe(
      true,
    )
  })
})
