import { join } from 'path'
import { describe, expect, it, vi } from 'vitest'
import { fileSystemService as fs } from '@pair/content-ops'
import { createMemoryFiles, runSteps, start, validate } from '@pair/workflows'
import type { StepEvent, StepResult, WorkflowHost } from '@pair/workflows'
import { isSafePromptText } from './prompt-safety'

const EXAMPLES = join(
  __dirname,
  '../../../../../packages/knowledge-hub/dataset/.pair/knowledge/guidelines/collaboration/automation/workflow-examples',
)
const HEAD = 'a'.repeat(40)
const FINDING = { id: 'f1', severity: 'Major', title: 'Missing check', blocking: true }
const IMPLEMENTED = {
  status: 'ok',
  summary: 'PR opened',
  branch: 'feature/example',
  pr: 1,
  head: HEAD,
} as const
const APPROVED = {
  status: 'ok',
  summary: 'Approved',
  verdict: 'approved',
  reviewedHead: HEAD,
  findings: [],
} as const
const CHANGES_REQUESTED = {
  status: 'failed',
  summary: 'Changes requested',
  verdict: 'changes-requested',
  reviewedHead: HEAD,
  findings: [FINDING],
} as const
const FIXED = {
  status: 'ok',
  summary: 'Fixed',
  head: HEAD,
  resolutions: [{ id: 'f1', status: 'resolved', reason: 'check added' }],
} as const

async function simulate(
  name: string,
  agentResults: Readonly<Record<string, StepResult>>,
  perform?: WorkflowHost['perform'],
) {
  const file = join(EXAMPLES, `${name}.yaml`)
  const source = { text: fs.readFileSync(file), file }
  const commentOnCard = vi.fn<NonNullable<WorkflowHost['commentOnCard']>>().mockResolvedValue()
  const checked = validate(source.text, source.file, {
    skillExists: () => true,
    gateKeys: [],
    launchInputs: ['card'],
    isSafeText: isSafePromptText,
    canCommentOnCard: true,
  })
  expect(checked.errors).toEqual([])
  expect(checked.workflow?.name).toBe(name)

  const run = { files: createMemoryFiles(), dir: `/runs/${name}-728` }
  const events: StepEvent[] = []
  await start(run, source, { card: '728' })
  const outcome = await runSteps(
    {
      files: run.files,
      style: 'instruction',
      isSafeText: isSafePromptText,
      launch: async ({ id }) => {
        const result = agentResults[id]
        if (result === undefined) throw new Error(`Unexpected agent step ${id}`)
        return `\`\`\`json\n${JSON.stringify(result)}\n\`\`\``
      },
      ...(perform !== undefined && { perform }),
      report: event => events.push(event),
      commentOnCard,
    },
    run.dir,
  )
  const results = events.filter(event => event.state !== 'running')
  return { outcome, results: results.map(event => [event.step, event.state]), commentOnCard }
}

describe('#728 AC 19: shipped workflow examples', () => {
  it('quick continues a failed review into its existing fix step', async () => {
    const { outcome, results } = await simulate('quick', {
      implement: IMPLEMENTED,
      review: CHANGES_REQUESTED,
      fix: FIXED,
    })

    expect(outcome.run).toBe('done')
    expect(results).toEqual([
      ['implement', 'ok'],
      ['review', 'failed'],
      ['fix', 'ok'],
    ])
  })

  it('escalating calls the stronger implement step after the first fails', async () => {
    const { outcome, results } = await simulate('escalating', {
      implement: { status: 'failed', summary: 'First implementation failed' },
      'implement-strong': IMPLEMENTED,
      review: APPROVED,
    })

    expect(outcome.run).toBe('done')
    expect(results).toEqual([
      ['implement', 'failed'],
      ['implement-strong', 'ok'],
      ['review', 'ok'],
    ])
  })

  it('converge takes the final fallback after three rounds and comments when it fails', async () => {
    const { outcome, results, commentOnCard } = await simulate('converge', {
      implement: IMPLEMENTED,
      'rounds/review': CHANGES_REQUESTED,
      'rounds/fix': FIXED,
      'last-chance': {
        status: 'failed',
        summary: 'Finding remained unresolved',
        head: HEAD,
        resolutions: [{ id: 'f1', status: 'not-resolved', reason: 'Needs a different approach' }],
      },
    })

    expect(outcome.run).toBe('failed')
    const round = [
      ['rounds/review', 'failed'],
      ['rounds/fix', 'ok'],
    ]
    expect(results).toEqual([
      ['implement', 'ok'],
      ...round,
      ...round,
      ...round,
      ['last-chance', 'failed'],
    ])
    expect(commentOnCard).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        card: '728',
        body: 'The fix does not converge after the final round.',
      }),
    )
  })

  it('delivery skips approval and merge when the gate is blocked', async () => {
    const perform = vi.fn<NonNullable<WorkflowHost['perform']>>().mockResolvedValue({
      status: 'blocked',
      summary: 'Gate evidence unavailable',
    })
    const { outcome, results } = await simulate(
      'delivery',
      { implement: IMPLEMENTED, review: APPROVED },
      perform,
    )

    expect(outcome.run).toBe('done')
    expect(perform).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ id: 'gate' }))
    expect(results).toEqual([
      ['implement', 'ok'],
      ['review', 'ok'],
      ['gate', 'blocked'],
      ['approval', 'skipped'],
      ['merge', 'skipped'],
    ])
  })
})
