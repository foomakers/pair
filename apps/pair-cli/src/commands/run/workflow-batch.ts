import { createHash } from 'crypto'
import { dirname, join, resolve } from 'path'
import {
  chooseWorkflow,
  checkpointCanResume,
  completedRun,
  dependencyGraph,
  effectiveSelection,
  matches,
  orderCards,
  type CardSelection,
  type Filter,
  type WorkflowsConfig,
} from '@pair/workflows'
import { loadConfigWithOverrides } from '#config'
import { MACROSTATES } from './card-readiness'
import { mainCheckoutOrCwd } from './cycle-wiring'
import { isInterrupted, whileInterruptible } from './interrupt'
import { runPool, type PoolInput } from './parallel'
import { inPooledCard } from './pooled-card'
import { createConsoleSink, routeConsoleTo, type ConsoleSink } from './run-renderer'
import { acquireRunLock } from './run-lock'
import { batchWaitDirectory, checkpointVersion, savedWorkflow } from './workflow-saved-state'
import {
  matchesWorkflowCard,
  pendingWorkflowCard,
  readWorkflowCards,
  selectionBoardError,
  type SelectionRun,
  type WorkflowCard,
  type WorkflowSelection,
} from './workflow-selection'
import {
  configureWorkflowRun,
  frozenTierLabels,
  handleWorkflowRun,
  migrateCompletedRunTelemetry,
  resolveWorkflowDefinition,
  resolveWorkflowRun,
  usesTierLabels,
  workflowConfiguration,
  type Services,
} from './workflow-host'
import type { RunCommandConfig, RunScopeOptions, RunWorkflowBatch } from './parser'

type Outcome = 'done' | 'failed' | 'parked' | 'waiting' | 'skipped' | 'not-applicable'
export interface BatchOutcome {
  readonly id: string
  readonly outcome: Outcome
  readonly lastStep?: string
  readonly reason?: string
  readonly skipReason?: 'card-held'
  readonly checkpoint?: { readonly runDir: string; version: string }
  readonly retryWhen?: () => Promise<boolean>
  readonly failedCheckpoint?: {
    readonly runDir: string
    version: string
    readonly workflow: string
  }
}

const isCompleted = (result: BatchOutcome | undefined) =>
  result?.outcome === 'done' || (result?.outcome === 'skipped' && result.skipReason !== 'card-held')

interface Schedulable {
  readonly id: string
  readonly prerequisites: readonly string[]
}

function trackDependencies(
  cards: readonly Schedulable[],
  prior: ReadonlyMap<string, BatchOutcome>,
  read: WorkflowSelection['readDependencies'],
) {
  const selected = new Set(cards.map(card => card.id))
  const pending = new Set(cards.filter(card => !prior.has(card.id)).map(card => card.id))
  const facts = new Map(cards.map(card => [card.id, card]))
  const errors = new Map<string, string>()
  let refresh = Promise.resolve()
  let updating = 0
  return {
    start: (id: string) => pending.delete(id),
    updating: () => updating > 0,
    error: (id: string) => errors.get(id),
    blocked: (id: string) =>
      facts
        .get(id)
        ?.prerequisites.filter(dep => selected.has(dep) && !isCompleted(prior.get(dep))) ?? [],
    outside: (id: string) => facts.get(id)?.prerequisites.filter(dep => !selected.has(dep)),
    afterCompletion: () => {
      if (read === undefined || pending.size === 0) return refresh
      updating++
      refresh = refresh
        .then(async () => {
          const ids = [...pending]
          if (ids.length === 0) return
          try {
            const fresh = new Map((await read(ids)).map(row => [row.id, row]))
            for (const id of ids) {
              const row = fresh.get(id)
              if (row && !row.error) {
                facts.set(id, row)
                errors.delete(id)
              } else errors.set(id, row?.error ?? 'dependency facts missing')
            }
          } catch (error) {
            for (const id of ids) errors.set(id, String(error))
          }
        })
        .finally(() => {
          updating--
        })
      return refresh
    },
  }
}

export async function scheduleWorkflowCards<T extends Schedulable>(
  cards: readonly T[],
  options: {
    limit: number
    polling?: PoolInput<never, BatchOutcome>['polling']
    refreshDependencies?: WorkflowSelection['readDependencies']
  },
  prior: Map<string, BatchOutcome>,
  launch: (card: T) => Promise<BatchOutcome>,
): Promise<BatchOutcome[]> {
  const { limit, polling } = options
  dependencyGraph(cards)
  const deps = trackDependencies(cards, prior, options.refreshDependencies)
  await runPool<T, BatchOutcome>({
    items: cards.filter(card => !prior.has(card.id)),
    limit,
    ready: card => !deps.updating() && !deps.error(card.id) && deps.blocked(card.id).length === 0,
    mayStart: () => !isInterrupted(),
    ...(polling && { polling: withRefresh(polling, prior) }),
    worker: async card => {
      deps.start(card.id)
      const result = await launch(card)
      if (isCompleted(result)) await deps.afterCompletion()
      prior.set(card.id, result)
      return result
    },
    notStarted: ({ id }) => {
      const reason = isInterrupted()
        ? 'interrupted'
        : (deps.error(id) ??
          `waiting for ${deps
            .blocked(id)
            .map(dep => `#${dep}`)
            .join(', ')}`)
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
  return cards.map(({ id }) => withOutsideDependencies(prior.get(id)!, deps.outside(id)))
}

function withRefresh(
  polling: NonNullable<PoolInput<never, BatchOutcome>['polling']>,
  prior: Map<string, BatchOutcome>,
) {
  return {
    ...polling,
    refresh: (result: BatchOutcome) => {
      const update = polling.refresh?.(result)
      if (update !== undefined) prior.set(update.id, update)
      return update
    },
  }
}

function withOutsideDependencies(
  outcome: BatchOutcome,
  outside: readonly string[] = [],
): BatchOutcome {
  if (!outside.length) return outcome
  const reason = [outcome.reason, `outside selection: ${outside.map(id => `#${id}`).join(', ')}`]
    .filter(Boolean)
    .join(' · ')
  return { ...outcome, reason }
}

const split = (value: string | undefined) => value?.split(',').map(part => part.trim())
function flagsOf(request: RunScopeOptions, assignee?: string): Filter {
  const status = split(request.status)
  if (status?.some(one => !MACROSTATES.some(state => state === one)))
    throw new Error(`invalid --status: use ${MACROSTATES.join(', ')}`)
  const has = request.filter === '*' ? undefined : split(request.filter)
  const login = request.assignee === '@me' ? assignee : request.assignee
  if (request.assignee === '@me' && !login) throw new Error('cannot resolve --assignee @me')
  return { ...(status && { status }), ...(has && { has }), ...(login && { assignee: [login] }) }
}

interface Plan {
  readonly selected: readonly WorkflowCard[]
  readonly excluded: readonly BatchOutcome[]
  readonly prior: Map<string, BatchOutcome>
  readonly limit: number
  readonly runId: (id: string) => string
  readonly summary: string
  readonly readDependencies: WorkflowSelection['readDependencies']
  readonly members: ReadonlyMap<string, string>
}

type BatchRequest = { config: RunCommandConfig; request: RunWorkflowBatch; services: Services }
type BatchDefinition = NonNullable<ReturnType<typeof resolveWorkflowDefinition>>

const batchRunId = (request: RunWorkflowBatch, workflow: string) => (id: string) =>
  `${request.runId ?? workflow}-${id}`

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

function completedFromSummary(fs: Services['fs'], summary: string): Set<string> {
  if (!fs.existsSync(summary)) return new Set()
  try {
    const saved = JSON.parse(fs.readFileSync(summary)) as { cards: BatchOutcome[] }
    return new Set(saved.cards.filter(isCompleted).map(card => card.id))
  } catch {
    return new Set()
  }
}

const memberPath = (members: string, id: string) => join(members, `card-${encodeURIComponent(id)}`)

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
  order: Selection['order'],
  outcomeFor: (card: WorkflowCard) => BatchOutcome | undefined,
) {
  const prior = new Map<string, BatchOutcome>()
  const excluded: BatchOutcome[] = []
  const selected = orderCards(cards, order).filter(card => {
    const outcome = outcomeFor(card)
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

function batchConfiguration(
  { config, request, services }: BatchRequest,
  resolved: BatchDefinition,
  runId: Plan['runId'],
  card?: WorkflowCard,
): ReturnType<typeof workflowConfiguration> {
  const run = card ? { ...request, card: card.id, runId: runId(card.id) } : { ...request, card: '' }
  try {
    const cardLabels = card && (frozenTierLabels(resolved, run, services.fs) ?? card.labels)
    return workflowConfiguration(config, run, services, { ...resolved, cardLabels })
  } catch (error) {
    return { errors: [error instanceof Error ? error.message : String(error)], warnings: [] }
  }
}

function selectionScope(
  { request, services: { fs } }: BatchRequest,
  { main, workflow: { name: workflow, select } }: BatchDefinition,
  configured: CardSelection | undefined,
  flags: Filter,
) {
  const runs = join(main, '.pair/working/runs')
  const directoryOf = (scope: ReturnType<typeof selectedStatus>) =>
    summaryDirectory(request, runs, workflow, scope)
  const directory = directoryOf(selectedStatus(select, configured, flags))
  const summary = join(directory, 'summary.json')
  const members = new Map<string, string>()
  const completed = completedFromSummary(fs, summary)
  const runId = batchRunId(request, workflow)
  const runOf = (id: string) =>
    request.restart ? undefined : { files: fs, dir: join(runs, runId(id)), workflow, main }
  const stateFor = ({ id, error }: WorkflowCard, cardSelection: CardSelection | undefined) => {
    const scope = selectedStatus(select, cardSelection, flags)
    const memberDirectory = scope && directoryOf(scope)
    const member = memberDirectory && memberPath(join(memberDirectory, 'members'), id)
    if (member !== undefined) members.set(id, member)
    const run = runOf(id)
    const done =
      error === undefined && run !== undefined && completedRun(run, { card: id, workflow })
    const pastStatus =
      done &&
      member !== undefined &&
      ((memberDirectory === directory && completed.has(id)) || fs.existsSync(member))
    return { run, done, pastStatus }
  }
  return { summary, members, stateFor }
}

async function planBatch(input: BatchRequest, resolved: BatchDefinition): Promise<Plan> {
  const {
    request,
    services: { fs, deps },
  } = input
  const { cards, assignee, readDependencies } = await (
    deps.workflow?.readSelection ?? readWorkflowCards
  )({ fs, ...resolved }, request)
  const { name: workflow, select } = resolved.workflow
  const runId = batchRunId(request, workflow)
  const tiered = usesTierLabels(resolved, request)
  // The fallback also carries batch-wide order and parallelism when it is available.
  const base = tiered ? batchConfiguration(input, resolved, runId).plan : resolved.configuration
  const configured = base?.configuration.select
  const flags = flagsOf(request, assignee)
  const invocationSelection = effectiveSelection(undefined, undefined, flags)
  const { stateFor, summary, members } = selectionScope(input, resolved, configured, flags)
  const { order } = effectiveSelection(select, configured)
  const candidates = selectCards(cards, order, card => {
    let cardSelection = configured
    if (tiered && !card.closed && card.error === undefined) {
      const outcome = batchConfiguration(input, resolved, runId, card)
      if (outcome.errors.length > 0) {
        // CLI flags still apply when the card's configuration cannot supply a selection.
        const scope = selectionOutcome(card, invocationSelection, stateFor(card, undefined))
        if (scope?.outcome === 'not-applicable') return scope
        return { id: card.id, outcome: 'failed', reason: outcome.errors.join(' · ') }
      }
      cardSelection = outcome.plan?.configuration.select
    }
    return selectionOutcome(
      card,
      effectiveSelection(select, cardSelection, flags),
      stateFor(card, cardSelection),
    )
  })
  return {
    ...candidates,
    selected: await loadDependencies(candidates, readDependencies),
    readDependencies,
    limit: request.parallel ?? base?.configuration.parallel ?? 1,
    runId,
    summary,
    members,
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

function writeSummary(
  fs: Services['fs'],
  summary: string,
  cards: readonly BatchOutcome[],
  verbose: boolean,
): number {
  const totals: Partial<Record<Outcome, number>> = {}
  for (const result of cards) {
    totals[result.outcome] = (totals[result.outcome] ?? 0) + 1
    if (verbose) printOutcome(result)
  }
  fs.mkdirSync(dirname(summary), { recursive: true })
  fs.writeFileSync(summary, `${JSON.stringify({ cards, totals }, null, 2)}\n`)
  if (verbose) {
    console.log(`  Summary: ${summary} · ${JSON.stringify(totals)}`)
    if (totals.waiting || totals.parked)
      console.log('  Resume parked and waiting cards by repeating this command.')
  }
  return totals.failed ? 1 : 0
}

async function renderBatchCard(
  sink: ConsoleSink,
  card: WorkflowCard,
  launch: () => Promise<BatchOutcome>,
): Promise<BatchOutcome> {
  sink.event({ event: 'card-start', card: card.id, title: card.title })
  let ended = false
  const result = await inPooledCard(
    {
      onLine: (line, print) => print(`[${card.id}] ${line}`),
      onEvent: event => {
        if (event.event === 'card-end') ended = true
        sink.event(event)
      },
    },
    launch,
  )
  if (!ended) {
    sink.event({
      event: 'card-end',
      card: card.id,
      status: result.checkpoint === undefined ? result.outcome : 'awaiting-human',
      ...(result.reason && { reason: result.reason }),
    })
  }
  return result
}

function renderUnstarted(
  sink: ConsoleSink,
  displayed: ReadonlySet<string>,
  cards: readonly BatchOutcome[],
) {
  for (const result of cards) {
    if (displayed.has(result.id)) continue
    sink.event({
      event: 'card-end',
      card: result.id,
      status: result.outcome,
      ...(result.reason && { reason: result.reason }),
    })
  }
}

function batchLauncher(
  input: BatchRequest,
  plan: Plan,
  sink: ConsoleSink,
  {
    releases,
    checkpoint,
  }: { releases: Set<() => void>; checkpoint: ReturnType<typeof watchBatchCheckpoints> },
) {
  const { config, request, services } = input
  const { prior, runId } = plan
  const displayed = new Set<string>()
  const launch = (card: WorkflowCard) =>
    renderBatchCard(sink, card, async () => {
      displayed.add(card.id)
      const run = {
        ...request,
        card: card.id,
        runId: runId(card.id),
        restart: request.restart && !checkpoint.resumed.has(card.id),
      }
      const exit = await handleWorkflowRun(config, run, services, {
        card,
        report: result => prior.set(card.id, result),
        releases,
        watch: checkpoint.watch,
      })
      return prior.get(card.id) ?? { id: card.id, outcome: exit === 0 ? 'done' : 'failed' }
    })
  return { launch, displayed }
}

function refreshCompletedCard(
  fs: Services['fs'],
  sink: ConsoleSink,
  result: BatchOutcome,
): BatchOutcome | undefined {
  const checkpoint = result.failedCheckpoint
  if (checkpoint === undefined) return undefined
  const version = checkpointVersion(fs, checkpoint.runDir)
  if (version === checkpoint.version) return undefined
  const lock = acquireRunLock(checkpoint.runDir)
  if (lock.kind !== 'acquired') return undefined
  try {
    checkpoint.version = version
    if (
      !completedRun(
        { files: fs, dir: checkpoint.runDir },
        { card: result.id, workflow: checkpoint.workflow },
      )
    )
      return undefined
    sink.event({ event: 'card-end', card: result.id, status: 'completed' })
    return { id: result.id, outcome: 'done' }
  } finally {
    lock.release()
  }
}

async function mayRetryCheckpoint(fs: Services['fs'], result: BatchOutcome): Promise<boolean> {
  if (result.retryWhen !== undefined) return result.retryWhen()
  const checkpoint = result.checkpoint
  if (checkpoint === undefined) return false
  const version = checkpointVersion(fs, checkpoint.runDir)
  if (version === checkpoint.version) return false
  const lock = acquireRunLock(checkpoint.runDir)
  if (lock.kind !== 'acquired') return false
  try {
    const saved = savedWorkflow({ card: result.id, restart: false }, checkpoint.runDir, fs)
    checkpoint.version = version
    return saved !== undefined && checkpointCanResume(saved.workflow, saved.state)
  } finally {
    lock.release()
  }
}

function watchBatchCheckpoints(
  fs: Services['fs'],
  prior: Map<string, BatchOutcome>,
  intervalMs: number,
  sink: ConsoleSink,
) {
  const resumed = new Set<string>()
  const watches = new Map<string, () => void>()
  const watch = (runDir: string): boolean => {
    if (watches.has(runDir)) return true
    const directory = batchWaitDirectory(runDir)
    fs.mkdirSync(directory, { recursive: true })
    const lock = acquireRunLock(directory)
    if (lock.kind !== 'acquired') return false
    watches.set(runDir, lock.release)
    return true
  }
  const polling: NonNullable<PoolInput<never, BatchOutcome>['polling']> = {
    intervalMs,
    watches: ({ checkpoint, failedCheckpoint }) =>
      checkpoint !== undefined || failedCheckpoint !== undefined,
    keepsAlive: result => result.checkpoint !== undefined || result.retryWhen !== undefined,
    refresh: result => refreshCompletedCard(fs, sink, result),
    ready: async result => {
      if (!(await mayRetryCheckpoint(fs, result))) return false
      prior.delete(result.id)
      resumed.add(result.id)
      return true
    },
  }
  return { watch, polling, resumed, release: () => watches.forEach(release => release()) }
}

async function driveBatch(input: BatchRequest, plan: Plan): Promise<number> {
  const { config, services } = input
  const { selected, limit, prior, excluded, members } = plan
  const intervalMs = 1000 * checkpointPollSeconds()
  // Save selection membership before a card can advance past its original status filter.
  for (const { id } of selected) {
    const member = members.get(id)
    if (member !== undefined && prior.get(id)?.outcome !== 'failed')
      services.fs.mkdirSync(member, { recursive: true })
  }
  const releases = new Set<() => void>()
  const sink = createConsoleSink({
    out: process.stdout,
    err: process.stderr,
    mode: config.output ?? 'live',
    color: config.noColor !== true && process.env['NO_COLOR'] === undefined,
    plain: config.verbose !== true,
  })
  const checkpoint = watchBatchCheckpoints(services.fs, prior, intervalMs, sink)
  const restore = routeConsoleTo(sink)
  const { launch, displayed } = batchLauncher(input, plan, sink, { releases, checkpoint })
  try {
    return await whileInterruptible(
      () => {
        releases.forEach(release => release())
        checkpoint.release()
      },
      async () => {
        const cards = [
          ...(await scheduleWorkflowCards(
            selected,
            { limit, polling: checkpoint.polling, refreshDependencies: plan.readDependencies },
            prior,
            launch,
          )),
          ...excluded,
        ]
        renderUnstarted(sink, displayed, cards)
        return writeSummary(services.fs, plan.summary, cards, config.verbose === true)
      },
    )
  } finally {
    checkpoint.release()
    sink.finish()
    restore()
  }
}

function checkpointPollSeconds(): number {
  const seconds = Number(process.env['PAIR_CHECKPOINT_POLL_SECONDS'] ?? 30)
  if (!Number.isSafeInteger(seconds) || seconds < 1 || seconds > 2_147_483)
    throw new Error(
      'PAIR_CHECKPOINT_POLL_SECONDS must be a positive integer within the timer range',
    )
  return seconds
}

export async function handleWorkflowBatch(
  config: RunCommandConfig,
  request: RunWorkflowBatch,
  services: Services,
): Promise<number> {
  const run = { ...request, card: '' }
  const definition = resolveWorkflowDefinition(config, run, services, false)
  if (definition === undefined) return 1
  const resolved = usesTierLabels(definition, request)
    ? definition
    : configureWorkflowRun(config, run, services, definition)
  if (resolved === undefined) return 1
  const input = { config, request, services }
  const plan = await planBatch(input, resolved)
  for (const card of plan.selected) {
    if (card.uncertain) console.log(`  #${card.id}: unparsed dependency: ${card.uncertain}`)
  }
  if (config.dryRun) return previewBatch(plan)
  for (const [id, outcome] of plan.prior) {
    if (outcome.outcome === 'skipped')
      await migrateCompletedRunTelemetry(
        {
          files: services.fs,
          dir: join(resolved.main, '.pair/working/runs', plan.runId(id)),
        },
        config,
        resolved,
        id,
      )
  }
  return driveBatch(input, plan)
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

type Routing = Pick<BatchRequest, 'config' | 'services'> & { main: string; flags: Filter }

function configuredWorkflow(
  name: string,
  card: WorkflowCard,
  { config, services, flags }: Routing,
  resume = false,
) {
  const request = { name, card: card.id, restart: false, routedCard: card }
  const resolved = resolveWorkflowRun(config, request, services, { resume, card })
  if (resolved === undefined) throw new Error(`workflow-invalid: ${name}`)
  const workflow = resolved.workflow.select
  const configuration = resolved.configuration?.configuration.select
  return {
    request,
    selection: effectiveSelection(workflow, configuration, flags),
    unscoped: effectiveSelection(workflow, configuration),
  }
}

const mappedNames = (config: WorkflowsConfig = {}) =>
  Object.keys(config).filter(name => name !== 'default')

function mappedCard(found: WorkflowCard | undefined, names: string[], routing: Routing) {
  if (found?.error !== undefined) throw new Error(found.error)
  if (found === undefined || found.closed) return {}
  const { id } = found
  const { main, services, flags } = routing
  let excluded = false
  function trackExclusion(card: WorkflowCard, unscoped: Selection) {
    excluded ||= !matches(flags, card) && unscoped.accepts(card)
  }
  for (const name of names) {
    const pending = pendingWorkflowCard(found, {
      files: services.fs,
      dir: join(main, '.pair/working/runs', `${name}-${id}`),
      workflow: name,
      main,
    })
    if (pending === undefined) continue
    const candidate = configuredWorkflow(name, pending, routing, true)
    if (candidate.selection.accepts(pending)) return { selected: candidate }
    trackExclusion(pending, candidate.unscoped)
  }
  function* candidates(card: WorkflowCard) {
    for (const name of names) {
      const candidate = configuredWorkflow(name, card, routing)
      const error = selectionBoardError(card, candidate.selection)
      if (error !== undefined) throw new Error(error)
      trackExclusion(card, candidate.unscoped)
      yield candidate
    }
  }
  const selected = chooseWorkflow(candidates(found), found)
  return { selected, excluded }
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
  const { cards, assignee } = await (deps.workflow?.readSelection ?? readWorkflowCards)(
    { fs, project, cwd, main },
    { cards: [card], ...config.scope },
  )
  const flags = flagsOf(config.scope, assignee)
  const { selected, excluded } = mappedCard(cards[0], names, { main, config, services, flags })
  if (selected !== undefined)
    return await handleWorkflowRun(config, { ...selected.request, selectionFlags: flags }, services)
  if (excluded) {
    printOutcome({ id: card, outcome: 'not-applicable', reason: 'selection filter' })
    return 0
  }
  throw new Error(
    `workflow-not-applicable: no mapped workflow accepts card ${card}; pass a workflow name explicitly`,
  )
}
