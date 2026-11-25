import { createHash } from 'crypto'
import { join, resolve } from 'path'
import {
  chooseWorkflow,
  completedRun,
  dependencyGraph,
  effectiveSelection,
  orderCards,
  type Filter,
  type WorkflowsConfig,
} from '@pair/workflows'
import { loadConfigWithOverrides } from '#config'
import { MACROSTATES } from './card-readiness'
import { mainCheckoutOrCwd } from './cycle-wiring'
import { isInterrupted, whileInterruptible } from './interrupt'
import { runPool } from './parallel'
import { inPooledCard } from './pooled-card'
import { readWorkflowCards } from './workflow-facts'
import { handleWorkflowRun, resolveWorkflowRun, type Services } from './workflow-host'
import type { RunCommandConfig, RunWorkflowBatch } from './parser'

type Outcome = 'done' | 'failed' | 'parked' | 'waiting' | 'skipped' | 'not-applicable'
export interface BatchOutcome {
  readonly id: string
  readonly outcome: Outcome
  readonly lastStep?: string
  readonly reason?: string
}

interface Schedulable {
  readonly id: string
  readonly prerequisites: readonly string[]
}

export async function scheduleWorkflowCards<T extends Schedulable>(
  cards: readonly T[],
  limit: number,
  prior: Map<string, BatchOutcome>,
  launch: (card: T) => Promise<BatchOutcome>,
): Promise<BatchOutcome[]> {
  const graph = dependencyGraph(cards)
  const done = (id: string) => {
    const outcome = prior.get(id)?.outcome
    return outcome === 'done' || outcome === 'skipped'
  }
  const blocked = (id: string) => graph.get(id)?.selected.filter(dep => !done(dep)) ?? []
  await runPool<T, BatchOutcome>({
    items: cards.filter(card => !prior.has(card.id)),
    limit,
    ready: card => blocked(card.id).length === 0,
    mayStart: () => !isInterrupted(),
    worker: async card => {
      const result = await launch(card)
      prior.set(card.id, result)
      return result
    },
    notStarted: ({ id }) => {
      const reason = isInterrupted()
        ? 'interrupted'
        : `waiting for ${blocked(id)
            .map(dep => `#${dep}`)
            .join(', ')}`
      const result = { id, outcome: 'waiting', reason } as const
      prior.set(id, result)
      return result
    },
    onWorkerError: ({ id }, error) => {
      const result = { id, outcome: 'failed', reason: (error as Error).message } as const
      prior.set(id, result)
      return result
    },
  })
  return cards.map(card => {
    const outcome = prior.get(card.id)!
    const outside = graph.get(card.id)?.outside ?? []
    if (outside.length === 0) return outcome
    const reason = [outcome.reason, `outside selection: ${outside.map(id => `#${id}`).join(', ')}`]
      .filter(Boolean)
      .join(' · ')
    return { ...outcome, reason }
  })
}

const split = (value: string | undefined) => value?.split(',').map(part => part.trim())
function flagsOf(request: RunWorkflowBatch, assignee?: string): Filter {
  const status = split(request.status)
  if (status?.some(one => !MACROSTATES.some(state => state === one)))
    throw new Error(`invalid --status: use ${MACROSTATES.join(', ')}`)
  const has = request.filter === '*' ? undefined : split(request.filter)
  const login = request.assignee === '@me' ? assignee : request.assignee
  return { ...(status && { status }), ...(has && { has }), ...(login && { assignee: [login] }) }
}

export async function handleWorkflowBatch(
  config: RunCommandConfig,
  request: RunWorkflowBatch,
  services: Services,
): Promise<number> {
  const { fs, deps } = services
  const cwd = resolve(config.cwd ?? fs.currentWorkingDirectory())
  const main = mainCheckoutOrCwd(cwd)
  const project = loadConfigWithOverrides(fs, { projectRoot: cwd }).config
  const resolved = resolveWorkflowRun(config, { ...request, card: '' }, services, false)
  if (resolved === undefined) return 1
  const readCards = deps.workflow?.readSelection ?? readWorkflowCards
  const { cards, assignee } = await readCards({ fs, project, cwd, main }, request)
  const selection = effectiveSelection(
    resolved.workflow.select,
    resolved.configuration?.configuration.select,
    flagsOf(request, assignee),
  )
  const runs = join(main, '.pair/working/runs')
  const runId = (id: string) => `${request.runId ?? resolved.workflow.name}-${id}`
  const prior = new Map<string, BatchOutcome>()
  const excluded: BatchOutcome[] = []
  const selected = orderCards(cards, selection.order).filter(card => {
    if (card.error !== undefined) {
      prior.set(card.id, { id: card.id, outcome: 'failed', reason: card.error })
      return true
    }
    if (
      !request.restart &&
      completedRun(
        { files: fs, dir: join(runs, runId(card.id)) },
        { card: card.id, workflow: resolved.workflow.name },
      )
    ) {
      prior.set(card.id, { id: card.id, outcome: 'skipped', reason: 'workflow already complete' })
    } else if (card.closed || !selection.accepts(card)) {
      excluded.push({
        id: card.id,
        outcome: 'not-applicable',
        reason: card.closed ? 'card closed' : 'selection filter',
      })
      return false
    }
    return true
  })
  dependencyGraph(selected)
  for (const card of selected) {
    if (card.uncertain) console.log(`  #${card.id}: unparsed dependency: ${card.uncertain}`)
  }
  const limit = request.parallel ?? resolved.configuration?.configuration.parallel ?? 1
  if (config.dryRun) {
    console.log(
      `  Dry run: ${selected.map(card => card.id).join(', ') || 'no eligible cards'}; parallel ${String(limit)}. Nothing was launched.`,
    )
    excluded.forEach(card => console.log(`  #${card.id}: ${card.outcome} — ${card.reason ?? ''}`))
    return 0
  }
  const releases = new Set<() => void>()
  return await whileInterruptible(
    () => releases.forEach(release => release()),
    async () => {
      const outcomes = await scheduleWorkflowCards(selected, limit, prior, card =>
        inPooledCard(
          {
            onLine: (line, print) => print(`[${card.id}] ${line}`),
          },
          async () => {
            const run = { ...request, card: card.id, runId: runId(card.id) }
            const exit = await handleWorkflowRun(config, run, services, {
              card,
              report: result => prior.set(card.id, result),
              releases,
            })
            return prior.get(card.id) ?? { id: card.id, outcome: exit === 0 ? 'done' : 'failed' }
          },
        ),
      )
      const all = [...outcomes, ...excluded]
      const scope = createHash('sha256')
        .update(
          JSON.stringify({
            cards: request.cards,
            root: request.root,
            filter: request.filter,
            assignee: request.assignee,
            status: request.status,
            configuration: request.config,
            override: request.configOverride,
            runId: request.runId,
          }),
        )
        .digest('hex')
        .slice(0, 16)
      const dir = join(runs, `${resolved.workflow.name}-selection-${scope}`)
      const totals: Partial<Record<Outcome, number>> = {}
      for (const result of all) {
        totals[result.outcome] = (totals[result.outcome] ?? 0) + 1
        console.log(
          `  #${result.id}: ${result.outcome}${result.lastStep ? ` · ${result.lastStep}` : ''}${result.reason ? ` — ${result.reason}` : ''}`,
        )
      }
      fs.mkdirSync(dir, { recursive: true })
      const summary = join(dir, 'summary.json')
      fs.writeFileSync(summary, `${JSON.stringify({ cards: all, totals }, null, 2)}\n`)
      console.log(`  Summary: ${summary} · ${JSON.stringify(totals)}`)
      if (all.some(card => card.outcome === 'waiting' || card.outcome === 'parked'))
        console.log('  Resume parked and waiting cards by repeating this command.')
      return all.some(card => card.outcome === 'failed') ? 1 : 0
    },
  )
}

/** Explicitly named workflow mappings opt a project into routing a bare card to YAML. */
export async function handleMappedWorkflow(
  config: RunCommandConfig,
  services: Services,
): Promise<number | undefined> {
  const card = config.dispatch?.card
  if (
    !card ||
    config.dispatch?.pr ||
    config.profile ||
    config.workflowConfig ||
    config.autonomy ||
    config.eligibilityFilter ||
    config.approveIneligible ||
    config.dispatch?.tagsObserved ||
    config.dispatch?.rounds ||
    config.runSnapshot ||
    config.cards
  )
    return undefined
  const { fs, deps } = services
  const cwd = resolve(config.cwd ?? fs.currentWorkingDirectory())
  const project = loadConfigWithOverrides(fs, { projectRoot: cwd }).config
  const names = Object.keys((project['workflows'] as WorkflowsConfig | undefined) ?? {}).filter(
    name => name !== 'default',
  )
  if (names.length === 0) return undefined
  const main = mainCheckoutOrCwd(cwd)
  const { cards } = await (deps.workflow?.readSelection ?? readWorkflowCards)(
    { fs, project, cwd, main },
    { cards: [card] },
  )
  const found = cards[0]
  if (found?.error !== undefined) throw new Error(found.error)
  const cardId = found?.id ?? card
  function* candidates() {
    for (const name of names) {
      const request = { name, card: cardId, restart: false }
      const resolved = resolveWorkflowRun(config, request, services, false)
      if (resolved === undefined) throw new Error(`workflow-invalid: ${name}`)
      yield {
        request,
        selection: effectiveSelection(
          resolved.workflow.select,
          resolved.configuration?.configuration.select,
        ),
      }
    }
  }
  const selected =
    found === undefined || found.closed ? undefined : chooseWorkflow(candidates(), found)
  if (selected === undefined)
    throw new Error(
      `workflow-not-applicable: no mapped workflow accepts card ${card}; pass a workflow name explicitly`,
    )
  return await handleWorkflowRun(config, selected.request, services)
}
