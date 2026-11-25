import type { CardFacts } from '@pair/workflows'
import { locateCycleScripts } from './cycle-scripts'
import { runHostProcess } from './host-process'
import { join } from 'path'
import type { FileSystemService } from '@pair/content-ops'
import type { Config } from '#registry'
import { readStateMapping, resolveMacrostate } from './card-readiness'

type Platform = { fs: FileSystemService; project: Config; cwd: string; main: string }

export interface WorkflowCard extends CardFacts {
  readonly id: string
  readonly body: string
  readonly title: string
  readonly boardState: string | null
  readonly closed: boolean
  readonly created?: string
  readonly priority?: number
  readonly prerequisites: readonly string[]
  readonly uncertain?: string
  readonly error?: string
}

export interface WorkflowScope {
  readonly cards?: readonly string[]
  readonly root?: string
  readonly filter?: string
  readonly assignee?: string
}

async function readPlatform<T>(at: Platform, args: string[], timeout = 30_000): Promise<T> {
  const { scriptsDir } = locateCycleScripts(at.fs, at.project, at.cwd)
  const result = await runHostProcess(
    process.execPath,
    [join(scriptsDir, 'cycle-state.mjs'), ...args],
    at.cwd,
    { timeout },
  )
  if (result.status !== 0 || result.error)
    throw new Error(result.error?.message ?? (result.stderr || result.stdout).trim())
  return JSON.parse(result.stdout) as T
}

export async function readWorkflowCards(at: Platform, scope: WorkflowScope) {
  const output = await readPlatform<{
    cards: (WorkflowCard | { id: string; error: string })[]
    assignee?: string
  }>(
    at,
    [
      'workflow-cards',
      ...(scope.cards ? ['--cards', scope.cards.join(',')] : []),
      ...(scope.root ? ['--root', scope.root] : []),
      ...(scope.filter && !scope.cards && !scope.root ? ['--filter', scope.filter] : []),
      ...(scope.assignee === '@me' ? ['--assignee', '@me'] : []),
    ],
    180_000,
  )
  const mapping = readStateMapping(at.fs, at.main)
  return {
    ...output,
    cards: output.cards.map(card => {
      if (!('title' in card))
        return {
          labels: [],
          boardState: null,
          closed: false,
          title: '',
          body: '',
          prerequisites: [],
          ...card,
        }
      const status = resolveMacrostate(card.boardState ?? '', mapping)
      const priority = /^\s*(?:-\s+)?(?:\*\*Priority:?\*\*:?|Priority:)\s*P(\d+)\b/im.exec(
        card.body,
      )?.[1]
      return {
        ...card,
        ...(status && { status }),
        ...(priority !== undefined && { priority: Number(priority) }),
      }
    }),
  }
}

export async function readWorkflowPrHead(at: Platform, pr: number): Promise<string> {
  return (await readPlatform<{ head: string }>(at, ['workflow-pr-head', '--ref', String(pr)])).head
}
