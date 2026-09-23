import type { ChildProcess } from 'child_process'
import { constants } from 'os'

/**
 * SIGTERM/SIGINT on a `--card` run (US-487 review r1-2, AC9).
 *
 * A signal Node is not told to handle terminates the process at once, so no `finally` runs: the
 * card's lock stays behind (every later trigger skips `run-in-progress`), the `end` record is never
 * written, and the engine child — an unattended, permission-bypassing process — runs on with no
 * driver. SIGTERM is what a CI cancellation and `timeout` send, SIGINT is Ctrl-C; both can be
 * intercepted, so both are. SIGKILL and an OOM kill cannot, and stay the KB's documented stale-lock
 * case.
 *
 * Process-global by nature — a signal is delivered to the process, not to a call — so the state
 * here is too: the engine children currently running, and whether an interruption has begun.
 */

export type InterruptSignal = 'SIGTERM' | 'SIGINT'

const SIGNALS: readonly InterruptSignal[] = ['SIGTERM', 'SIGINT']

/** How long an engine gets to exit on SIGTERM before it is SIGKILLed. */
const ENGINE_GRACE_MS = 5_000

const running = new Set<ChildProcess>()
let interrupted = false

/** Registers a spawned engine child; it leaves the set on its own exit. */
export function trackEngine(child: ChildProcess): void {
  running.add(child)
  child.once('exit', () => running.delete(child))
}

/** True once a signal was received: no NEW engine may start after it. */
export function isInterrupted(): boolean {
  return interrupted
}

const exited = (child: ChildProcess): boolean =>
  child.exitCode !== null || child.signalCode !== null

/** SIGTERM every running engine, wait for them (bounded), SIGKILL whatever is still there. */
async function stopEngines(): Promise<void> {
  const children = [...running].filter(child => !exited(child))
  for (const child of children) child.kill('SIGTERM')
  const allExited = Promise.all(
    children.map(child =>
      exited(child) ? Promise.resolve() : new Promise(resolve => child.once('exit', resolve)),
    ),
  )
  await Promise.race([allExited, new Promise(resolve => setTimeout(resolve, ENGINE_GRACE_MS))])
  for (const child of children) if (!exited(child)) child.kill('SIGKILL')
}

/** The conventional exit code of a process ended by `signal`: 128 + its number (143, 130). */
export function signalExitCode(signal: InterruptSignal): number {
  return 128 + constants.signals[signal]
}

/** The part of `process` this module touches — injectable so the wiring is testable in-process. */
export interface InterruptHost {
  on(signal: InterruptSignal, listener: (signal: InterruptSignal) => void): unknown
  off(signal: InterruptSignal, listener: (signal: InterruptSignal) => void): unknown
  exit(code: number): never | void
}

/**
 * Runs `run` with SIGTERM/SIGINT trapped. On a signal: no new engine starts, the running engines
 * are stopped, `onInterrupt` writes what the run owes (its `end` record, the lock release), and the
 * process exits `128 + signal`. The interrupted `run` is never let to settle on its own — the
 * handler owns the ending, so the trail gets exactly one `end`.
 */
export async function whileInterruptible<T>(
  onInterrupt: (signal: InterruptSignal) => void,
  run: () => Promise<T>,
  host: InterruptHost = process,
): Promise<T> {
  let handling = false
  const listener = (signal: InterruptSignal): void => {
    if (handling) return
    handling = true
    interrupted = true
    void stopEngines()
      .then(() => onInterrupt(signal))
      .catch((error: unknown) => {
        console.error(
          `  Interrupted by ${signal}, and the cleanup failed: ${error instanceof Error ? error.message : String(error)}`,
        )
      })
      .finally(() => host.exit(signalExitCode(signal)))
  }
  for (const signal of SIGNALS) host.on(signal, listener)
  try {
    const result = await run().catch((error: unknown) => {
      if (interrupted) return NEVER as Promise<T>
      throw error
    })
    return interrupted ? await (NEVER as Promise<T>) : result
  } finally {
    for (const signal of SIGNALS) host.off(signal, listener)
  }
}

/** The run an interruption took over: it settles only by the handler's `exit`. */
const NEVER: Promise<never> = new Promise<never>(() => {})
