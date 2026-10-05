import { isInterrupted, onInterrupt } from './interrupt'

/**
 * The `--watch` idle wait (US-522 T-2): resolves after `ms`, or at once when `interrupt.ts` has
 * seen SIGINT/SIGTERM — a Ctrl-C never waits out the interval, and no selection starts after it.
 * Every collaborator is injectable, so tests run on a fake clock with no real sleep.
 */

export type WaitOutcome = 'elapsed' | 'interrupted'

export type Wait = (ms: number) => Promise<WaitOutcome>

export interface WaitDeps {
  setTimer(callback: () => void, ms: number): unknown
  clearTimer(handle: unknown): void
  isInterrupted(): boolean
  /** Returns the unsubscribe. */
  onInterrupt(callback: () => void): () => void
}

const realDeps: WaitDeps = {
  setTimer: (callback, ms) => setTimeout(callback, ms),
  clearTimer: handle => clearTimeout(handle as NodeJS.Timeout),
  isInterrupted,
  onInterrupt,
}

export function createWait(deps: WaitDeps = realDeps): Wait {
  return ms =>
    new Promise<WaitOutcome>(resolve => {
      if (deps.isInterrupted()) return resolve('interrupted')
      let settled = false
      // Both are assigned below, before any callback can fire (timers and signals are async).
      const handle = deps.setTimer(() => settle('elapsed'), ms)
      const unsubscribe = deps.onInterrupt(() => settle('interrupted'))
      function settle(outcome: WaitOutcome): void {
        if (settled) return
        settled = true
        deps.clearTimer(handle)
        unsubscribe()
        resolve(outcome)
      }
    })
}

/** The shipped wait: a real timer, wired to the process's signal handling. */
export const wait: Wait = createWait()
