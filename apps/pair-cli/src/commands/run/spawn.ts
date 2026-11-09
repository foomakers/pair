import { spawn } from 'child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import type { EngineDefinition } from './engines'
import { HEADLESS_STDIN } from './autonomy'
import {
  parseFinalResult,
  readIterationOutcome,
  toLines,
  type IterationResult,
} from './stream-reader'
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
  /** US-623: where the engine writes its final message, for an engine declaring `lastMessageArgs`. */
  readonly lastMessagePath?: string | undefined
}

/** The engine's argv: headless/stream flags, an optional cwd flag, autonomy, then the prompt. */
export function buildEngineArgs(input: EngineArgsInput): string[] {
  return [
    ...input.engine.headlessArgs,
    ...(input.engine.modelFlag && input.model ? [input.engine.modelFlag, input.model] : []),
    ...(input.engine.effortArgs && input.effort ? input.engine.effortArgs(input.effort) : []),
    ...(input.engine.cwdFlag ? [input.engine.cwdFlag, input.cwd] : []),
    ...(input.engine.lastMessageArgs && input.lastMessagePath
      ? input.engine.lastMessageArgs(input.lastMessagePath)
      : []),
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
  /** r2-6: the run's max fix rounds, for a claude progress `fix n/<max>`. */
  readonly maxFixRounds?: number | undefined
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

/** US-506 T-8 (AC12): stopped by a bound before any terminal event ⇒ a STALL, named as one. */
function stalledOrResult(result: IterationResult, stopped: string | undefined): IterationResult {
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
}

/**
 * US-623 AC8: opt-in isolation of a codex session from the user's own skills/MCP config —
 * `PAIR_CODEX_HOME=<dir>` runs it under that CODEX_HOME. Absent ⇒ `undefined` (untouched); a home with
 * no `auth.json` is a clear error, never a silent fallback to the user's home.
 */
function isolatedCodexHome(engine: EngineDefinition): string | { error: string } | undefined {
  const raw = process.env['PAIR_CODEX_HOME']
  if (engine.id !== 'codex' || !raw) return undefined
  const home = resolve(raw)
  return existsSync(join(home, 'auth.json'))
    ? home
    : {
        error: `PAIR_CODEX_HOME=${home} has no auth.json — log codex in under it (CODEX_HOME=${home} codex login) or unset PAIR_CODEX_HOME`,
      }
}

/** US-573 AC7 + US-623 AC8: the engine's own env (and an isolated CODEX_HOME) over the driver's; absent ⇒ inherit. */
function engineEnv(engine: EngineDefinition, home: string | undefined) {
  if (engine.env === undefined && home === undefined) return {}
  return { env: { ...process.env, ...engine.env, ...(home && { CODEX_HOME: home }) } }
}

/** US-623 AC3: a temp file the engine writes its final message to; read only when the stream carried no result. */
function openLastMessageChannel(engine: EngineDefinition) {
  if (!engine.lastMessageArgs) return undefined
  const dir = mkdtempSync(join(tmpdir(), 'pair-last-message-'))
  const path = join(dir, 'last-message.txt')
  return {
    path,
    merge: (result: IterationResult): IterationResult | undefined => {
      if (result.final !== undefined || !existsSync(path)) return undefined
      const final = parseFinalResult(readFileSync(path, 'utf-8'))
      return final && { ...result, final }
    },
    close: () => rmSync(dir, { recursive: true, force: true }),
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
  const isolation = isolatedCodexHome(input.engine)
  if (typeof isolation === 'object') return { outcome: 'failed', detail: isolation.error }
  const channel = openLastMessageChannel(input.engine)
  const lastMessagePath = channel?.path
  const child = spawn(input.engine.command, buildEngineArgs({ ...input, lastMessagePath }), {
    cwd: input.cwd,
    stdio: [HEADLESS_STDIN, 'pipe', 'pipe'],
    // US-573 AC7: an engine's own env (claude: no background-wait ceiling) over the driver's.
    ...engineEnv(input.engine, isolation),
  })
  // Tracked so a SIGTERM/SIGINT on the driver stops it instead of orphaning it (r1-2).
  trackEngine(child)
  // Relayed, never inherited: a raw write to the terminal moves the cursor under the live card rows.
  const stderr = relayLines(child.stderr, input.engine.id)

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
      { maxFixRounds: input.maxFixRounds },
    )
    // US-623 AC3: the stream's last text carried no result ⇒ the engine's dedicated channel is read.
    const channelResult = channel?.merge(result)
    return stalledOrResult(channelResult ?? result, watchdog.stopped())
  } finally {
    watchdog.clear()
    channel?.close()
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM')
    // ponytail: 1s drain bound — a grandchild holding stderr open must not hold the iteration.
    await Promise.race([stderr, new Promise(done => setTimeout(done, 1000).unref())])
  }
}

/** codex prints this on a non-TTY stdin even though stdin is closed (US-603): cosmetic noise. */
const CODEX_STDIN_NOISE = 'Reading additional input from stdin...'

export async function relayLines(
  stream: AsyncIterable<string | Uint8Array>,
  engineId?: string,
): Promise<void> {
  for await (const line of toLines(stream)) {
    if (!line.trim() || (engineId === 'codex' && line.trim() === CODEX_STDIN_NOISE)) continue
    console.log(line)
  }
}
