import { spawnSync } from 'node:child_process'
import { join } from 'node:path'
import { HeadChangedError } from '@pair/workflows'
import type { Assignment, FactReader, StepLaunch } from '@pair/workflows'
import { runHostProcess } from './host-process'
import { operationTimeout } from './workflow-facts-budget'

/** Ask the installed adapter about local capability without contacting the tracker. */
export function canCommentOnCard(scriptDir: () => string, cwd: string): boolean {
  try {
    const result = spawnSync(
      process.execPath,
      [join(scriptDir(), 'workflow-facts.mjs'), 'card-comment-support'],
      { cwd, encoding: 'utf8', timeout: 5_000 },
    )
    return result.status === 0 && result.stdout.trim() === 'true'
  } catch {
    return false
  }
}

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
    timeout: operationTimeout(action, timeout),
  })
  if (result.status !== 0)
    throw new Error(
      result.error?.message ?? (result.stderr.trim() || 'workflow host operation failed'),
    )
  return JSON.parse(result.stdout) as unknown
}

/** Applies assignment and returns a skip reason only when the card is held. */
export async function assignWorkflowCard(
  scriptDir: () => string,
  cwd: string,
  card: string,
  assign: Assignment,
): Promise<string | undefined> {
  if (assign === 'none') return undefined
  try {
    const { status, owners, reason } = (await workflowOperation(scriptDir, cwd, {
      action: 'assign-card',
      card,
      data: { assign },
    })) as { status?: string; owners?: string[]; reason?: string }
    if (status === 'assigned' || status === 'unchanged') return undefined
    if (status === 'held') {
      const held = `card held by ${owners?.join(', ') || 'another owner'}`
      const summary = reason ? `${held}: ${reason}` : held
      console.log(`  Warning: card ${card} skipped — ${summary}`)
      return summary
    }
    throw new Error(reason ?? 'unreadable assignment result')
  } catch (error) {
    console.log(`  Warning: card ${card} assignment: ${(error as Error).message}`)
    return undefined
  }
}

const isHeadChanged = (value: unknown): boolean =>
  typeof value === 'object' &&
  value !== null &&
  'headChanged' in value &&
  value.headChanged === true

export function workflowFacts(scriptDir: () => string, cwd: string, step: StepLaunch): FactReader {
  const checks = step.with['checks']
  const reviewedHead = step.inputs['reviewedHead']
  const pinHead = Array.isArray(checks) && checks.includes('head-unchanged')
  const read = async (action: string, timeout?: number): Promise<unknown> => {
    const card = step.inputs['card']
    if (typeof card !== 'string' || card.length === 0) throw new Error('workflow card is missing')
    const pinned = pinHead && (action === 'ci' || action === 'review')
    const value = await workflowOperation(scriptDir, cwd, {
      action,
      card,
      ...(pinned && { data: { expectedHead: reviewedHead } }),
      ...(timeout === undefined ? {} : { timeout }),
    })
    if (pinned && isHeadChanged(value)) throw new HeadChangedError()
    return value
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
