import { runSteps, type StepEvent, type WorkflowHost } from '.'
import type { StepResult } from '../engine'
import { start } from '../engine'
import { createMemoryFiles } from '../engine/memory-files'

const TEXT = (gates: string) => `version: 1
name: quick
steps:
  implement: { kind: implement${gates} }
`
const DIR = '/main/.pair/working/runs/quick-729'
const OK = `\`\`\`json
{ "status": "ok", "summary": "done", "branch": "feature/US-729-x", "pr": 1, "head": "${'a'.repeat(40)}" }
\`\`\``
const FAILED = '```json\n{ "status": "failed", "summary": "no" }\n```'

async function run(
  gates: string,
  final: string,
  runGates?: WorkflowHost['runGates'],
  sent: string[] = [],
) {
  const files = createMemoryFiles()
  await start({ files, dir: DIR }, { text: TEXT(gates), file: 'quick.yaml' }, { card: '729' })
  const events: StepEvent[] = []
  const host: WorkflowHost = {
    files,
    style: { skill: name => name } as never,
    isSafeText: () => true,
    launch: async (_step, message) => {
      sent.push(message)
      return final
    },
    ...(runGates && { runGates }),
    report: event => events.push(event),
  }
  const outcome = await runSteps(host, DIR)
  return { outcome, events }
}

describe('step gates: validation the host runs after an ok step (#729 AC-7)', () => {
  it('runs the entries after an ok step, and the step stays ok when they pass', async () => {
    const seen: (readonly string[])[] = []
    const { outcome } = await run(", gates: ['target:pr']", OK, async entries => {
      seen.push(entries)
      return undefined
    })
    expect(outcome.run).toBe('done')
    expect(seen).toEqual([['target:pr']])
  })
  it('fails the step with the gate result when an entry is red', async () => {
    const { outcome, events } = await run(", gates: ['command:x']", OK, async () => ({
      status: 'failed',
      reason: 'gate-failed: command:x',
      summary: 'gate command:x failed',
    }))
    expect(outcome.run).toBe('failed')
    expect(events.at(-1)).toMatchObject({ state: 'failed', reason: 'gate-failed: command:x' })
  })
  it('runs no gate when the step itself failed or declares none', async () => {
    let calls = 0
    const spy = async () => {
      calls += 1
      return undefined
    }
    await run(", gates: ['target:pr']", FAILED, spy)
    await run('', OK, spy)
    expect(calls).toBe(0)
  })
  it('fails loudly when the host cannot run gates', async () => {
    const { events } = await run(", gates: ['target:pr']", OK)
    expect(events.at(-1)).toMatchObject({ state: 'failed', reason: 'no-executor' })
  })
})

describe('a red gate goes back to the agent (#729 AC-10)', () => {
  const red = (detail: string): StepResult => ({
    status: 'failed',
    reason: 'gate-failed: command:x',
    summary: 'gate command:x failed',
    detail,
  })

  it('relaunches the step with the gate output, and the step is ok once the gate passes', async () => {
    const sent: string[] = []
    let calls = 0
    const { outcome } = await run(
      ", gates: ['command:x']",
      OK,
      async () => (++calls === 1 ? red('mirror drift in SKILL.md') : undefined),
      sent,
    )
    expect(outcome.run).toBe('done')
    expect(sent).toHaveLength(2)
    expect(sent[0]).not.toContain('mirror drift')
    expect(sent[1]).toContain('mirror drift in SKILL.md')
  })

  it('fails the step with the last gate result after 2 retries', async () => {
    const sent: string[] = []
    const { outcome, events } = await run(
      ", gates: ['command:x']",
      OK,
      async () => red('still red'),
      sent,
    )
    expect(outcome.run).toBe('failed')
    expect(sent).toHaveLength(3)
    expect(events.at(-1)).toMatchObject({ state: 'failed', reason: 'gate-failed: command:x' })
  })
})
