import { runSteps, type StepEvent, type WorkflowHost } from '.'
import { start, type StepLaunch } from '../engine'
import { createMemoryFiles } from '../engine/memory-files'

const TEXT = `version: 1
name: quick
steps:
  gate: { kind: gate, with: { gates: [quality-gate] } }
  approve:
    kind: approval
    when: { has: [risk:red] }
  after: { kind: gate, with: { gates: [quality-gate] } }
`
const DIR = '/main/.pair/working/runs/quick-680'

async function run(labels: string[], perform?: WorkflowHost['perform']) {
  const files = createMemoryFiles()
  await start({ files, dir: DIR }, { text: TEXT, file: 'quick.yaml' }, { card: '680' })
  const events: StepEvent[] = []
  const launched: StepLaunch[] = []
  const host: WorkflowHost = {
    files,
    style: { skill: name => name } as never,
    isSafeText: () => true,
    launch: async () => {
      throw new Error('no agent for a host kind')
    },
    card: async () => ({ labels }),
    ...(perform && { perform }),
    report: event => events.push(event),
  }
  const outcome = await runSteps(host, DIR)
  return { outcome, events, launched }
}
const ids = (events: StepEvent[]) => events.map(e => `${e.step}:${e.state}`)

describe('host kinds (#680 AC-1, AC-3, AC-6)', () => {
  it('runs gate steps through perform, no agent, and reports a skipped step', async () => {
    const { outcome, events } = await run(['risk:green'], async () => ({
      status: 'ok',
      summary: 'passed',
    }))
    expect(outcome.run).toBe('done')
    expect(ids(events)).toEqual([
      'gate:running',
      'gate:ok',
      'approve:skipped',
      'after:running',
      'after:ok',
    ])
  })
  it('parks the run on an approval that returns needs-human', async () => {
    const { outcome } = await run(['risk:red'], async step =>
      step.kind === 'approval'
        ? { status: 'needs-human', reason: 'approval-pending', summary: 'waiting' }
        : { status: 'ok', summary: 'passed' },
    )
    expect(outcome.run).toBe('parked')
  })
  it('fails a host kind when the host has no executor', async () => {
    const { outcome, events } = await run(['risk:green'])
    expect(outcome.run).toBe('failed')
    expect(events.at(-1)).toMatchObject({ state: 'failed', reason: 'no-executor' })
  })
})
