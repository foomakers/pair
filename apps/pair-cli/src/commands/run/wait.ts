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
      let handle: unknown
      let unsubscribe: () => void = () => undefined
      const settle = (outcome: WaitOutcome): void => {
        if (settled) return
        settled = true
        deps.clearTimer(handle)
        unsubscribe()
        resolve(outcome)
      }
      handle = deps.setTimer(() => settle('elapsed'), ms)
      unsubscribe = deps.onInterrupt(() => settle('interrupted'))
    })
}

/** The shipped wait: a real timer, wired to the process's signal handling. */
export const wait: Wait = createWait()
