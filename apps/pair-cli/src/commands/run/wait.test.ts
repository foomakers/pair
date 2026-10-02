import { describe, it, expect, vi } from 'vitest'
import { createWait, type WaitDeps } from './wait'

/** A fake clock: timers fire only when the test says so; no real time passes. */
function fakeHost(initiallyInterrupted = false) {
  const timers = new Map<number, { cb: () => void; ms: number }>()
  const listeners = new Set<() => void>()
  let next = 1
  let interrupted = initiallyInterrupted
  const deps: WaitDeps = {
    setTimer: (cb, ms) => {
      const id = next++
      timers.set(id, { cb, ms })
      return id
    },
    clearTimer: id => void timers.delete(id as number),
    isInterrupted: () => interrupted,
    onInterrupt: cb => {
      listeners.add(cb)
      return () => void listeners.delete(cb)
    },
  }
  return {
    deps,
    timers,
    listeners,
    fire: () => [...timers.values()].forEach(t => t.cb()),
    interrupt: () => {
      interrupted = true
      ;[...listeners].forEach(l => l())
    },
  }
}

describe('createWait', () => {
  it('resolves "elapsed" when the timer fires, and leaves nothing behind', async () => {
    const host = fakeHost()
    const p = createWait(host.deps)(600_000)
    expect([...host.timers.values()].map(t => t.ms)).toEqual([600_000])
    host.fire()
    await expect(p).resolves.toBe('elapsed')
    expect(host.listeners.size).toBe(0)
  })

  it('resolves "interrupted" at once when already interrupted, without arming a timer', async () => {
    const host = fakeHost(true)
    await expect(createWait(host.deps)(1_000)).resolves.toBe('interrupted')
    expect(host.timers.size).toBe(0)
    expect(host.listeners.size).toBe(0)
  })

  it('resolves "interrupted" during the wait and clears the timer', async () => {
    const host = fakeHost()
    const p = createWait(host.deps)(1_000)
    host.interrupt()
    await expect(p).resolves.toBe('interrupted')
    expect(host.timers.size).toBe(0)
    expect(host.listeners.size).toBe(0)
  })

  it('settles once: a late timer after an interruption changes nothing', async () => {
    const host = fakeHost()
    const cb = vi.fn()
    const p = createWait(host.deps)(1_000).then(cb)
    const fire = [...host.timers.values()][0]!.cb
    host.interrupt()
    fire()
    await p
    expect(cb).toHaveBeenCalledTimes(1)
    expect(cb).toHaveBeenCalledWith('interrupted')
  })
})

describe('interrupt.ts notification hook', () => {
  it('notifies subscribers on a signal, and unsubscribe stops it', async () => {
    vi.resetModules()
    const { onInterrupt, whileInterruptible } = await import('./interrupt.js')
    const handlers = new Map<string, (s: 'SIGINT') => void>()
    const host = {
      on: (s: string, l: (s: 'SIGINT') => void) => void handlers.set(s, l),
      off: () => undefined,
      exit: () => undefined,
    }
    const kept = vi.fn()
    const dropped = vi.fn()
    onInterrupt(kept)
    onInterrupt(dropped)()
    void whileInterruptible(
      () => undefined,
      () => new Promise<void>(() => {}),
      host as never,
    )
    handlers.get('SIGINT')!('SIGINT')
    expect(kept).toHaveBeenCalledTimes(1)
    expect(dropped).not.toHaveBeenCalled()
  })
})
