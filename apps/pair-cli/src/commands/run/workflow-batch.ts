import { createHash } from 'crypto'
import { dirname, join, resolve } from 'path'
import {
  chooseWorkflow,
  completedRun,
  dependencyGraph,
  effectiveSelection,
  orderCards,
  type CardSelection,
  type Filter,
  type WorkflowsConfig,
} from '@pair/workflows'
import { loadConfigWithOverrides } from '#config'
import { MACROSTATES } from './card-readiness'
import { mainCheckoutOrCwd } from './cycle-wiring'
import { isInterrupted, whileInterruptible } from './interrupt'
import { runPool } from './parallel'
import { inPooledCard } from './pooled-card'
import {
  matchesWorkflowCard,
  pendingWorkflowCard,
  readWorkflowCards,
  selectionBoardError,
  type SelectionRun,
  type WorkflowCard,
  type WorkflowSelection,
} from './workflow-selection'
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

interface Plan {
  readonly selected: readonly WorkflowCard[]
  readonly excluded: readonly BatchOutcome[]
  readonly prior: Map<string, BatchOutcome>
  readonly limit: number
  readonly runId: (id: string) => string
  readonly summary: string
}

type BatchRequest = { config: RunCommandConfig; request: RunWorkflowBatch; services: Services }

function summaryDirectory(
  request: RunWorkflowBatch,
  runs: string,
  workflow: string,
  statusScope?: { filter: CardSelection['filter']; flags: Filter },
): string {
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
        statusScope,
      }),
    )
    .digest('hex')
    .slice(0, 16)
  return join(runs, `${workflow}-selection-${scope}`)
}

function completedSelection(fs: Services['fs'], summary: string): Set<string> {
  if (!fs.existsSync(summary)) return new Set()
  try {
    const saved = JSON.parse(fs.readFileSync(summary)) as { cards: BatchOutcome[] }
    return new Set(
      saved.cards.filter(card => ['done', 'skipped'].includes(card.outcome)).map(card => card.id),
    )
  } catch {
    return new Set()
  }
}

type Selection = ReturnType<typeof effectiveSelection>

function selectionOutcome(
  card: WorkflowCard,
  selection: Selection,
  { run, done, pastStatus }: { run: SelectionRun | undefined; done: boolean; pastStatus: boolean },
): BatchOutcome | undefined {
  const { id } = card
  const error = card.error ?? (pastStatus ? undefined : selectionBoardError(card, selection))
  if (error !== undefined) return { id, outcome: 'failed', reason: error }
  // Only a completed member of this selection can bypass its original status filter.
  const accepts: Selection['accepts'] = pastStatus
    ? facts => selection.accepts(facts) || selection.needsStatus(facts)
    : selection.accepts
  if (!matchesWorkflowCard(card, accepts, done ? undefined : run))
    return {
      id,
      outcome: 'not-applicable',
      reason: card.closed ? 'card closed' : 'selection filter',
    }
  return done ? { id, outcome: 'skipped', reason: 'workflow already complete' } : undefined
}

function selectCards(
  cards: readonly WorkflowCard[],
  selection: Selection,
  runOf: (id: string) => SelectionRun | undefined,
  previouslySelected: ReadonlySet<string>,
) {
  const prior = new Map<string, BatchOutcome>()
  const excluded: BatchOutcome[] = []
  const selected = orderCards(cards, selection.order).filter(card => {
    const run = runOf(card.id)
    const done =
      card.error === undefined &&
      run !== undefined &&
      completedRun(run, { card: card.id, workflow: run.workflow })
    const outcome = selectionOutcome(card, selection, {
      run,
      done,
      pastStatus: done && previouslySelected.has(card.id),
    })
    if (outcome?.outcome === 'not-applicable') {
      excluded.push(outcome)
      return false
    }
    if (outcome !== undefined) prior.set(card.id, outcome)
    return true
  })
  return { selected, prior, excluded }
}

async function loadDependencies(
  { selected, prior }: ReturnType<typeof selectCards>,
  read: WorkflowSelection['readDependencies'],
): Promise<readonly WorkflowCard[]> {
  const ids = selected.filter(card => prior.get(card.id)?.outcome !== 'failed').map(card => card.id)
  if (read === undefined || ids.length === 0) return selected
  const dependencies = new Map((await read(ids)).map(facts => [facts.id, facts]))
  return selected.map(card => {
    const outcome = prior.get(card.id)
    if (outcome?.outcome === 'failed') return card
    const facts = dependencies.get(card.id)
    const reason = facts === undefined ? 'dependency facts missing' : facts.error
    if (reason === undefined) return { ...card, ...facts }
    prior.set(
      card.id,
      outcome?.outcome === 'skipped'
        ? { ...outcome, reason: `workflow already complete · dependency read: ${reason}` }
        : { id: card.id, outcome: 'failed', reason },
    )
    return card
  })
}

function selectedStatus(
  workflow: CardSelection | undefined,
  config: CardSelection | undefined,
  flags: Filter,
) {
  const filter = config?.filter ?? workflow?.filter
  return filter?.status || flags.status ? { filter, flags } : undefined
}

async function planBatch(
  { request, services }: BatchRequest,
  resolved: NonNullable<ReturnType<typeof resolveWorkflowRun>>,
): Promise<Plan> {
  const { fs, deps } = services
  const { cards, assignee, readDependencies } = await (
    deps.workflow?.readSelection ?? readWorkflowCards
  )({ fs, ...resolved }, request)
  const workflow = resolved.workflow.name
  const configuration = resolved.configuration?.configuration
  const flags = flagsOf(request, assignee)
  const configured = configuration?.select
  const selection = effectiveSelection(resolved.workflow.select, configured, flags)
  const runs = join(resolved.main, '.pair/working/runs')
  const statusScope = selectedStatus(resolved.workflow.select, configured, flags)
  const summary = join(summaryDirectory(request, runs, workflow, statusScope), 'summary.json')
  const runId = (id: string) => `${request.runId ?? workflow}-${id}`
  const runOf = (id: string) =>
    request.restart
      ? undefined
      : { files: fs, dir: join(runs, runId(id)), workflow, main: resolved.main }
  const candidates = selectCards(cards, selection, runOf, completedSelection(fs, summary))
  return {
    ...candidates,
    selected: await loadDependencies(candidates, readDependencies),
    limit: request.parallel ?? configuration?.parallel ?? 1,
    runId,
    summary,
  }
}

function printOutcome(result: BatchOutcome): void {
  const step = result.lastStep ? ` · ${result.lastStep}` : ''
  const reason = result.reason ? ` — ${result.reason}` : ''
  console.log(`  #${result.id}: ${result.outcome}${step}${reason}`)
}

function previewBatch(plan: Plan): number {
  dependencyGraph(plan.selected)
  console.log(
    `  Dry run: ${
      plan.selected
        .filter(card => !plan.prior.has(card.id))
        .map(card => card.id)
        .join(', ') || 'no eligible cards'
    }; parallel ${plan.limit}. Nothing was launched.`,
  )
  for (const result of [...plan.prior.values(), ...plan.excluded]) printOutcome(result)
  return [...plan.prior.values()].some(card => card.outcome === 'failed') ? 1 : 0
}

function writeSummary(fs: Services['fs'], summary: string, cards: readonly BatchOutcome[]): number {
  const totals: Partial<Record<Outcome, number>> = {}
  for (const result of cards) {
    totals[result.outcome] = (totals[result.outcome] ?? 0) + 1
    printOutcome(result)
  }
  fs.mkdirSync(dirname(summary), { recursive: true })
  fs.writeFileSync(summary, `${JSON.stringify({ cards, totals }, null, 2)}\n`)
  console.log(`  Summary: ${summary} · ${JSON.stringify(totals)}`)
  if (totals.waiting || totals.parked)
    console.log('  Resume parked and waiting cards by repeating this command.')
  return totals.failed ? 1 : 0
}

async function driveBatch(input: BatchRequest, plan: Plan): Promise<number> {
  const { config, request, services } = input
  const { selected, limit, prior, excluded, runId } = plan
  const releases = new Set<() => void>()
  const launch = (card: WorkflowCard): Promise<BatchOutcome> =>
    inPooledCard({ onLine: (line, print) => print(`[${card.id}] ${line}`) }, async () => {
      const run = { ...request, card: card.id, runId: runId(card.id) }
      const exit = await handleWorkflowRun(config, run, services, {
        card,
        report: result => prior.set(card.id, result),
        releases,
      })
      return prior.get(card.id) ?? { id: card.id, outcome: exit === 0 ? 'done' : 'failed' }
    })
  return await whileInterruptible(
    () => releases.forEach(release => release()),
    async () =>
      writeSummary(services.fs, plan.summary, [
        ...(await scheduleWorkflowCards(selected, limit, prior, launch)),
        ...excluded,
      ]),
  )
}

export async function handleWorkflowBatch(
  config: RunCommandConfig,
  request: RunWorkflowBatch,
  services: Services,
): Promise<number> {
  const resolved = resolveWorkflowRun(config, { ...request, card: '' }, services, false)
  if (resolved === undefined) return 1
  const input = { config, request, services }
  const plan = await planBatch(input, resolved)
  for (const card of plan.selected) {
    if (card.uncertain) console.log(`  #${card.id}: unparsed dependency: ${card.uncertain}`)
  }
  return config.dryRun ? previewBatch(plan) : driveBatch(input, plan)
}

function legacyCycleRequested(config: RunCommandConfig): boolean {
  return [
    config.dispatch?.pr,
    config.profile,
    config.workflowConfig,
    config.autonomy,
    config.eligibilityFilter,
    config.approveIneligible,
    config.dispatch?.tagsObserved,
    config.dispatch?.rounds,
    config.runSnapshot,
    config.cards,
  ].some(Boolean)
}

type Routing = Pick<BatchRequest, 'config' | 'services'> & { main: string }

function configuredWorkflow(
  name: string,
  card: string,
  { config, services }: Routing,
  resume = false,
) {
  const request = { name, card, restart: false }
  const resolved = resolveWorkflowRun(config, request, services, resume)
  if (resolved === undefined) throw new Error(`workflow-invalid: ${name}`)
  return {
    request,
    selection: effectiveSelection(
      resolved.workflow.select,
      resolved.configuration?.configuration.select,
    ),
  }
}

const mappedNames = (config: WorkflowsConfig = {}) =>
  Object.keys(config).filter(name => name !== 'default')

function mappedCard(found: WorkflowCard | undefined, names: string[], routing: Routing) {
  if (found?.error !== undefined) throw new Error(found.error)
  if (found === undefined || found.closed) return undefined
  const { id } = found
  const { main, services } = routing
  for (const name of names) {
    const pending = pendingWorkflowCard(found, {
      files: services.fs,
      dir: join(main, '.pair/working/runs', `${name}-${id}`),
      workflow: name,
      main,
    })
    if (pending === undefined) continue
    const candidate = configuredWorkflow(name, id, routing, true)
    if (candidate.selection.accepts(pending)) return candidate
  }
  function* candidates(card: WorkflowCard) {
    for (const name of names) {
      const candidate = configuredWorkflow(name, id, routing)
      const error = selectionBoardError(card, candidate.selection)
      if (error !== undefined) throw new Error(error)
      yield candidate
    }
  }
  return chooseWorkflow(candidates(found), found)
}

/** Explicitly named workflow mappings opt a project into routing a bare card to YAML. */
export async function handleMappedWorkflow(
  config: RunCommandConfig,
  services: Services,
): Promise<number | undefined> {
  const card = config.dispatch?.card
  if (!card || legacyCycleRequested(config)) return undefined
  const { fs, deps } = services
  const cwd = resolve(config.cwd ?? fs.currentWorkingDirectory())
  const project = loadConfigWithOverrides(fs, { projectRoot: cwd }).config
  const names = mappedNames(project['workflows'] as WorkflowsConfig | undefined)
  if (names.length === 0) return undefined
  const main = mainCheckoutOrCwd(cwd)
  const { cards } = await (deps.workflow?.readSelection ?? readWorkflowCards)(
    { fs, project, cwd, main },
    { cards: [card] },
  )
  const selected = mappedCard(cards[0], names, { main, config, services })
  if (selected === undefined)
    throw new Error(
      `workflow-not-applicable: no mapped workflow accepts card ${card}; pass a workflow name explicitly`,
    )
  return await handleWorkflowRun(config, selected.request, services)
}
