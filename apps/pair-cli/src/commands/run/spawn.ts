import { spawn } from 'child_process'
import type { EngineDefinition } from './engines'
import { HEADLESS_STDIN } from './autonomy'
import { readIterationOutcome, toLines, type IterationResult } from './stream-reader'
import type { RunEvent } from './run-events'
import { isInterrupted, trackEngine } from './interrupt'

/**
 * Spawning one iteration (US-451 T-9).
 *
 * A FRESH process per iteration, never a reused session: that is the shape the whole story
 * rests on, not an implementation detail (BR5). Argument assembly is a pure function so the
 * invariants a reviewer cares about — no shell string, no merge command, stdin closed — are
 * asserted without spawning anything.
 */

export interface EngineArgsInput {
  readonly engine: EngineDefinition
  /** The prompt text — ONE argv element, never interpolated into a shell command. */
  readonly promptText: string
  readonly cwd: string
  /** Autonomy args, already translated through the engine map (empty ⇒ confirmations active). */
  readonly autonomyArgs: readonly string[]
  /** The model this project pinned for this engine, if any (`engine.model` in pair.config.json). */
  readonly model?: string | undefined
  /** US-488: a profile's effort for this stage — sent only when the engine declares `effortArgs`. */
  readonly effort?: string | undefined
}

/** The engine's argv: headless/stream flags, an optional cwd flag, autonomy, then the prompt. */
export function buildEngineArgs(input: EngineArgsInput): string[] {
  return [
    ...input.engine.headlessArgs,
    ...(input.engine.modelFlag && input.model ? [input.engine.modelFlag, input.model] : []),
    ...(input.engine.effortArgs && input.effort ? input.engine.effortArgs(input.effort) : []),
    ...(input.engine.cwdFlag ? [input.engine.cwdFlag, input.cwd] : []),
    ...input.autonomyArgs,
    input.promptText,
  ]
}

/** US-573 AC5: an iteration is stopped after this long WITHOUT an engine event (30 min). */
export const DEFAULT_IDLE_TIMEOUT_SECONDS = 1800

export interface IdleTimeout {
  readonly seconds: number
  readonly source: string
}

/** Precedence: `--idle-timeout` > `## Stop Predicate` `idle-timeout:` > `pair.config.json` `engine.idleTimeout` > default. */
export function resolveIdleTimeout(input: {
  readonly flag?: number | undefined
  readonly policy?: number | undefined
  readonly declared?: number | undefined
}): IdleTimeout {
  if (input.flag !== undefined) return { seconds: input.flag, source: '--idle-timeout' }
  if (input.policy !== undefined)
    return { seconds: input.policy, source: '## Stop Predicate idle-timeout' }
  if (input.declared !== undefined)
    return { seconds: input.declared, source: 'pair.config.json engine.idleTimeout' }
  return { seconds: DEFAULT_IDLE_TIMEOUT_SECONDS, source: 'default' }
}

export interface SpawnIterationInput extends EngineArgsInput {
  /** Opt-in total wall-clock cap per iteration (`--iteration-timeout`); absent ⇒ none (US-573). */
  readonly timeoutSeconds?: number | undefined
  /** The hang guard: seconds without an engine event before the engine is stopped (default 30 min). */
  readonly idleTimeoutSeconds?: number | undefined
  /** US-491: observes every decoded stream event (see `readIterationOutcome`). */
  readonly onEvent?: (payload: unknown) => void
  /** US-573: observes every run event (`PAIR_EVENT` line). */
  readonly onRunEvent?: (event: RunEvent) => void
}

/**
 * The two bounds on one iteration (US-573 AC5): the idle timer, re-armed by every decoded event, and
 * the opt-in total cap. Whichever fires first stops the engine; the first reason is kept, naming the
 * last card/stage a run event reported.
 */
function createWatchdog(
  input: Pick<SpawnIterationInput, 'idleTimeoutSeconds' | 'timeoutSeconds'>,
  kill: () => void,
) {
  let stopped: string | undefined
  let where = ''
  const stop = (detail: () => string) => () => {
    stopped ??= detail()
    kill()
  }
  const idleSeconds = input.idleTimeoutSeconds ?? DEFAULT_IDLE_TIMEOUT_SECONDS
  const onIdle = stop(() => `timed out (idle)${where}: no engine event for ${idleSeconds}s`)
  let idle = setTimeout(onIdle, idleSeconds * 1000)
  const cap =
    input.timeoutSeconds === undefined
      ? undefined
      : setTimeout(
          stop(
            () =>
              `stalled: no terminal event within ${input.timeoutSeconds}s — the engine was stopped`,
          ),
          input.timeoutSeconds * 1000,
        )
  return {
    rearm: () => {
      clearTimeout(idle)
      idle = setTimeout(onIdle, idleSeconds * 1000)
    },
    saw: (event: RunEvent) => {
      if (event.card !== undefined)
        where = ` at ${event.card}${event.stage ? `/${event.stage}` : ''}`
    },
    stopped: () => stopped,
    clear: () => {
      clearTimeout(idle)
      clearTimeout(cap)
    },
  }
}

/**
 * Runs one iteration and returns what its STREAM said.
 *
 * The child's exit code is deliberately never read (AC7): the outcome comes from the terminal
 * event alone. `stdin` is closed, so an engine that unexpectedly asks for input gets EOF instead
 * of hanging; the idle watchdog (re-armed by every decoded event, US-573) kills a child that goes
 * silent for any other reason, and the iteration then fails as `timed-out`.
 */
export async function spawnIteration(input: SpawnIterationInput): Promise<IterationResult> {
  // r1-2: once the driver was signalled, the engine it is stopping must not be replaced by the next.
  if (isInterrupted())
    throw new Error('interrupted: the driver received a signal, no engine is started')
  const child = spawn(input.engine.command, buildEngineArgs(input), {
    cwd: input.cwd,
    stdio: [HEADLESS_STDIN, 'pipe', 'inherit'],
    // US-573 AC7: an engine's own env (claude: no background-wait ceiling) over the driver's.
    ...(input.engine.env !== undefined && { env: { ...process.env, ...input.engine.env } }),
  })
  // Tracked so a SIGTERM/SIGINT on the driver stops it instead of orphaning it (r1-2).
  trackEngine(child)

  const watchdog = createWatchdog(input, () => child.kill('SIGTERM'))
  try {
    child.stdout.setEncoding('utf-8')
    const result = await readIterationOutcome(
      toLines(child.stdout),
      input.engine,
      payload => {
        watchdog.rearm()
        input.onEvent?.(payload)
      },
      event => {
        watchdog.saw(event)
        input.onRunEvent?.(event)
      },
    )
    // US-506 T-8 (AC12): stopped by a bound before any terminal event ⇒ a STALL, named as one.
    const stopped = watchdog.stopped()
    if (stopped === undefined || result.outcome === 'success') return result
    const { skippedLines, runEvents } = result
    return {
      outcome: 'failed',
      cause: 'timed-out',
      detail: stopped,
      stalled: true,
      ...(skippedLines !== undefined && { skippedLines }),
      ...(runEvents !== undefined && { runEvents }),
    }
  } finally {
    watchdog.clear()
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM')
  }
}
