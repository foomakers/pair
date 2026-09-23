import type { FileSystemService } from '@pair/content-ops'
import chalk from 'chalk'
import { describeMergePosture } from './automation-policy'
import { acquireCardLock } from './card-lock'
import { resolveEngineFor } from './cycle-entry'
import { appendAuditLine } from './dispatch-audit'
import { isInterrupted, whileInterruptible } from './interrupt'
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
import { selectRootCandidates } from './root-select'
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

function reportHeader(input: ParallelRunInput, engineLine: string, root: string): void {
  const { config, context } = input
  const { policy } = context
  const overrides = policy.maxParallelismOverrides
  console.log(chalk.bold('pair-cli run --parallel'))
  console.log(`  ${engineLine}`)
  console.log(
    `  Scope: pair-next --root ${root}` +
      (policy.eligibility !== undefined ? ` --filter ${policy.eligibility} (## Eligibility)` : ''),
  )
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
  readonly startedAt: string
  readonly outcomes: readonly CardOutcome[]
}

function recordBatch({ input, deps, plan, startedAt, outcomes }: BatchRecordInput): void {
  const line = renderBatchAuditLine({
    at: new Date().toISOString(),
    startedAt,
    root: input.config.scope.root!,
    requested: input.config.parallel!,
    effective: plan.limit.effective,
    outcomes,
    excluded: plan.excluded,
  })
  ;(deps.appendAudit ?? appendAuditLine)(input.context.auditPath, line)
}

export async function handleParallelRun(
  input: ParallelRunInput,
  deps: RunHandlerDependencies,
): Promise<number> {
  const { config, context, fs, cwd } = input
  const root = config.scope.root!
  const engine = resolveEngine({ flag: config.engine, declared: declaredEngine(context.config) })
  // Refused here, before anything spawns: the selection process runs under the same posture.
  const autonomy = resolveAutonomyFor(engine.engine, config, cwd, fs)
  reportHeader(input, describeEngineResolution(engine), root)
  for (const note of autonomy.notes) console.log(`  ${note}`)

  if (config.dryRun) {
    console.log(chalk.dim('  Dry run: no selection was run and nothing was spawned.'))
    return 0
  }

  const engineDef = resolveEngineFor(engine, context, cwd, fs)
  const select = deps.selectCandidates ?? selectRootCandidates
  const candidates: RootCandidate[] = await select({
    engine: engineDef,
    root,
    eligibility: context.policy.eligibility,
    cwd,
    autonomyArgs: autonomy.args,
    model: declaredEngineModel(context.config, engineDef.id),
    timeoutSeconds: config.iterationTimeoutSeconds,
    ...(deps.runIteration !== undefined && { runIteration: deps.runIteration }),
  })

  if (candidates.length === 0) {
    console.log(`  Nothing to do: pair-next --root ${root} selected no card.`)
    return 0
  }

  const plan = computeRootPlan({
    candidates,
    eligibility: context.policy.eligibility,
    maxParallelism: {
      global: context.policy.maxParallelism,
      perTier: context.policy.maxParallelismOverrides ?? {},
    },
    requested: config.parallel!,
  })
  for (const line of describeRootPlan(plan)) console.log(`  ${line}`)

  return await runBatch({ input, deps, plan })
}

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

async function runBatch({
  input,
  deps,
  plan,
}: {
  input: ParallelRunInput
  deps: RunHandlerDependencies
  plan: RootPlan
}): Promise<number> {
  const startedAt = new Date().toISOString()
  const finished = new Map<string, CardOutcome>()
  // Resource locks of the cards still running. `host.exit` follows `onInterrupt` at once, before a
  // card's `finally` (it waits on the child's stream 'close'), so the interrupt path releases them.
  const heldLocks = new Set<() => void>()
  const onInterrupt = (signal: string): void => {
    for (const release of [...heldLocks]) release()
    heldLocks.clear()
    const outcomes = plan.run.map(
      c =>
        finished.get(c.id) ?? {
          id: c.id,
          outcome: 'interrupted' as const,
          detail: `the driver received ${signal}`,
        },
    )
    recordBatch({ input, deps, plan, startedAt, outcomes })
    console.log(`  Interrupted by ${signal}: running card processes were stopped.`)
  }

  return await whileInterruptible(onInterrupt, async () => {
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
    recordBatch({ input, deps, plan, startedAt, outcomes })
    return batchExitCode(outcomes)
  })
}
