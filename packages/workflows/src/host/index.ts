import { buildMessage, readResult, type InvocationStyle } from '../dispatch'
import {
  next,
  record,
  type RunDirectory,
  type RunFiles,
  type RunState,
  type StepLaunch,
} from '../engine'
import type { KindName } from '../grammar'
import { kindByName, type StepResult, type StepStatus } from '../kinds'
import {
  closeRun,
  measured,
  recordStep,
  UNKNOWN_TOKENS,
  type StepExecution,
  type TelemetryHost,
  type Usage,
} from '../telemetry'

/** One line of a run: a step that starts, or a step that ended with its result. */
export interface StepEvent {
  readonly step: string
  readonly kind: KindName
  readonly state: 'running' | StepStatus
  readonly summary?: string
  readonly reason?: string
  readonly detail?: string
}

/**
 * What a host implements. The package decides what runs next and what its result means; the host
 * owns everything the package must not touch: processes, the worktree, the console.
 */
export interface WorkflowHost {
  /** The disk, for the run directory. */
  readonly files: RunFiles
  /** How the host's engine is told to run a skill. */
  readonly style: InvocationStyle
  /** The host's prompt-safety check. */
  readonly isSafeText: (value: string) => boolean
  /**
   * Launches the agent of one step in the run's worktree and resolves to its final message —
   * `undefined` when the agent died or timed out. Rejects when the run is interrupted: nothing is
   * recorded, the step stays `running` on disk and runs again at the next launch. A host whose engine
   * reports usage hands it to `meter`; the last call is the step's usage.
   */
  launch(
    step: StepLaunch,
    message: string,
    meter: (usage: Usage) => void,
  ): Promise<string | undefined>
  /** Sees every step start and every recorded result, in order. */
  report?(event: StepEvent): void
}

/** The settings a step launches with. */
export interface StepSettings {
  readonly engine: string
  readonly model?: string | undefined
  readonly effort?: string | undefined
}

/** The settings of one step: the run's own, the same for every step, until per-step configuration lands (#672). */
export const settingsOf = (run: StepSettings, _stepId: string): StepSettings => run

/** Telemetry of a run, when it is on: absent, nothing is written and nothing else changes. */
export interface TelemetryOptions {
  readonly host: TelemetryHost
  /** What the run's steps launch with. */
  readonly settings: StepSettings
  /** The clock. */
  readonly now?: () => Date
  /** Told once when a record cannot be written. */
  readonly warn?: (message: string) => void
}

export interface RunOutcome {
  readonly run: Exclude<RunState, 'running'>
  /** The last step this launch recorded. */
  readonly last?: StepEvent
}

async function execute(
  host: WorkflowHost,
  run: RunDirectory,
  step: StepLaunch,
  meter: (usage: Usage) => void,
): Promise<StepResult> {
  const kind = kindByName[step.kind]
  let message: string
  try {
    message = buildMessage(step, kind, host)
  } catch (error) {
    const summary = (error as Error).message
    return record(run, step.id, { status: 'failed', reason: 'unsafe-value', summary })
  }
  const final = await host.launch(step, message, meter)
  if (final === undefined)
    return record(run, step.id, {
      status: 'failed',
      reason: 'no-result',
      summary: 'the agent ended without a final message',
    })
  return record(run, step.id, readResult(final, kind), final)
}

/**
 * The run's telemetry, when it is on. It never fails a run: the first write error is reported, and
 * the run goes on without it.
 */
function writerOf(run: RunDirectory, telemetry: TelemetryOptions) {
  let told = false
  const safe = async (write: Promise<void>): Promise<void> => {
    try {
      await write
    } catch (error) {
      if (!told)
        telemetry.warn?.(
          `telemetry was not written: ${(error as Error).message} — the run goes on without it`,
        )
      told = true
    }
  }
  return {
    now: telemetry.now ?? (() => new Date()),
    step: (execution: Omit<StepExecution, 'host' | 'settings'>) =>
      safe(
        recordStep(run, {
          ...execution,
          host: telemetry.host,
          settings: settingsOf(telemetry.settings, execution.step.id),
        }),
      ),
    close: (status: RunOutcome['run']) => safe(closeRun(run, status)),
  }
}

type Writer = ReturnType<typeof writerOf> | undefined

/** One step, timed and metered when telemetry is on. */
async function executeMetered(
  host: WorkflowHost,
  run: RunDirectory,
  step: StepLaunch,
  writer: Writer,
): Promise<StepResult> {
  if (writer === undefined) return execute(host, run, step, () => undefined)
  const startedAt = writer.now()
  let usage: Usage | undefined
  const result = await execute(host, run, step, measure => {
    usage = measure
  })
  await writer.step({
    step,
    startedAt,
    durationMs: writer.now().getTime() - startedAt.getTime(),
    tokens: usage === undefined ? UNKNOWN_TOKENS : measured(usage),
    status: result.status,
    ...(result.reason !== undefined && { reason: result.reason }),
  })
  return result
}

async function ended(
  state: RunState,
  last: StepEvent | undefined,
  writer: Writer,
): Promise<RunOutcome> {
  const outcome = state === 'running' ? 'failed' : state
  await writer?.close(outcome)
  return { run: outcome, ...(last !== undefined && { last }) }
}

/** The host loop over a started run: `next` → launch → `record`, until the run is no longer running. */
export async function runSteps(
  host: WorkflowHost,
  dir: string,
  telemetry?: TelemetryOptions,
): Promise<RunOutcome> {
  const run = { files: host.files, dir }
  const writer = telemetry && writerOf(run, telemetry)
  let last: StepEvent | undefined
  for (;;) {
    const { ready, run: state } = await next(run)
    const step = ready[0]
    if (state !== 'running' || step === undefined) return ended(state, last, writer)
    host.report?.({ step: step.id, kind: step.kind, state: 'running' })
    const { status, summary, reason, detail } = await executeMetered(host, run, step, writer)
    last = {
      step: step.id,
      kind: step.kind,
      state: status,
      summary,
      ...(reason !== undefined && { reason }),
      ...(detail !== undefined && { detail }),
    }
    host.report?.(last)
  }
}
