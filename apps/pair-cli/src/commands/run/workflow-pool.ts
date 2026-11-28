export interface PoolInput<T, Outcome> {
  readonly items: readonly T[]
  readonly limit: number
  readonly worker: (item: T) => Promise<Outcome>
  readonly ready?: (item: T) => boolean
  /** Whether a NOT-yet-started item may still start (false once the driver was signalled). */
  readonly mayStart?: () => boolean
  /** Outcome of an item the pool never started (interrupted before its turn). */
  readonly notStarted: (item: T) => Outcome
  /** Outcome of a worker that threw — isolation: the pool never rejects on one card (AC4). */
  readonly onWorkerError: (item: T, error: unknown) => Outcome
}

/** At most `limit` workers in flight; results in input order; never rejects. */
function startPoolTask<T, Outcome>(
  input: PoolInput<T, Outcome>,
  index: number,
  state: {
    results: Outcome[]
    active: Map<number, Promise<void>>
  },
): void {
  const item = input.items[index]!
  const task = (async () => {
    try {
      state.results[index] = await Promise.resolve().then(() => input.worker(item))
    } catch (error) {
      state.results[index] = input.onWorkerError(item, error)
    } finally {
      state.active.delete(index)
    }
  })()
  state.active.set(index, task)
}

export async function runPool<T, Outcome>(input: PoolInput<T, Outcome>): Promise<Outcome[]> {
  const results: Outcome[] = new Array(input.items.length)
  const mayStart = input.mayStart ?? (() => true)
  const pending = input.items.map((_, index) => index)
  const active = new Map<number, Promise<void>>()
  const state = { results, active }
  const ready = (index: number) => {
    const item = input.items[index]!
    return input.ready?.(item) ?? true
  }
  for (;;) {
    if (!mayStart()) {
      for (const index of pending.splice(0)) results[index] = input.notStarted(input.items[index]!)
    }
    while (active.size < input.limit && pending.length > 0) {
      const position = pending.findIndex(ready)
      if (position < 0) break
      const [index] = pending.splice(position, 1)
      startPoolTask(input, index!, state)
    }
    if (active.size === 0) {
      for (const index of pending) results[index] = input.notStarted(input.items[index]!)
      break
    }
    await Promise.race(active.values())
  }
  return results
}
