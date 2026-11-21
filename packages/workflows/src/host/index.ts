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
   * recorded, the step stays `running` on disk and runs again at the next launch.
   */
  launch(step: StepLaunch, message: string): Promise<string | undefined>
  /** Sees every step start and every recorded result, in order. */
  report?(event: StepEvent): void
}

/** The settings a step launches with. */
export interface StepSettings {
  readonly engine: string
  readonly model?: string | undefined
}

/** The settings of one step: the run's own, the same for every step, until per-step configuration lands (#672). */
export const settingsOf = (run: StepSettings, _stepId: string): StepSettings => run

export interface RunOutcome {
  readonly run: Exclude<RunState, 'running'>
  /** The last step this launch recorded. */
  readonly last?: StepEvent
}

async function execute(
  host: WorkflowHost,
  run: RunDirectory,
  step: StepLaunch,
): Promise<StepResult> {
  const kind = kindByName[step.kind]
  let message: string
  try {
    message = buildMessage(step, kind, host)
  } catch (error) {
    const summary = (error as Error).message
    return record(run, step.id, { status: 'failed', reason: 'unsafe-value', summary })
  }
  const final = await host.launch(step, message)
  if (final === undefined)
    return record(run, step.id, {
      status: 'failed',
      reason: 'no-result',
      summary: 'the agent ended without a final message',
    })
  return record(run, step.id, readResult(final, kind), final)
}

/** The host loop over a started run: `next` → launch → `record`, until the run is no longer running. */
export async function runSteps(host: WorkflowHost, dir: string): Promise<RunOutcome> {
  const run = { files: host.files, dir }
  let last: StepEvent | undefined
  for (;;) {
    const { ready, run: state } = await next(run)
    const step = ready[0]
    if (state !== 'running' || step === undefined)
      return { run: state === 'running' ? 'failed' : state, ...(last !== undefined && { last }) }
    host.report?.({ step: step.id, kind: step.kind, state: 'running' })
    const { status, summary, reason, detail } = await execute(host, run, step)
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
