import { join } from 'path'
import { describe, expect, it, vi } from 'vitest'
import { fileSystemService as fs } from '@pair/content-ops'
import { createMemoryFiles, runSteps, start, validate } from '@pair/workflows'
import type { StepEvent, StepLaunch, StepResult, WorkflowHost } from '@pair/workflows'
import { isSafePromptText } from './prompt-safety'
import { performHostKind } from './workflow-kinds'

const EXAMPLES = join(
  __dirname,
  '../../../../../packages/knowledge-hub/dataset/.pair/knowledge/guidelines/collaboration/automation/workflow-examples',
)
const HEAD = 'a'.repeat(40)
const FINDING = {
  id: 'f1',
  severity: 'Major',
  title: 'Missing check',
  blocking: true,
  origin: 'new',
}
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
  agentResults: Readonly<Record<string, StepResult | ((step: StepLaunch) => StepResult)>>,
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
      launch: async step => {
        const reply = agentResults[step.id]
        if (reply === undefined) throw new Error(`Unexpected agent step ${step.id}`)
        const result = typeof reply === 'function' ? reply(step) : reply
        return { final: `\`\`\`json\n${JSON.stringify(result)}\n\`\`\`` }
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

  it.each([
    { name: 'advanced head with a report', fixHead: 'd'.repeat(40), hasReport: true },
    { name: 'same head with a report', fixHead: 'c'.repeat(40), hasReport: true },
    { name: 'advanced head without a report', fixHead: 'd'.repeat(40), hasReport: false },
  ])('converge keeps the final review and fix pins for $name (R747-01)', async row => {
    const reviewedHead = 'c'.repeat(40)
    const heads = [HEAD, 'b'.repeat(40), reviewedHead, row.fixHead]
    const reportPath = (head: string) => `.pair/working/reviews/1/${head}.md`
    const latestFinding = { ...FINDING, title: 'Final round finding' }
    const fallback = vi.fn<(step: StepLaunch) => StepResult>(() => ({
      status: 'failed',
      summary: 'Finding remained unresolved',
      head: row.fixHead,
      resolutions: [{ id: 'f1', status: 'not-resolved', reason: 'Needs a different approach' }],
    }))
    const { outcome, results, commentOnCard } = await simulate('converge', {
      implement: IMPLEMENTED,
      'rounds/review': ({ round = 1 }) => {
        const roundHead = heads[round - 1] ?? HEAD
        return {
          ...CHANGES_REQUESTED,
          reviewedHead: roundHead,
          ...(round !== 3 || row.hasReport ? { reportPath: reportPath(roundHead) } : {}),
          findings: [round === 3 ? latestFinding : FINDING],
        }
      },
      'rounds/fix': ({ round = 1 }) => ({ ...FIXED, head: heads[round] }),
      'last-chance': fallback,
    })

    expect(fallback).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        inputs: expect.objectContaining({
          pr: 1,
          head: row.fixHead,
          reviewedHead,
          findings: [{ ...latestFinding, origin: 'carried' }],
        }),
      }),
    )
    const inputs = fallback.mock.calls[0]?.[0].inputs
    if (row.hasReport) expect(inputs).toHaveProperty('reportPath', reportPath(reviewedHead))
    else expect(inputs).not.toHaveProperty('reportPath')
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

  it.each([
    ['unreadable', 'done', 'blocked', 'fact-unreadable'],
    ['changed', 'failed', 'failed', 'head-changed'],
  ] as const)(
    'delivery routes %s gate evidence through the CLI gate (R747-02)',
    async (head, run, status, reason) => {
      const perform = vi.fn(
        performHostKind({}, '/worktree', {}, step => ({
          head: async () => {
            if (head === 'unreadable') throw new Error('platform unavailable')
            return 'b'.repeat(40)
          },
          reviewedHead: async () => String(step.inputs['reviewedHead']),
          ci: async () => 'green',
          reviewApproved: async () => true,
          openPrerequisites: async () => [],
        })),
      )
      const { outcome, results } = await simulate(
        'delivery',
        { implement: IMPLEMENTED, review: APPROVED },
        perform,
      )

      expect(outcome.run).toBe(run)
      expect(perform).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ id: 'gate' }))
      await expect(perform.mock.results[0]?.value).resolves.toMatchObject({ status, reason })
      expect(results).toEqual([
        ['implement', 'ok'],
        ['review', 'ok'],
        ['gate', status],
        ...(status === 'blocked'
          ? [
              ['approval', 'skipped'],
              ['merge', 'skipped'],
            ]
          : []),
      ])
    },
  )
})
