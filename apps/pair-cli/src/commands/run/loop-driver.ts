import chalk from 'chalk'
import type { RunCommandConfig } from './parser'
import { buildPromptText } from './invocation'
import {
  loopExitCode,
  runLoop,
  type IterationContext,
  type IterationRecord,
  type LoopOutcome,
} from './loop'
import { formatCorrectionNote } from './cycle'
import { spawnIteration } from './spawn'
import type { IterationResult } from './stream-reader'
import type { ResolvedRun, RunHandlerDependencies } from './run-context'
import type { RunEvent } from './run-events'
import { createConsoleSink, routeConsoleTo, type ConsoleSink, type Output } from './run-renderer'
import { createRunAudit, type RunAudit } from './run-audit'
import { onInterrupt } from './interrupt'

/** US-573: where the console sinks write — injectable so the wiring is tested without a terminal. */
export interface RunConsole {
  readonly out: Output
  readonly err: Output
  readonly env: Readonly<Record<string, string | undefined>>
}

const PROCESS_CONSOLE: RunConsole = { out: process.stdout, err: process.stderr, env: process.env }

/** One `pair run`'s live state: the sinks every run event goes to, and the summary tally. */
interface RunSinks {
  readonly sink: ConsoleSink
  readonly audit?: RunAudit
  readonly cards: Map<string, string>
  lastLoopEnd?: RunEvent
  skipped: number
  degradedNoticed: boolean
}

function emit(run: RunSinks, event: RunEvent, iteration: number): void {
  run.audit?.record(event, iteration)
  run.sink.event(event, iteration)
  if (event.event === 'card-end' && event.card !== undefined)
    run.cards.set(event.card, event.status ?? 'failed')
  if (event.event === 'loop-end') run.lastLoopEnd = event
}

/** The effective policy and each value's source, recorded verbatim in the audit's `loop-start`. */
function policySnapshot(resolved: ResolvedRun, config: RunCommandConfig): Record<string, unknown> {
  return {
    source: resolved.policy.source,
    eligibility: resolved.policy.eligibility ?? null,
    stopPredicate: resolved.policy.stopPredicate ?? null,
    maxIterations: resolved.perimeter.maxIterations,
    maxParallelism: resolved.policy.maxParallelism,
    auditLocation: resolved.policy.auditLocation,
    ...(resolved.idleTimeout !== undefined && { idleTimeout: resolved.idleTimeout }),
    iterationTimeoutSeconds: config.iterationTimeoutSeconds ?? null,
  }
}

function openAudit(
  { path, resolved }: { path: string; resolved: ResolvedRun },
  config: RunCommandConfig,
  deps: RunHandlerDependencies,
  sink: ConsoleSink,
): RunAudit {
  return createRunAudit({
    path,
    ...(deps.runAudit !== undefined && { append: deps.runAudit }),
    onWriteError: error =>
      sink.log(
        chalk.yellow(
          `  ! live audit ${path} is not writable (${error instanceof Error ? error.message : String(error)}) — the run continues without it`,
        ),
      ),
    runId: `run-${new Date().toISOString().replace(/[:.]/g, '')}-${process.pid}`,
    root: resolved.perimeter.cwd,
    policy: policySnapshot(resolved, config),
  })
}

function openSinks(
  resolved: ResolvedRun,
  config: RunCommandConfig,
  deps: RunHandlerDependencies,
  io: RunConsole,
): RunSinks {
  const color = config.noColor !== true && io.env['NO_COLOR'] === undefined
  const sink = createConsoleSink({ out: io.out, err: io.err, mode: config.output ?? 'live', color })
  const path = resolved.auditPath
  const audit = path === undefined ? undefined : openAudit({ path, resolved }, config, deps, sink)
  if (path !== undefined) sink.log(`  Audit: ${path} (live JSONL — tail -f it)`)
  const idle = resolved.idleTimeout
  const cap = config.iterationTimeoutSeconds
  if (idle !== undefined)
    sink.log(
      `  Idle timeout: ${idle.seconds}s (source: ${idle.source}) · total cap: ${cap === undefined ? 'none' : `${cap}s`}`,
    )
  return {
    sink,
    ...(audit !== undefined && { audit }),
    cards: new Map(),
    skipped: 0,
    degradedNoticed: false,
  }
}

/** Per finished iteration: the `iteration` event, today's line under `--quiet`, the one-time degrade notice. */
function iterationObserver(run: RunSinks, config: RunCommandConfig, engineId: string) {
  return ({ iteration, result }: IterationRecord): void => {
    run.skipped += result.skippedLines ?? 0
    emit(run, { event: 'iteration', status: result.outcome, reason: result.detail }, iteration)
    if (config.output === 'quiet')
      run.sink.log(`  Iteration ${iteration}: ${result.outcome} — ${result.detail}`)
    if (result.runEvents !== undefined || run.degradedNoticed) return
    run.degradedNoticed = true
    run.sink.log(
      chalk.dim(
        `  ${engineId}: the stream carried no intermediate run events — progress degrades to start/end lines per iteration`,
      ),
    )
  }
}

/**
 * The re-invocation loop itself — identical whether the run was dispatched, invoked directly, or
 * routed to a preparation skill by the DoR fallback: one resolved run, N fresh engine processes.
 *
 * US-573: every run event the engine stream carries feeds three sinks — the console renderer, the
 * live audit and `--json` — and a signal finalizes them (`loop-end interrupted`, cursor restored).
 */
export async function driveRun(
  resolved: ResolvedRun,
  config: RunCommandConfig,
  deps: RunHandlerDependencies,
  io: RunConsole = PROCESS_CONSOLE,
): Promise<number> {
  const run = openSinks(resolved, config, deps, io)
  const restore = routeConsoleTo(run.sink)
  const unsubscribe = onInterrupt(() => {
    run.audit?.end('interrupted', 'the driver received a signal')
    restore()
    run.sink.finish()
  })
  try {
    const outcome = await runLoop({
      maxIterations: resolved.perimeter.maxIterations,
      runIteration: context => {
        if (config.output !== 'quiet')
          emit(run, { event: 'iteration', status: 'start' }, context.iteration)
        return driveIteration(resolved, config, context, {
          deps,
          idleTimeoutSeconds: resolved.idleTimeout?.seconds,
          onRunEvent: event => emit(run, event, context.iteration),
        })
      },
      onFormatRetry: error =>
        run.sink.log(
          `  Iteration wrote a malformed handoff (${error}) — re-run once with the exact validation error`,
        ),
      onIteration: iterationObserver(run, config, resolved.engine.engine.id),
    })
    run.audit?.end(
      outcome.stopReason === 'iteration-failed' ? 'halted' : 'completed',
      stopText(outcome),
    )
    run.sink.finish()
    reportOutcome(outcome, run)
    return loopExitCode(outcome)
  } finally {
    unsubscribe()
    restore()
  }
}

/**
 * One iteration: a FRESH engine process, given the perimeter and the borrowed policy parameters.
 *
 * The continue-token's iteration counter is carried forward exactly as `pair-loop` documents
 * (`--iteration <n+1>`), so a resumed run does not restart its own counter — nothing else crosses
 * the boundary between iterations.
 */
function driveIteration(
  resolved: ResolvedRun,
  config: RunCommandConfig,
  context: IterationContext,
  wiring: {
    deps: RunHandlerDependencies
    idleTimeoutSeconds: number | undefined
    onRunEvent: (event: RunEvent) => void
  },
): Promise<IterationResult> {
  const basePrompt = buildPromptText(resolved.engine.engine, resolved.invocation, {
    ...(resolved.perimeter.root !== undefined && { root: resolved.perimeter.root }),
    // Passed ONLY when the invocation actually carries it. `buildSkillArgs` would drop it anyway,
    // but relying on that is how a flag ends up looking effective while changing nothing: the
    // decision belongs where the perimeter recorded it (round 1, finding 1).
    ...(resolved.perimeter.filterDelivery === 'argument' &&
      resolved.perimeter.filter !== undefined && { filter: resolved.perimeter.filter }),
    ...(resolved.perimeter.assignee !== undefined && { assignee: resolved.perimeter.assignee }),
    ...(resolved.perimeter.status !== undefined && { status: resolved.perimeter.status }),
    ...(resolved.policy.stopPredicate !== undefined && {
      predicate: resolved.policy.stopPredicate,
    }),
    iteration: context.iteration,
    ...approvalArguments(resolved),
  })

  const promptText =
    context.formatCorrection === undefined
      ? basePrompt
      : formatCorrectionNote(context.formatCorrection) + basePrompt
  const run = wiring.deps.runIteration ?? spawnIteration
  return run({
    engine: resolved.engine.engine,
    promptText,
    cwd: resolved.perimeter.cwd,
    autonomyArgs: resolved.autonomy.args,
    timeoutSeconds: config.iterationTimeoutSeconds,
    idleTimeoutSeconds: wiring.idleTimeoutSeconds,
    onRunEvent: wiring.onRunEvent,
    maxFixRounds: LOOP_MAX_FIX_ROUNDS,
  })
}

/**
 * r2-6: the loop path's fix-round budget — `pair-loop` dispatches `pair-implement-batch` with no
 * `pipeline`, so its rounds are the batch's `PIPELINE_DEFAULTS.maxFixRounds` (see the decision log).
 */
const LOOP_MAX_FIX_ROUNDS = 3

const STOP_REASONS: Record<LoopOutcome['stopReason'], string> = {
  'skill-reported-complete':
    'the skill reported itself finished (predicate satisfied, or nothing eligible)',
  'iteration-cap': 'the perimeter iteration cap was reached',
  'iteration-failed': 'an iteration failed (a HALT, a cut, a timeout or no terminal event)',
}

function stopText(outcome: LoopOutcome): string {
  const last = outcome.records.at(-1)?.result
  return outcome.stopReason === 'iteration-failed' && last
    ? `${STOP_REASONS[outcome.stopReason]}: ${last.detail}`
    : STOP_REASONS[outcome.stopReason]
}

const PARKED = new Set(['awaiting-human', 'ready-for-merge', 'target-ready', 'escalated'])

/** US-573 AC8: cards merged / parked / failed / unknown, why the run stopped and what it left eligible. */
function reportOutcome(outcome: LoopOutcome, run: RunSinks): void {
  const statuses = [...run.cards.values()]
  const merged = statuses.filter(s => s === 'merged').length
  const parked = statuses.filter(s => PARKED.has(s)).length
  const unknown = statuses.filter(s => s === 'unknown').length
  const failed = statuses.length - merged - parked - unknown
  const left = run.lastLoopEnd?.eligibleLeft
  const failedRun = outcome.stopReason === 'iteration-failed'
  const paint = failedRun ? chalk.red : chalk.green
  run.sink.log(
    paint(
      `  Stopped after ${outcome.iterations} iteration(s): ${STOP_REASONS[outcome.stopReason]}`,
    ),
  )
  run.sink.log(
    `  Cards: ${merged} merged · ${parked} parked · ${failed} failed · ${unknown} unknown`,
  )
  run.sink.log(
    paint(
      `  stopped: ${stopText(outcome)}, ${left === undefined ? 'eligible cards left unknown' : `${left} eligible card(s) left`}`,
    ),
  )
  if (run.skipped > 0)
    run.sink.log(chalk.yellow(`  Skipped ${run.skipped} unparseable stream line(s)`))
}

/**
 * ONE operator intent, two axes (US-464): `--autonomous` already governs the ENGINE's permission posture;
 * it governs the composed SKILL's approval round too, because "nobody is watching this run" is the same
 * fact in both places. Passed only when the posture is autonomous — an absent `$approval` IS the
 * `interactive` default (ADR-021), so the non-autonomous path renders exactly the bytes it rendered
 * before. US-523: an autonomous prepare drive passes `$approval: auto` too, and `$prepare` with it.
 */
function approvalArguments(resolved: ResolvedRun): {
  approval?: 'auto'
  prepare?: 'never' | 'when'
} {
  const extras = resolved.promptExtras
  return {
    ...((resolved.autonomy.autonomous || extras?.approval === 'auto') && {
      approval: 'auto' as const,
    }),
    ...(extras?.prepare !== undefined && { prepare: extras.prepare }),
  }
}
