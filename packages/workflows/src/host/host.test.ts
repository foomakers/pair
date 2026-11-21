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

describe('settingsOf', () => {
  it('gives every step the settings of the run', () => {
    const run = { engine: 'claude', model: 'm' }
    expect(settingsOf(run, 'implement')).toBe(run)
    expect(settingsOf(run, 'review')).toBe(run)
  })
})
