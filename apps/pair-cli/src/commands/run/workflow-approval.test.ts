import { createMemoryFiles } from '@pair/workflows'
import { expect, it, vi } from 'vitest'
import { parseRunCommand } from './parser'
import { approvalRunner, type ApprovalPlatform } from './workflow-approval'

const head = 'a'.repeat(40)
const step = {
  id: 'approval',
  kind: 'approval',
  uses: '',
  with: { question: 'Ship?' },
  inputs: { card: '726', pr: 735 },
  attempt: 1,
} as const

it('parks once and continues only on a fresh authorized answer (#726 AC-2/3)', async () => {
  const notice = vi.fn(async () => undefined)
  const readAnswers = vi.fn<ApprovalPlatform['answers']>().mockResolvedValue([])
  const platform: ApprovalPlatform = {
    target: async () => ({ pr: 735, head }),
    notice,
    answers: readAnswers,
  }
  const files = createMemoryFiles()
  const run = approvalRunner({ dir: '/run', files }, platform)
  expect(await run(step)).toMatchObject({ status: 'needs-human' })
  expect(await run(step)).toMatchObject({ status: 'needs-human' })
  expect(notice).toHaveBeenCalledTimes(1)
  readAnswers.mockResolvedValue([{ channel: 'comment', login: 'maintainer', verdict: 'approved' }])
  expect(await run(step)).toMatchObject({
    status: 'ok',
    approvedBy: 'maintainer',
    approvedHead: head,
  })
})

it('keeps the rejection note and requests a new answer when the PR head moves (#726 AC-2/4)', async () => {
  const target = vi.fn<ApprovalPlatform['target']>().mockResolvedValue({ pr: 735, head })
  const answers = vi
    .fn<ApprovalPlatform['answers']>()
    .mockResolvedValue([
      { channel: 'review', login: 'maintainer', verdict: 'rejected', note: 'Fix the gate' },
    ])
  const files = createMemoryFiles()
  const run = approvalRunner(
    { dir: '/run', files },
    {
      target,
      answers,
      notice: async () => undefined,
    },
  )
  await run(step)
  expect(await run(step)).toMatchObject({ status: 'failed', reason: 'Fix the gate' })
  target.mockResolvedValue({ pr: 735, head: 'b'.repeat(40) })
  expect(await run(step)).toMatchObject({ status: 'needs-human' })
  expect(answers).toHaveBeenCalledTimes(1)
})

it('rejects an approval flag naming another card before dispatch (#726 T-9)', () => {
  expect(() => parseRunCommand({ card: '726', approve: '727' }, ['delivery'])).toThrow(
    /728|727|another card/,
  )
})
