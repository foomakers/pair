import { expect, it, vi } from 'vitest'
import { workflowMerge } from './workflow-merge'

const head = 'a'.repeat(40)
const step = {
  id: 'merge',
  kind: 'merge',
  uses: '',
  with: {},
  attempt: 1,
  inputs: {
    card: '726',
    pr: 735,
    head,
    reviewedHead: head,
    gatedHead: head,
    approvedHead: head,
    approvedPr: 735,
    approvedBy: 'maintainer',
  },
} as const

it('refuses a merge if approval and review do not cover its head (#726 AC-4)', async () => {
  const call = vi.fn()
  const merge = workflowMerge(call, '/checkout')
  const result = await merge({ ...step, inputs: { ...step.inputs, approvedHead: 'b'.repeat(40) } })
  expect(result).toMatchObject({ status: 'failed', reason: 'head-moved' })
  expect(call).not.toHaveBeenCalled()
})

it('reports platform refusal and distinguishes pending closure after a landed merge (#726 AC-4/5)', async () => {
  const call = vi
    .fn()
    .mockResolvedValueOnce({ status: 'failed', reason: 'branch protection', summary: 'Refused' })
    .mockResolvedValueOnce({
      status: 'failed',
      reason: 'board update',
      summary: 'Merged, closure incomplete',
      merged: true,
      mergeCommit: head,
    })
  const merge = workflowMerge(call, '/checkout')
  expect(await merge(step)).toMatchObject({ status: 'failed', reason: 'branch protection' })
  expect(await merge(step)).toMatchObject({
    status: 'failed',
    merged: true,
    reason: 'board update',
  })
})
