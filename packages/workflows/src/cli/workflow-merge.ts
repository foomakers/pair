import type { StepLaunch } from '../engine'
import type { StepResult } from '../kinds'
import type { Operation } from './workflow-facts'

export function workflowMerge(call: Operation, root: string, closureOnly = false) {
  return async (step: StepLaunch): Promise<StepResult> => {
    const { card, pr, head, reviewedHead, gatedHead, approvedHead, approvedPr, approvedBy } =
      step.inputs
    if (
      typeof card !== 'string' ||
      typeof pr !== 'number' ||
      !Number.isSafeInteger(pr) ||
      typeof head !== 'string' ||
      !/^[0-9a-f]{40}$/.test(head) ||
      typeof approvedBy !== 'string'
    )
      return {
        status: 'failed',
        reason: 'unverified-merge',
        summary: 'Merge needs a PR, head and approval',
      }
    if (
      pr !== approvedPr ||
      ![reviewedHead, approvedHead, gatedHead].every(value => value === head)
    )
      return {
        status: 'failed',
        reason: 'head-moved',
        summary: 'Approval, review and gate must cover the merge head',
      }
    return (await call('merge', card, {
      root,
      ...(closureOnly && { closureOnly }),
      pr,
      head,
      approvedBy,
      method: step.with['method'],
    })) as StepResult
  }
}
