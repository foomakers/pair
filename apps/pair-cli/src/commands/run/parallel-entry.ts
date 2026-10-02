import type { FileSystemService } from '@pair/content-ops'
import chalk from 'chalk'
import { describeMergePosture } from './automation-policy'
import { acquireCardLock } from './card-lock'
import { resolveEngineFor } from './cycle-entry'
import { appendAuditLine } from './dispatch-audit'
import {
  isInterrupted,
  signalExitCode,
  whileInterruptible,
  type InterruptSignal,
} from './interrupt'
import { probeCardLock, probeResourceLocks } from './lock-probe'
import {
  describeLoopEnd,
  describeLoopValues,
  describeScope,
  iterationFields,
  loopEndFields,
  loopStartFields,
  renderIterationLine,
  renderLoopAuditLine,
  resolveLoopValues,
  resolveSelection,
  type FanOutSelection,
  type LoopValues,
} from './loop-report'
import { parseStopCondition } from './stop-predicate'
import { wait as shippedWait } from './wait'
import { runWatchLoop, type LoopSelection, type WatchLoopDeps } from './watch-loop'
import {
  batchExitCode,
  renderBatchAuditLine,
  runPlannedCard,
  runPool,
  spawnCardProcess,
  type CardOutcome,
} from './parallel'
import type { RunCommandConfig } from './parser'
import { describeEngineResolution, resolveEngine } from './resolve-engine'
import { computeRootPlan, describeRootPlan, type RootCandidate, type RootPlan } from './root-plan'
import { selectRootAnswer, selectRootCandidates, type SelectRootInput } from './root-select'
import {
  declaredEngine,
  declaredEngineModel,
  resolveAutonomyFor,
  type RunContext,
  type RunHandlerDependencies,
} from './run-context'

/**
 * `pair-cli run --root <id> --parallel N` — the fan-out entry (US-491).
 *
 * Order, all of it printed: resolve (engine, policy, autonomy) → select (`pair-next --root`, one
 * fresh engine process) → plan (`pair-loop`'s dependency + mutex analysis) → print the plan and the
 * effective limit → run the pool of `run --card` processes → report every card → append ONE batch
 * line to the audit trail. Nothing here merges (AC5) and nothing here selects (AC7).
 */

export interface ParallelRunInput {
  readonly config: RunCommandConfig
  readonly context: RunContext
  readonly fs: FileSystemService
  readonly cwd: string
}

function reportHeader(
  input: ParallelRunInput,
  engineLine: string,
  selection: FanOutSelection,
): void {
  const { config, context } = input
  const { policy } = context
  const overrides = policy.maxParallelismOverrides
  console.log(chalk.bold('pair-cli run --parallel'))
  console.log(`  ${engineLine}`)
  console.log(`  Scope: ${describeScope(selection)}`)
  console.log(`  Policy: ${policy.source} · audit ${policy.auditLocation}`)
  console.log(
    `  Requested: --parallel ${String(config.parallel)} · ## Max Parallelism ${policy.maxParallelism}` +
      (overrides !== undefined
        ? ` (per-tier: ${Object.entries(overrides)
            .map(([tier, n]) => `${tier} ${n}`)
            .join(', ')})`
        : ''),
  )
  console.log(`  Unit: one \`pair-cli run --card <id>\` process per card`)
  console.log(`  ${describeMergePosture(policy)}`)
  for (const warning of policy.warnings) console.log(chalk.yellow(`  ! ${warning}`))
}

function reportOutcomes(outcomes: readonly CardOutcome[]): void {
  console.log(chalk.bold('  Batch outcome:'))
  if (outcomes.length === 0) console.log('    (no card was run)')
  for (const o of outcomes) {
    const line = `    #${o.id}: ${o.outcome} — ${o.detail}`
    console.log(o.outcome === 'failed' || o.outcome === 'crashed' ? chalk.red(line) : line)
  }
}

interface BatchRecordInput {
  readonly input: ParallelRunInput
  readonly deps: RunHandlerDependencies
  readonly plan: RootPlan
  readonly root: string
  readonly startedAt: string
  readonly outcomes: readonly CardOutcome[]
}

function recordBatch({ input, deps, plan, root, startedAt, outcomes }: BatchRecordInput): void {
  const line = renderBatchAuditLine({
    at: new Date().toISOString(),
    startedAt,
    root,
    requested: input.config.parallel!,
    effective: plan.limit.effective,
    outcomes,
    excluded: plan.excluded,
  })
  ;(deps.appendAudit ?? appendAuditLine)(input.context.auditPath, line)
}

/**
 * r1-1: `## Workflows` declared and no `## Eligibility` ⇒ every child `run --card` skips as
 * `automation-off` (decideDispatch) — no DoR fallback, so `--approve-ineligible` cannot admit it.
 * The fan-out stops before selecting, as tier 1 (`pair-loop` parsePolicyOrHalt) does: nothing
 * spawned, nothing reported completed for work no child did. Returns whether it stopped.
 */
function reportAutomationOff(context: RunContext): boolean {
  const { policy } = context
  if (policy.workflows === undefined || policy.eligibility !== undefined) return false
  console.log(
    `  Automation is off: the policy declares \`## Workflows\` but no \`## Eligibility\`, so every ` +
      `run --card would skip (automation-off). Nothing selected, nothing spawned.`,
  )
  return true
}

/** US-522 AC2: a scope must resolve from SOMEWHERE — refused before anything spawns, naming both. */
function assertScope(selection: FanOutSelection): void {
  if (selection.root === undefined && selection.filter === undefined) {
    throw new Error(
      '--parallel needs a scope: pass --root <id> or --filter <label>, or declare `root` / `filter` in ' +
        '`## Autonomy` (or a `## Eligibility` label) in .pair/adoption/tech/automation.md',
    )
  }
}

interface FanOut {
  readonly input: ParallelRunInput
  readonly deps: RunHandlerDependencies
  readonly selection: FanOutSelection
  readonly engineDef: ReturnType<typeof resolveEngineFor>
  readonly autonomyArgs: readonly string[]
}

/** One fresh selection process, scoped by the resolved selection (and the loop contract, in loop mode). */
function selectionInput(fan: FanOut, loop?: SelectRootInput['loop']): SelectRootInput {
  const { input, deps, selection, engineDef } = fan
  return {
    engine: engineDef,
    root: selection.root?.value,
    eligibility: selection.filter?.value,
    assignee: selection.assignee?.value,
    status: selection.status?.value,
    cwd: input.cwd,
    autonomyArgs: fan.autonomyArgs,
    model: declaredEngineModel(input.context.config, engineDef.id),
    timeoutSeconds: input.config.iterationTimeoutSeconds,
    ...(loop !== undefined && { loop }),
    ...(deps.runIteration !== undefined && { runIteration: deps.runIteration }),
  }
}

function planFor(fan: FanOut, candidates: RootCandidate[]): RootPlan {
  const { input } = fan
  const { policy } = input.context
  const plan = computeRootPlan({
    candidates,
    eligibility: policy.eligibility,
    maxParallelism: {
      global: policy.maxParallelism,
      perTier: policy.maxParallelismOverrides ?? {},
    },
    requested: input.config.parallel!,
  })
  for (const line of describeRootPlan(plan)) console.log(`  ${line}`)
  return plan
}

function reportPreamble(
  input: ParallelRunInput,
  engineLine: string,
  resolved: { selection: FanOutSelection; values: LoopValues; notes: readonly string[] },
): void {
  const { config, context } = input
  const { selection, values, notes } = resolved
  reportHeader(input, engineLine, selection)
  for (const note of notes) console.log(`  ${note}`)
  if (!values.loopMode) return
  const lines = describeLoopValues(
    values,
    selection,
    config.parallel!,
    context.policy.maxParallelism,
  )
  for (const line of lines) console.log(`  ${line}`)
}

/** Today's single batch (US-491): one selection, the plan, the pool. Unchanged output. */
async function runSingleBatch(fan: FanOut): Promise<number> {
  const { input, deps, selection } = fan
  const select =
    deps.selectCandidates ??
    (deps.selectAnswer !== undefined
      ? async (i: SelectRootInput) => (await deps.selectAnswer!(i)).candidates
      : selectRootCandidates)
  const candidates: RootCandidate[] = await select(selectionInput(fan))

  if (candidates.length === 0) {
    console.log(
      selection.root !== undefined
        ? `  Nothing to do: pair-next --root ${selection.root.value} selected no card.`
        : `  Nothing to do: ${describeScope(selection)} selected no card.`,
    )
    return 0
  }

  const plan = planFor(fan, candidates)
  return await runBatch({ input, deps, plan, root: rootLabel(selection) })
}

export async function handleParallelRun(
  input: ParallelRunInput,
  deps: RunHandlerDependencies,
): Promise<number> {
  const { config, context, fs, cwd } = input
  const selection = resolveSelection(config, context.policy, context.autonomySelection)
  assertScope(selection)
  const values = resolveLoopValues(config, context.policy)
  const engine = resolveEngine({ flag: config.engine, declared: declaredEngine(context.config) })
  // Refused here, before anything spawns: the selection process runs under the same posture.
  const autonomy = resolveAutonomyFor(engine.engine, config, cwd, fs)
  reportPreamble(input, describeEngineResolution(engine), {
    selection,
    values,
    notes: autonomy.notes,
  })

  if (reportAutomationOff(context)) return 0

  if (config.dryRun) {
    console.log(chalk.dim('  Dry run: no selection was run and nothing was spawned.'))
    return 0
  }

  const engineDef = resolveEngineFor(engine, context, cwd, fs)
  const fan: FanOut = { input, deps, selection, engineDef, autonomyArgs: autonomy.args }
  return values.loopMode ? await runLoop(fan, values) : await runSingleBatch(fan)
}

/** The batch audit line's `root=` field: the root, or `(none)` for a filter-only scope. */
const rootLabel = (selection: FanOutSelection): string => selection.root?.value ?? '(none)'

async function runCardInBatch({
  input,
  deps,
  card,
  finished,
  heldLocks,
}: {
  input: ParallelRunInput
  deps: RunHandlerDependencies
  card: RootCandidate
  finished: Map<string, CardOutcome>
  heldLocks: Set<() => void>
}): Promise<CardOutcome> {
  const outcome = await runPlannedCard({
    card,
    config: input.config,
    cwd: input.cwd,
    workingArea: input.context.workingArea,
    acquireLock: deps.acquireLock ?? acquireCardLock,
    runCardProcess: deps.runCardProcess ?? spawnCardProcess,
    heldLocks,
  })
  finished.set(card.id, outcome)
  console.log(`  Ended #${card.id}: ${outcome.outcome} — ${outcome.detail}`)
  return outcome
}

/**
 * One batch of `run --card` processes over a plan: what to do when a signal arrives mid-batch
 * (`onInterrupt`) and how to run it (`run`). Split so the single-batch path and the loop share ONE
 * body and differ only in who owns the signal handler.
 */
interface BatchContext {
  readonly input: ParallelRunInput
  readonly deps: RunHandlerDependencies
  readonly plan: RootPlan
  readonly root: string
}

function createBatch(ctx: BatchContext): {
  onInterrupt(signal: string): void
  run(): Promise<readonly CardOutcome[]>
} {
  const { input, deps, plan } = ctx
  const startedAt = new Date().toISOString()
  const finished = new Map<string, CardOutcome>()
  // Resource locks of the cards still running. `host.exit` follows `onInterrupt` at once, before a
  // card's `finally` (it waits on the child's stream 'close'), so the interrupt path releases them.
  const heldLocks = new Set<() => void>()
  const record = (outcomes: readonly CardOutcome[]): void =>
    recordBatch({ ...ctx, startedAt, outcomes })
  return {
    onInterrupt: signal => {
      for (const release of [...heldLocks]) release()
      heldLocks.clear()
      record(
        plan.run.map(
          c =>
            finished.get(c.id) ?? {
              id: c.id,
              outcome: 'interrupted' as const,
              detail: `the driver received ${signal}`,
            },
        ),
      )
      console.log(`  Interrupted by ${signal}: running card processes were stopped.`)
    },
    run: async () => {
      const outcomes = await runPool({
        items: plan.run,
        limit: plan.limit.effective,
        mayStart: () => !isInterrupted(),
        worker: card => runCardInBatch({ input, deps, card, finished, heldLocks }),
        notStarted: card => ({ id: card.id, outcome: 'interrupted', detail: 'never started' }),
        onWorkerError: (card, error) => ({
          id: card.id,
          outcome: 'crashed',
          detail: error instanceof Error ? error.message : String(error),
        }),
      })
      reportOutcomes(outcomes)
      record(outcomes)
      return outcomes
    },
  }
}

async function runBatch({
  input,
  deps,
  plan,
  root,
}: {
  input: ParallelRunInput
  deps: RunHandlerDependencies
  plan: RootPlan
  root: string
}): Promise<number> {
  const batch = createBatch({ input, deps, plan, root })
  return await whileInterruptible(batch.onInterrupt, async () => batchExitCode(await batch.run()))
}

// ── the watch loop (US-522) ───────────────────────────────────────────────────────────────────────

/** A card's lock state for the loop: the card lock, then every mutex-resource lock (read-only). */
function probeLockFor(workingArea: string) {
  return (card: RootCandidate): ReturnType<typeof probeCardLock> => {
    const own = probeCardLock({ workingArea, card: card.id })
    if (own.kind === 'held') return own
    const resource = probeResourceLocks({ card, workingArea })
    return resource.kind === 'held'
      ? {
          kind: 'held',
          path: resource.path,
          ...(resource.since !== undefined && { since: resource.since }),
        }
      : { kind: 'free' }
  }
}

/** The loop's audit writer: one `<at> key=value …` line per call, in the trail's own shape. */
function auditWriter(
  input: ParallelRunInput,
  deps: RunHandlerDependencies,
): (fields: ReadonlyArray<readonly [string, string]>) => void {
  return fields =>
    (deps.appendAudit ?? appendAuditLine)(
      input.context.auditPath,
      renderLoopAuditLine(new Date().toISOString(), fields),
    )
}

/** The loop's collaborators, wired to the real selection, probes, batch and console/audit. */
function loopDeps(
  fan: FanOut,
  values: LoopValues,
  hooks: {
    audit(fields: ReadonlyArray<readonly [string, string]>): void
    onSelect(): void
    setBatch(onInterrupt: ((signal: string) => void) | undefined): void
  },
  predicateSelector: string | undefined,
): WatchLoopDeps {
  const { input, deps, selection } = fan
  const answer =
    deps.selectAnswer ??
    (deps.selectCandidates !== undefined
      ? async (i: SelectRootInput) => ({ candidates: await deps.selectCandidates!(i) })
      : selectRootAnswer)
  return {
    select: async (): Promise<LoopSelection> => {
      hooks.onSelect()
      return await answer(selectionInput(fan, { predicateSelector }))
    },
    probeLock: probeLockFor(input.context.workingArea),
    runBatch: async cards => {
      const plan = planFor(fan, [...cards])
      const batch = createBatch({ input, deps, plan, root: rootLabel(selection) })
      hooks.setBatch(batch.onInterrupt)
      try {
        return { outcomes: await batch.run() }
      } finally {
        hooks.setBatch(undefined)
      }
    },
    wait: deps.wait ?? shippedWait,
    isInterrupted,
    onIteration: record => {
      console.log(renderIterationLine(record, values.interval.value))
      hooks.audit(iterationFields(record))
    },
  }
}

/** The loop's single `loop-end`: the first call writes, later calls are no-ops. */
function onceWriter(
  audit: (fields: ReturnType<typeof loopEndFields>) => void,
): (fields: ReturnType<typeof loopEndFields>) => void {
  let ended = false
  return fields => {
    if (!ended) audit(fields)
    ended = true
  }
}

function parsePredicate(
  text: string | undefined,
): ReturnType<typeof parseStopCondition> | undefined {
  return text === undefined ? undefined : parseStopCondition(text)
}

/** A throw inside an iteration still frames the trail: loop-end exit 1, then the error propagates (AC11). */
function failLoop(
  error: unknown,
  started: number,
  end: (fields: ReturnType<typeof loopEndFields>) => void,
): never {
  if (!isInterrupted()) {
    const detail = error instanceof Error ? error.message : String(error)
    end(loopEndFields('selection failed', started, 1, detail))
  }
  throw error
}

/**
 * The fan-out as a loop: ONE `whileInterruptible` owns the whole run, so a signal anywhere (a batch or
 * the idle wait) writes the batch line (if one is running), releases the locks, writes `loop-end` and
 * exits 128 + signal — never two handlers, never a second `end`.
 */
async function runLoop(fan: FanOut, values: LoopValues): Promise<number> {
  const { input, deps, selection } = fan
  const { config, context } = input
  const audit = auditWriter(input, deps)
  const predicate = parsePredicate(context.policy.stopPredicate)

  let started = 0
  let currentBatch: ((signal: string) => void) | undefined
  const end = onceWriter(audit)

  audit(loopStartFields(values, selection, config.parallel!, context.policy.maxParallelism))

  const onInterrupt = (signal: InterruptSignal): void => {
    currentBatch?.(signal)
    end(
      loopEndFields(
        'interrupted',
        started,
        signalExitCode(signal),
        `the driver received ${signal}`,
      ),
    )
    console.log(`  Loop interrupted by ${signal} at iteration ${started}.`)
  }
  const wired = loopDeps(
    fan,
    values,
    {
      audit,
      onSelect: () => void started++,
      setBatch: batch => void (currentBatch = batch),
    },
    predicate?.selector,
  )

  return await whileInterruptible(onInterrupt, async () => {
    const loopConfig = {
      watch: config.watch === true,
      intervalMs: values.interval.ms,
      cap: values.cap.value,
      predicate,
    }
    const result = await runWatchLoop(loopConfig, wired).catch((error: unknown) =>
      failLoop(error, started, end),
    )
    console.log(describeLoopEnd(result))
    end(loopEndFields(result.reason, result.iterations, result.exitCode, result.selectionError))
    return result.exitCode
  })
}
