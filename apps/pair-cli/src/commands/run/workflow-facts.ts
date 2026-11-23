import { join } from 'node:path'
import type { FactReader, StepLaunch } from '@pair/workflows'
import { runHostProcess } from './host-process'

/** One fresh read through the installed PM/code host adapter. */
export function workflowFacts(scriptDir: () => string, cwd: string, step: StepLaunch): FactReader {
  const read = async (action: string): Promise<unknown> => {
    const card = step.inputs['card']
    if (typeof card !== 'string' || card.length === 0) throw new Error('workflow card is missing')
    const script = join(scriptDir(), 'workflow-facts.mjs')
    const result = await runHostProcess(process.execPath, [script, action, card], cwd)
    if (result.status !== 0)
      throw new Error(
        result.error?.message ?? (result.stderr.trim() || 'workflow fact read failed'),
      )
    return JSON.parse(result.stdout) as unknown
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
    ci: async () => {
      const ci = await read('ci')
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
