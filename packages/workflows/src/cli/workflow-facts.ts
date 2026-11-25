import { join } from 'node:path'
import type { FactReader } from '../checks'
import type { Assignment } from '../grammar'
import type { StepLaunch } from '../engine'
import type { HostProcess } from '../worktree/host-process'
import { operationTimeout } from './workflow-facts-budget'

export type Operation = (action: string, card: string, data?: unknown) => Promise<unknown>
type Request = { action: string; card: string; data?: unknown; timeout?: number }
export type HostOperation = (request: Request) => Promise<unknown>

/** Call the installed host adapter without involving the agent. */
export async function runWorkflowOperation(
  runHostProcess: HostProcess,
  scriptDir: () => string,
  cwd: string,
  { action, card, data, timeout }: Request,
): Promise<unknown> {
  const script = join(scriptDir(), 'workflow-facts.mjs')
  const args = [script, action, card, ...(data === undefined ? [] : [JSON.stringify(data)])]
  const result = await runHostProcess(process.execPath, args, cwd, {
    timeout: operationTimeout(action, timeout),
  })
  if (result.status !== 0)
    throw new Error(
      result.error?.message ?? (result.stderr.trim() || 'workflow host operation failed'),
    )
  return JSON.parse(result.stdout) as unknown
}

/** Applies assignment and returns a skip reason only when the card is held. */
export async function assignCard(
  operation: HostOperation,
  card: string,
  assign: Assignment,
  warn: (message: string) => void,
): Promise<string | undefined> {
  if (assign === 'none') return undefined
  try {
    const { status, owners, reason } = (await operation({
      action: 'assign-card',
      card,
      data: { assign },
    })) as { status?: string; owners?: string[]; reason?: string }
    if (status === 'assigned' || status === 'unchanged') return undefined
    if (status === 'held') {
      const held = `card held by ${owners?.join(', ') || 'another owner'}`
      const summary = reason ? `${held}: ${reason}` : held
      warn(`  Warning: card ${card} skipped — ${summary}`)
      return summary
    }
    throw new Error(reason ?? 'unreadable assignment result')
  } catch (error) {
    warn(`  Warning: card ${card} assignment: ${(error as Error).message}`)
    return undefined
  }
}

export function stepFacts(operation: HostOperation, step: StepLaunch): FactReader {
  const checks = step.with['checks']
  const reviewedHead = step.inputs['reviewedHead']
  const pinHead = Array.isArray(checks) && checks.includes('head-unchanged')
  const read = (action: string, timeout?: number): Promise<unknown> => {
    const card = step.inputs['card']
    if (typeof card !== 'string' || card.length === 0) throw new Error('workflow card is missing')
    return operation({
      action,
      card,
      ...(pinHead &&
        (action === 'ci' || action === 'review') && {
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
