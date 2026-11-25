import { join } from 'node:path'
import { identityOf, type RunDirectory, type StepLaunch } from '../engine'
import { CARD_STATES, cardStateOf, cardStateToConfirm, type CardState, type Step } from '../grammar'
import type { WorkflowHost } from '../host'
import type { StepResult } from '../kinds'
import { runHostProcess } from '../worktree/host-process'
import { sessionCard, sessionPrHead } from '../worktree/session'
import { riskTagFamily } from './risk-tag-family'
import { readOptional } from './session-files'
import { hostSteps } from './host-steps'
import { cycleScripts, isSafeText, readAdoption, type Project } from './session-project'
import { assignCard, runWorkflowOperation, type HostOperation } from './workflow-facts'

type HostInput = Pick<Parameters<typeof hostSteps>[0], 'reply' | 'onPark'> & {
  worktree: string | undefined
  steps: readonly Step[]
}

function boardTransition(
  steps: readonly Step[],
  setState: (state: CardState) => Promise<unknown>,
  warn: (message: string) => void,
): NonNullable<WorkflowHost['transition']> {
  return async event => {
    const step = steps.find(candidate => candidate.id === event.step)
    if (step === undefined || cardStateToConfirm(step)) return
    const set = cardStateOf(step)
    const when = event.state === 'running' ? 'start' : event.state === 'ok' ? 'end' : undefined
    if (set === undefined || set.when !== when) return
    try {
      await setState(set.state)
    } catch (error) {
      warn(`Warning: card state ${set.state} not set: ${(error as Error).message}`)
    }
  }
}

function cardFacts({ labels, boardState, boardError, assignees }: ReturnType<typeof sessionCard>) {
  return {
    labels,
    ...(boardState !== null && { status: boardState }),
    ...(boardError !== undefined && { statusError: boardError }),
    ...(assignees !== undefined && { assignees }),
  }
}

function resultFacts(
  scripts: string,
  main: string,
  cardView: () => ReturnType<typeof sessionCard>,
  readMapping: () => Promise<unknown>,
) {
  let mapping: Partial<Record<CardState, string>> = {}
  return {
    async readResultFacts(step: StepLaunch, result: StepResult) {
      if (step.kind === 'implement')
        return { head: sessionPrHead(scripts, main, Number(result['pr'])) }
      const view = cardView()
      if (view.boardError !== undefined) throw new Error(view.boardError)
      if (step.pendingSuccess !== undefined) mapping = (await readMapping()) as typeof mapping
      const family = riskTagFamily(readOptional(join(main, '.pair/adoption/tech/risk-matrix.md')))
      return {
        card: { ...view, boardStatus: view.boardState },
        ...(family !== undefined && { riskTagFamily: family }),
      }
    },
    isAtLeastBoardStatus(status: string | null, target: CardState) {
      return (
        CARD_STATES.findIndex(state => mapping[state] === status) >= CARD_STATES.indexOf(target)
      )
    },
  }
}

export function sessionHost(
  project: Project,
  run: RunDirectory,
  { worktree, steps, reply, onPark }: HostInput,
): WorkflowHost {
  if (worktree === undefined) throw new Error('invalid-lease: missing worktree')
  const scripts = cycleScripts(project)
  const { main } = project
  const { card } = identityOf(run)
  const adoption = readAdoption(project)
  const operation: HostOperation = request =>
    runWorkflowOperation(runHostProcess, () => scripts, main, request)
  const call = (action: string, data: unknown) => operation({ action, card, data })
  const cardView = () => sessionCard(scripts, main, card)
  const warn = (message: string) => process.stderr.write(`${message}\n`)
  const setsState = (state: CardState) => call('board-state', { state, adoption })
  return {
    id: 'session',
    files: run.files,
    style: 'instruction',
    isSafeText,
    async launch() {
      throw new Error('The session must dispatch agent steps from next')
    },
    async card(filter) {
      return cardFacts(sessionCard(scripts, main, card, filter.assignee !== undefined))
    },
    assignCard: assign => assignCard(operation, card, assign, warn),
    ...hostSteps({
      run,
      main,
      worktree,
      adoption,
      operation,
      process: runHostProcess,
      channel: 'session',
      reply,
      onPark,
    }),
    ...resultFacts(scripts, main, cardView, () => call('board-mapping', adoption)),
    async confirmState(target) {
      await setsState(target)
    },
    transition: boardTransition(steps, setsState, warn),
  }
}
