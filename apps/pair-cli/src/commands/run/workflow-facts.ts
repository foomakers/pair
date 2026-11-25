import { pendingBoardStatus, type CardFacts, type effectiveSelection } from '@pair/workflows'
import { locateCycleScripts } from './cycle-scripts'
import { runHostProcess } from './host-process'
import { join } from 'path'
import type { FileSystemService } from '@pair/content-ops'
import type { Config } from '#registry'
import {
  MACROSTATES,
  readStateMapping,
  resolveControlState,
  resolveMacrostate,
} from './card-readiness'

type Platform = { fs: FileSystemService; project: Config; cwd: string; main: string }

export interface WorkflowCard extends CardFacts {
  readonly id: string
  readonly body: string
  readonly title: string
  readonly boardState: string | null
  readonly boardError?: string
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

type DependencyFacts = Pick<WorkflowCard, 'id' | 'prerequisites' | 'uncertain' | 'error'>
export interface WorkflowSelection {
  readonly cards: readonly WorkflowCard[]
  readonly assignee?: string
  readonly readDependencies?: (ids: readonly string[]) => Promise<readonly DependencyFacts[]>
}

type SelectionRun = { files: FileSystemService; dir: string; workflow: string; main: string }

export function selectionBoardError(
  card: WorkflowCard,
  selection: ReturnType<typeof effectiveSelection>,
): string | undefined {
  return !card.closed && card.boardError !== undefined && selection.needsStatus(card)
    ? card.boardError
    : undefined
}

/** Match current scope, allowing unfinished refinement to retain its original status. */
export function matchesWorkflowCard(
  card: WorkflowCard,
  accepts: (facts: CardFacts) => boolean,
  run?: SelectionRun,
): boolean {
  if (card.closed) return false
  if (accepts(card)) return true
  const pending = run && pendingWorkflowCard(card, run)
  return pending !== undefined && accepts(pending)
}

/** Selection facts from before the Ready transition, with labels and assignees still current. */
export function pendingWorkflowCard(
  card: WorkflowCard,
  run: SelectionRun,
): WorkflowCard | undefined {
  const statusIndex = MACROSTATES.findIndex(state => state === card.status)
  if (card.closed || statusIndex < MACROSTATES.indexOf('Ready')) return undefined
  const mapping = readStateMapping(run.files, run.main)
  // Task planning can complete the DoR before returning a result, while the board is still Draft.
  const draft =
    card.status === 'Ready' &&
    card.boardState !== null &&
    resolveMacrostate(card.boardState, mapping) === 'Draft'
      ? card.boardState
      : undefined
  const previous = pendingBoardStatus(run, { card: card.id, workflow: run.workflow }, draft)
  if (previous === undefined) return undefined
  const status = resolveMacrostate(previous, mapping)
  return status === undefined ? undefined : { ...card, status }
}

const unreadableCard = {
  labels: [],
  boardState: null,
  closed: false,
  title: '',
  body: '',
  prerequisites: [],
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

export async function readWorkflowCards(
  at: Platform,
  scope: WorkflowScope,
): Promise<WorkflowSelection> {
  const output = await readPlatform<{
    cards: (Omit<WorkflowCard, 'prerequisites'> | { id: string; error: string })[]
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
    readDependencies: ids =>
      readPlatform<DependencyFacts[]>(
        at,
        ['workflow-dependencies', '--cards', ids.join(',')],
        180_000,
      ),
    cards: output.cards.map(card => {
      if (!('title' in card)) return { ...unreadableCard, ...card }
      const { macrostate } = resolveControlState(
        { title: card.title ?? '', body: card.body, boardState: card.boardState ?? undefined },
        mapping,
      )
      const priority = /^\s*(?:-\s+)?(?:\*\*Priority:?\*\*:?|Priority:)\s*P(\d+)\b/im.exec(
        card.body,
      )?.[1]
      return {
        prerequisites: [],
        ...card,
        ...(macrostate && { status: macrostate }),
        ...(priority !== undefined && { priority: Number(priority) }),
      }
    }),
  }
}

export async function readWorkflowPrHead(at: Platform, pr: number): Promise<string> {
  return (await readPlatform<{ head: string }>(at, ['workflow-pr-head', '--ref', String(pr)])).head
}

export function readWorkflowCard(at: Platform, card: string) {
  return readPlatform<Pick<WorkflowCard, 'body' | 'labels' | 'boardState' | 'boardError'>>(at, [
    'workflow-card',
    '--story',
    card,
  ])
}
