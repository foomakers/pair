import chalk from 'chalk'
import { acquireCardLock } from './card-lock'
import {
  cardsExitCode,
  readCardRank,
  renderCardsReport,
  runCardList,
  type CardsCardRunner,
} from './cards-run'
import { CardUnreadableError, mainCheckoutOrCwd, readCardClosedAt } from './cycle-wiring'
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
  const closedAt = deps.readCardClosedAt ?? readCardClosedAt
  const report = await whileInterruptible(
    () => {},
    () =>
      runCardList({
        cards,
        maxPasses,
        runCard: cardRunner(input),
        readRank: id => readCardRank(main, id),
        atTarget: id => closedAt(id, cwd) instanceof Date,
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
