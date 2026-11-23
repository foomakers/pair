import { join } from 'node:path'
import type { FactReader, StepLaunch } from '@pair/workflows'
import { runHostProcess } from './host-process'

/** Call the installed host adapter without involving the agent. */
export async function workflowOperation(
  scriptDir: () => string,
  cwd: string,
  {
    action,
    card,
    data,
    timeout,
  }: { action: string; card: string; data?: unknown; timeout?: number },
): Promise<unknown> {
  const script = join(scriptDir(), 'workflow-facts.mjs')
  const args = [script, action, card, ...(data === undefined ? [] : [JSON.stringify(data)])]
  const result = await runHostProcess(process.execPath, args, cwd, {
    timeout: Math.min(timeout ?? 30_000, 30_000),
  })
  if (result.status !== 0)
    throw new Error(
      result.error?.message ?? (result.stderr.trim() || 'workflow host operation failed'),
    )
  return JSON.parse(result.stdout) as unknown
}

export function workflowFacts(scriptDir: () => string, cwd: string, step: StepLaunch): FactReader {
  const checks = step.with['checks']
  const reviewedHead = step.inputs['reviewedHead']
  const pinHead = Array.isArray(checks) && checks.includes('head-unchanged')
  const read = (action: string, timeout?: number): Promise<unknown> => {
    const card = step.inputs['card']
    if (typeof card !== 'string' || card.length === 0) throw new Error('workflow card is missing')
    return workflowOperation(scriptDir, cwd, {
      action,
      card,
      ...(pinHead && (action === 'ci' || action === 'review') && {
        data: { expectedHead: reviewedHead },
      }),
      ...(timeout === undefined ? {} : { timeout }),
    })
  }
  return {
    head: async () => {
      const head = await read('head')
      if (typeof head !== 'string' || !/^[0-9a-f]{40}$/.test(head))
        throw new Error('unreadable PR head')
      return head
    },
    reviewedHead: async () => {
      const head = step.inputs['reviewedHead']
      return typeof head === 'string' ? head : undefined
    },
    ci: async timeout => {
      const ci = await read('ci', timeout)
      if (ci !== 'green' && ci !== 'pending' && ci !== 'red') throw new Error('unreadable CI state')
      return ci
    },
    reviewApproved: async () => {
      const approved = await read('review')
      if (typeof approved !== 'boolean') throw new Error('unreadable review state')
      return approved
    },
    openPrerequisites: async () => {
      const ids = await read('prerequisites')
      if (!Array.isArray(ids) || !ids.every(id => typeof id === 'string'))
        throw new Error('unreadable prerequisite state')
      return ids as string[]
    },
  }
}
