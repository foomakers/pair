import { spawn, type ChildProcess, type ChildProcessByStdio } from 'child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import type { Readable } from 'stream'
import type { EngineDefinition } from './engines'
import { HEADLESS_STDIN } from './autonomy'
import {
  parseFinalResult,
  readIterationOutcome,
  toLines,
  type IterationResult,
} from './stream-reader'
import type { RunEvent } from './run-events'
import { ENGINE_GRACE_MS, isInterrupted, trackEngine } from './interrupt'

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
  /** Capture process facts for workflow attempt history. */
  readonly diagnoseProcess?: boolean
  /** Opt in to waiting for a finalized result file when the stream result is insufficient. */
  readonly shouldFinalizeLastMessage?: (result: IterationResult) => boolean
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

type ProcessStop = { kind: 'idle' | 'timeout'; detail: string; timeoutSeconds: number }

/**
 * The two bounds on one iteration (US-573 AC5): the idle timer, re-armed by every decoded event, and
 * the opt-in total cap. Whichever fires first stops the engine; the first reason is kept, naming the
 * last card/stage a run event reported.
 */
function createWatchdog(
  input: Pick<SpawnIterationInput, 'idleTimeoutSeconds' | 'timeoutSeconds'>,
  kill: (signal: 'SIGTERM' | 'SIGKILL') => void,
) {
  let stopped: ProcessStop | undefined
  let where = ''
  // US-600: after the soft stop a bounded grace elapses, then the read is abandoned (`grace`).
  let graceOver!: () => void
  const grace = new Promise<undefined>(done => (graceOver = () => done(undefined)))
  const stop = (kind: ProcessStop['kind'], timeoutSeconds: number, detail: () => string) => () => {
    if (stopped === undefined) setTimeout(graceOver, ENGINE_GRACE_MS).unref()
    stopped ??= { kind, detail: detail(), timeoutSeconds }
    kill('SIGTERM')
  }
  const idleSeconds = input.idleTimeoutSeconds ?? DEFAULT_IDLE_TIMEOUT_SECONDS
  const onIdle = stop(
    'idle',
    idleSeconds,
    () => `timed out (idle)${where}: no engine event for ${idleSeconds}s`,
  )
  let idle = setTimeout(onIdle, idleSeconds * 1000)
  const capSeconds = input.timeoutSeconds
  const cap =
    capSeconds === undefined
      ? undefined
      : setTimeout(
          stop(
            'timeout',
            capSeconds,
            () => `stalled: no terminal event within ${capSeconds}s — the engine was stopped`,
          ),
          capSeconds * 1000,
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
    grace,
    clear: () => {
      clearTimeout(idle)
      clearTimeout(cap)
    },
  }
}

/**
 * US-506 T-8 (AC12): stopped by a bound before any terminal event ⇒ a STALL, named as one.
 * US-600 AC3: a terminal event arriving after expiry never turns the timeout into success.
 */
function stalledOrResult(
  result: IterationResult | undefined,
  stopped: string | undefined,
): IterationResult {
  if (stopped === undefined && result !== undefined) return result
  const { skippedLines, runEvents } = result ?? {}
  return {
    outcome: 'failed',
    cause: 'timed-out',
    detail: stopped ?? 'timed out',
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
      if (!existsSync(path)) return undefined
      const lastMessage = readFileSync(path, 'utf-8')
      if (lastMessage.trim() === '') return undefined
      const final = parseFinalResult(lastMessage)
      const merged = { ...result, lastMessage }
      delete merged.final
      return final === undefined ? merged : { ...merged, final }
    },
    close: () => rmSync(dir, { recursive: true, force: true }),
  }
}

async function awaitGroupExit(child: ChildProcess): Promise<void> {
  if (!child.stdout?.closed || !child.stderr?.closed) {
    await Promise.race([
      new Promise<void>(done => child.once('close', () => done())),
      new Promise<void>(done => setTimeout(done, 1000)),
    ])
  }
  // The leader may already have exited while an inherited pipe still belongs to its group.
  if (child.pid) {
    const deadline = Date.now() + 1000
    while (Date.now() < deadline) {
      try {
        process.kill(-child.pid, 0)
      } catch {
        break
      }
      await new Promise<void>(done => setTimeout(done, 10))
    }
  }
  // Pipe closure can precede kernel reaping of an orphaned descendant by one turn.
  await new Promise<void>(done => setTimeout(done, 20))
}

const hasExited = (child: ChildProcess): boolean =>
  child.exitCode !== null || child.signalCode !== null

/** Hard stops kill the process group, including descendants of a leader that already exited. */
async function reap(child: ChildProcess, forced: boolean, diagnoseProcess = false): Promise<void> {
  if (!forced) {
    if (!diagnoseProcess) {
      if (!hasExited(child)) child.kill('SIGTERM')
      return
    }
    // Keep the natural exit status when possible. Even a successful terminal event
    // can carry an invalid result, so every workflow attempt needs group cleanup.
    await waitForExit(child)
  }
  // The engine leads its own process group (detached): descendants die with it, even after it exited.
  try {
    process.kill(-child.pid!, 'SIGKILL')
  } catch {
    if (!hasExited(child)) child.kill('SIGKILL')
  }
  child.stdout?.destroy()
  await awaitGroupExit(child)
}

type EngineChild = ChildProcessByStdio<null, Readable, Readable>

function preferError(previous: Error | undefined, current: Error): Error {
  return !previous || (previous as NodeJS.ErrnoException).code === 'EPIPE' ? current : previous
}

function transportFailure(childError: Error | undefined, pipeError: Error | undefined) {
  if (childError && (childError as NodeJS.ErrnoException).code !== 'EPIPE') return childError
  if (pipeError && (pipeError as NodeJS.ErrnoException).code !== 'EPIPE') return pipeError
  return pipeError ?? childError
}

function watchTransport(child: EngineChild, input: SpawnIterationInput) {
  let pipeError: Error | undefined
  let childError: Error | undefined
  let settled = false
  let fail!: () => void
  const failed = new Promise<undefined>(done => (fail = () => done(undefined)))
  const capture = (failure: unknown) => {
    const error = failure instanceof Error ? failure : new Error(String(failure))
    const code = (error as NodeJS.ErrnoException).code
    if (code === 'ABORT_ERR') return
    if (settled) {
      if (code !== 'EPIPE') console.error(error)
      return
    }
    pipeError = preferError(pipeError, error)
    fail()
  }
  child.on('error', error => {
    if (settled) {
      if ((error as NodeJS.ErrnoException).code !== 'EPIPE') console.error(error)
    } else {
      childError = preferError(childError, error)
      fail()
    }
  })
  // Ending the terminal-event reader cancels its iterator; Node reports ABORT_ERR on the pipe.
  child.stdout.on('error', capture)
  child.stderr.on('error', capture)
  const stderrTail: string[] = []
  const stderr = relayLines(
    child.stderr,
    input.engine.id,
    input.diagnoseProcess ? stderrTail : undefined,
  ).catch(capture)
  return {
    stderr,
    stderrTail,
    failed,
    capture,
    hasError: () => (pipeError ?? childError) !== undefined,
    finish: (): IterationResult | undefined => {
      settled = true
      const failure = transportFailure(childError, pipeError)
      if (!failure) return undefined
      const code = (failure as NodeJS.ErrnoException).code
      if (!input.diagnoseProcess && code !== 'EPIPE' && code !== 'ENOENT') throw failure
      return { outcome: 'failed', detail: `${input.engine.command}: ${failure.message}` }
    },
  }
}

async function readEngineResult(
  child: EngineChild,
  input: SpawnIterationInput,
  watchdog: ReturnType<typeof createWatchdog>,
  transport: ReturnType<typeof watchTransport>,
): Promise<IterationResult | undefined> {
  child.stdout.setEncoding('utf-8')
  // Codex can still be shutting down when it emits its terminal event.
  const stdout = input.engine.lastMessageArgs
    ? child.stdout.iterator({ destroyOnReturn: false })
    : child.stdout
  const read = readIterationOutcome(
    toLines(stdout),
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
  read.catch(() => undefined)
  return Promise.race([read, watchdog.grace, transport.failed])
}

function handleReadError(error: unknown, transport: ReturnType<typeof watchTransport>): void {
  if (!(error instanceof Error)) throw error
  const code = (error as NodeJS.ErrnoException).code
  if (code !== 'EPIPE' && !(code === 'ABORT_ERR' && transport.hasError())) throw error
  if (code === 'EPIPE') transport.capture(error)
}

async function waitForExit(child: ChildProcess, until?: Promise<unknown>): Promise<void> {
  // Pipe EOF can arrive before the child emits exit, even after a signal killed it.
  if (child.pid === undefined || hasExited(child)) return
  await new Promise<void>(resolve => {
    const done = () => {
      clearTimeout(timer)
      child.off('exit', done)
      resolve()
    }
    const timer = until === undefined ? setTimeout(done, 1000).unref() : undefined
    child.once('exit', done)
    void until?.then(done)
  })
}

function needsLastMessage(
  result: IterationResult | undefined,
  shouldFinalize: SpawnIterationInput['shouldFinalizeLastMessage'],
): result is IterationResult {
  return (
    result !== undefined &&
    (result.outcome === 'success' || result.cause === 'halted') &&
    shouldFinalize?.(result) === true
  )
}

interface IterationLifecycle {
  channel: ReturnType<typeof openLastMessageChannel>
  watchdog: ReturnType<typeof createWatchdog>
  transport: ReturnType<typeof watchTransport>
}

async function finalizeLastMessage(
  child: EngineChild,
  result: IterationResult,
  channel: NonNullable<ReturnType<typeof openLastMessageChannel>>,
  { watchdog, transport }: IterationLifecycle,
): Promise<IterationResult> {
  // Drain pending stdout while Codex finishes writing its file and exits.
  child.stdout.resume()
  await waitForExit(child, Promise.race([watchdog.grace, transport.failed]))
  if (watchdog.stopped() !== undefined || transport.hasError()) return result
  if (child.exitCode === 0) return channel.merge(result) ?? result
  const failure = {
    ...result,
    outcome: 'failed' as const,
    detail: 'last-message finalization did not exit cleanly',
  }
  delete failure.cause
  return failure
}

async function cleanUpIteration(
  child: EngineChild,
  { channel, watchdog, transport }: IterationLifecycle,
  diagnoseProcess: boolean | undefined,
): Promise<void> {
  watchdog.clear()
  if (channel) child.stdout.destroy()
  const forced = watchdog.stopped() !== undefined || transport.hasError()
  try {
    await reap(child, forced, diagnoseProcess)
  } finally {
    channel?.close()
  }
  // ponytail: 1s drain bound — a grandchild holding stderr open must not hold the iteration.
  await Promise.race([transport.stderr, new Promise(done => setTimeout(done, 1000).unref())])
}

async function diagnosedIteration(
  child: ChildProcess,
  result: IterationResult | undefined,
  {
    failure,
    stopped,
    started,
    stderrTail,
  }: {
    failure: IterationResult | undefined
    stopped: ProcessStop | undefined
    started: number
    stderrTail: readonly string[]
  },
): Promise<IterationResult> {
  await waitForExit(child)
  return {
    ...(stopped === undefined && failure ? failure : stalledOrResult(result, stopped?.detail)),
    process: {
      exitCode: child.exitCode,
      signal: child.signalCode,
      elapsedMs: Math.round(performance.now() - started),
      stderrTail: [...stderrTail],
      ...(stopped !== undefined && {
        stoppedBy: stopped.kind,
        timeoutSeconds: stopped.timeoutSeconds,
      }),
    },
  }
}

/**
 * Runs one iteration and returns what its STREAM said.
 *
 * The outcome comes from the terminal event alone (AC7); workflow launches also collect process
 * diagnostics. `stdin` is closed, so an engine that unexpectedly asks for input gets EOF instead
 * of hanging; the idle watchdog (re-armed by every decoded event, US-573) kills a child that goes
 * silent for any other reason, and the iteration then fails as `timed-out`.
 */
export async function spawnIteration(input: SpawnIterationInput): Promise<IterationResult> {
  const started = performance.now()
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
    detached: true,
    // US-573 AC7: an engine's own env (claude: no background-wait ceiling) over the driver's.
    ...engineEnv(input.engine, isolation),
  })
  const transport = watchTransport(child, input)
  // Tracked so a SIGTERM/SIGINT on the driver stops it instead of orphaning it (r1-2).
  trackEngine(child)

  const watchdog = createWatchdog(input, signal => child.kill(signal))
  const lifecycle = { channel, watchdog, transport }
  let result: IterationResult | undefined
  try {
    result = await readEngineResult(child, input, watchdog, transport)
    if (channel && needsLastMessage(result, input.shouldFinalizeLastMessage)) {
      result = await finalizeLastMessage(child, result, channel, lifecycle)
    }
  } catch (error) {
    handleReadError(error, transport)
  } finally {
    await cleanUpIteration(child, lifecycle, input.diagnoseProcess)
  }
  const stopped = watchdog.stopped()
  const failure = transport.finish()
  return input.diagnoseProcess
    ? diagnosedIteration(child, result, {
        failure,
        stopped,
        started,
        stderrTail: transport.stderrTail,
      })
    : (failure ?? stalledOrResult(result, stopped?.detail))
}

/** codex prints this on a non-TTY stdin even though stdin is closed (US-603): cosmetic noise. */
const CODEX_STDIN_NOISE = 'Reading additional input from stdin...'

export async function relayLines(
  stream: AsyncIterable<string | Uint8Array>,
  engineId?: string,
  stderrTail?: string[],
): Promise<void> {
  for await (const line of toLines(stream)) {
    if (stderrTail !== undefined) {
      if (stderrTail.length === 20) stderrTail.shift()
      stderrTail.push(line)
    }
    if (!line.trim() || (engineId === 'codex' && line.trim() === CODEX_STDIN_NOISE)) continue
    console.log(line)
  }
}
