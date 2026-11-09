import chalk from 'chalk'
import { execFile } from 'child_process'
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { promisify } from 'util'
import { acquireCardLock } from './card-lock'
import {
  cardsExitCode,
  readCardRank,
  renderCardsReport,
  runCardList,
  type CardsCardRunner,
  type CardProgress,
} from './cards-run'
import { CardUnreadableError, mainCheckoutOrCwd } from './cycle-wiring'
import { parseStateMapping, resolveMacrostate, type Macrostate } from './card-readiness'
import { appendAuditLine } from './dispatch-audit'
import { isInterrupted, whileInterruptible } from './interrupt'
import { optionsOfArgv, runCardInProcess, runPlannedCard, type CardProcessRunner } from './parallel'
import { parseRunCommand, type RunCommandConfig } from './parser'
import type { RunContext, RunHandlerDependencies } from './run-context'

/**
 * US-614: `pair-cli run --cards a,b,c` — each card through its own `run --card` (in this process), serially, in
 * passes. A throw from a card run (perimeter, trust, engine, policy) is a safety-required global halt; only an
 * unreadable card is a per-card failure. `runCard` is the handler's own `run --card` entry.
 */
export interface CardsEntryInput {
  readonly config: RunCommandConfig
  readonly context: RunContext
  readonly cwd: string
  readonly deps: RunHandlerDependencies
  readonly runCard: (config: RunCommandConfig) => Promise<number>
}

/** The in-process card runner; an unreadable card is reported `not-found`, any other throw propagates (a halt). */
function inProcessRunner(runCard: CardsEntryInput['runCard']): CardProcessRunner {
  let thrown: unknown
  const inProcess = runCardInProcess(args =>
    runCard(parseRunCommand(optionsOfArgv(args) as Parameters<typeof parseRunCommand>[0])).catch(
      (error: unknown) => {
        thrown = error
        throw error
      },
    ),
  )
  return async input => {
    thrown = undefined
    const exit = await inProcess(input)
    if (thrown === undefined) return exit
    if (thrown instanceof CardUnreadableError) return { ...exit, cycleStatus: 'not-found' }
    throw thrown
  }
}

function cardRunner(input: CardsEntryInput): CardsCardRunner {
  const { config, context, cwd, deps } = input
  const runProcess = deps.runCardProcess ?? inProcessRunner(input.runCard)
  // `outcomeOfExit` keeps the cycle status only on a failure; an exit 0 still tells at-target from awaiting-human by it.
  let cycleStatus: string | undefined
  const recording: CardProcessRunner = async call => {
    const exit = await runProcess(call)
    cycleStatus = exit.cycleStatus
    return exit
  }
  return async id => {
    cycleStatus = undefined
    try {
      const planned = await runPlannedCard({
        card: { id, title: '', branch: '', tier: '', mutexResources: [], prerequisites: [] },
        config,
        cwd,
        workingArea: context.workingArea,
        acquireLock: deps.acquireLock ?? acquireCardLock,
        runCardProcess: recording,
      })
      return { outcome: cycleStatus === undefined ? planned : { ...planned, cycleStatus } }
    } catch (error) {
      const halt = error instanceof Error ? error.message : String(error)
      return { outcome: { id, outcome: 'crashed', detail: halt }, halt }
    }
  }
}

const BOARD_RANK: Record<Macrostate, number> = {
  Draft: 1,
  Ready: 2,
  'In Progress': 3,
  Review: 4,
  Done: 5,
}
const exec = promisify(execFile)

async function readCardViaGh(id: string, cwd: string): Promise<string> {
  const fields = 'body,state,stateReason,closedAt'
  try {
    return (
      await exec('gh', ['issue', 'view', id, '--json', `${fields},projectItems`], {
        cwd,
        encoding: 'utf8',
      })
    ).stdout
  } catch {
    return (await exec('gh', ['issue', 'view', id, '--json', fields], { cwd, encoding: 'utf8' }))
      .stdout
  }
}

interface CardState {
  readonly body?: string
  readonly boardState?: string | null
  readonly projectItems?: readonly { readonly status?: { readonly name?: string } }[]
  readonly state?: string
  readonly stateReason?: string | null
  readonly closedAt?: string | null
}

function cardBoardState(card: CardState): string | undefined {
  return (
    card.boardState ??
    card.projectItems?.find(item => item.status?.name)?.status?.name ??
    /^\*\*Status\*\*:\s*(.+?)\s*$/m.exec(card.body ?? '')?.[1] ??
    undefined
  )
}

function cardCompleted(card: CardState): boolean {
  if (card.state !== 'CLOSED' || card.stateReason === 'NOT_PLANNED') return false
  const at = new Date(card.closedAt ?? '')
  return !Number.isNaN(at.getTime())
}

async function cardState(
  id: string,
  cwd: string,
): Promise<{ board: number; complete: boolean; readable: boolean }> {
  try {
    const script = join(cwd, '.claude/skills/pair-workflow-cycle/scripts/cycle-state.mjs')
    const { stdout: raw } = existsSync(script)
      ? await exec(process.execPath, [script, 'card', '--story', id], {
          cwd,
          encoding: 'utf8',
        })
      : { stdout: await readCardViaGh(id, cwd) }
    const card = JSON.parse(raw) as CardState
    const path = join(cwd, '.pair/adoption/tech/way-of-working.md')
    const mapping = existsSync(path) ? parseStateMapping(readFileSync(path, 'utf8')) : undefined
    const state = cardBoardState(card)
    const macro = state === undefined ? undefined : resolveMacrostate(state, mapping)
    return {
      board: macro === undefined ? 0 : BOARD_RANK[macro],
      complete: cardCompleted(card) || macro === 'Done',
      readable: true,
    }
  } catch {
    return { board: 0, complete: false, readable: false }
  }
}

interface LinkedPr {
  readonly body?: string
  readonly state?: string
  readonly isDraft?: boolean
  readonly labels?: readonly { readonly name?: string }[]
  readonly reviewDecision?: string
  readonly statusCheckRollup?: readonly {
    readonly context?: string
    readonly state?: string
  }[]
  readonly mergedAt?: string | null
  readonly closingIssuesReferences?: readonly { readonly number?: number }[]
}

function isLinkedPr(pr: LinkedPr, id: string): boolean {
  if (pr.closingIssuesReferences?.length)
    return pr.closingIssuesReferences.some(issue => issue.number === Number(id))
  const exactReference = new RegExp(`(?:^|[^0-9])#${id}(?![0-9])`)
  return exactReference.test(pr.body ?? '')
}

function isReadyPr(pr: LinkedPr): boolean {
  const labels = new Set(pr.labels?.map(label => label.name))
  const reviewGreen = pr.statusCheckRollup?.some(
    check => check.context === 'pair-review' && check.state === 'SUCCESS',
  )
  return Boolean(
    labels.has('pr-state:ready-to-merge') && pr.reviewDecision === 'APPROVED' && reviewGreen,
  )
}

function linkedPrRank(pr: LinkedPr, id: string): number {
  if (!isLinkedPr(pr, id) || pr.state === 'CLOSED') return 0
  if (pr.state === 'MERGED') return pr.mergedAt ? 4 : 0
  if (pr.state !== 'OPEN') return 0
  if (pr.isDraft) return 1
  return isReadyPr(pr) ? 3 : 2
}

async function readLinkedPrs(cwd: string): Promise<LinkedPr[]> {
  const { stdout: raw } = await exec(
    'gh',
    [
      'pr',
      'list',
      '--state',
      'all',
      '--limit',
      '1000',
      '--json',
      'body,state,isDraft,labels,reviewDecision,statusCheckRollup,mergedAt,closingIssuesReferences',
    ],
    { cwd, encoding: 'utf8' },
  )
  return JSON.parse(raw) as LinkedPr[]
}

async function prRank(id: string, readPrs: () => Promise<LinkedPr[]>): Promise<number> {
  try {
    return (await readPrs()).reduce((best, pr) => Math.max(best, linkedPrRank(pr, id)), 0)
  } catch {
    return 0
  }
}

async function durableState(
  main: string,
  id: string,
  cwd: string,
  deps: {
    closedAt?: RunHandlerDependencies['readCardClosedAt']
    readPrs: () => Promise<LinkedPr[]>
  },
): Promise<{ progress: CardProgress; atTarget: boolean }> {
  if (deps.closedAt !== undefined)
    return {
      progress: [0, 0, readCardRank(main, id)],
      atTarget: deps.closedAt(id, cwd) instanceof Date,
    }
  const [card, pr] = await Promise.all([cardState(id, cwd), prRank(id, deps.readPrs)])
  if (!card.readable) return { progress: [0, 0, 0], atTarget: false }
  const atTarget = card.complete
  return {
    progress: [card.board, atTarget ? 0 : pr, readCardRank(main, id)],
    atTarget,
  }
}

export async function handleCardsRun(input: CardsEntryInput): Promise<number> {
  const { config, context, cwd, deps } = input
  const cards = config.cards!
  const maxPasses = config.maxIterations ?? context.policy.maxIterations
  console.log(chalk.bold('pair-cli run --cards'))
  console.log(`  Cards: ${cards.map(id => `#${id}`).join(' → ')}`)
  console.log(
    `  Passes: at most ${maxPasses} (${config.maxIterations !== undefined ? '--max-iterations' : 'policy'})`,
  )
  if (config.dryRun) {
    console.log(chalk.dim('  Dry run: nothing was spawned.'))
    return 0
  }
  const main = mainCheckoutOrCwd(cwd)
  let prCache: Promise<LinkedPr[]> | undefined
  const readPrs = (): Promise<LinkedPr[]> => (prCache ??= readLinkedPrs(cwd))
  const run = cardRunner(input)
  const report = await whileInterruptible(
    () => {},
    () =>
      runCardList({
        cards,
        maxPasses,
        runCard: async id => {
          prCache = undefined
          return run(id)
        },
        readRank: id => readCardRank(main, id),
        atTarget: id => deps.readCardClosedAt?.(id, cwd) instanceof Date,
        readState: id => durableState(main, id, cwd, { closedAt: deps.readCardClosedAt, readPrs }),
        interrupted: isInterrupted,
      }),
  )
  for (const line of renderCardsReport(report)) console.log(line)
  ;(deps.appendAudit ?? appendAuditLine)(
    context.auditPath,
    `${new Date().toISOString()} event=cards passes=${report.passes} stop=${report.stop} outcomes=${report.cards.map(c => `${c.id}:${c.end}`).join(',')}`,
  )
  return cardsExitCode(report)
}
