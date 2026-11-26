import { runSteps, type StepEvent, type WorkflowHost } from '.'
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

it.each([{ unattempted: ['T-1', 'T-2'] }, { unattempted: undefined }])(
  'records partial implementation without relaunching (%j)',
  async ({ unattempted }) => {
    const sent: string[] = []
    const final =
      '```json\n' +
      JSON.stringify({
        status: 'failed',
        summary: 'partial',
        reason: 'tasks-unattempted',
        unattempted,
      }) +
      '\n```'
    const { outcome } = await run('', final, undefined, sent)
    expect(sent).toHaveLength(1)
    expect(outcome).toMatchObject({ run: 'failed', last: { reason: 'tasks-unattempted' } })
  },
)

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
      return { final }
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

it('does not relaunch a skill when a declared post-step gate fails', async () => {
  const sent: string[] = []
  const { outcome } = await run(
    ", gates: ['command:x']",
    OK,
    async () => ({
      status: 'failed',
      reason: 'gate-failed: command:x',
      summary: 'red gate',
    }),
    sent,
  )
  expect(sent).toHaveLength(1)
  expect(outcome).toMatchObject({ run: 'failed', last: { reason: 'gate-failed: command:x' } })
})
