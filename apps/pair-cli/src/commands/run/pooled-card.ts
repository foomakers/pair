import { AsyncLocalStorage } from 'async_hooks'
import { format } from 'util'
import type { RunEvent } from './run-events'

/**
 * A card the loop drives inside its own process — no `pair-cli run --card` child: the card's console
 * lines go to `onLine` (the loop prefixes and filters them), its live events to `onEvent`.
 * Concurrent cards each see their own store (AsyncLocalStorage), so lines never cross cards.
 */
export interface PooledCard {
  readonly onLine: (line: string, print: (line: string) => void) => void
  readonly onEvent?: ((event: RunEvent) => void) | undefined
}

const store = new AsyncLocalStorage<PooledCard>()

export const pooledCard = (): PooledCard | undefined => store.getStore()

let depth = 0
let outer: Pick<Console, 'log' | 'error' | 'warn'> = console

export async function inPooledCard<T>(card: PooledCard, run: () => Promise<T>): Promise<T> {
  if (depth === 0) {
    outer = { log: console.log, error: console.error, warn: console.warn }
    const print = outer.log
    // stderr too: a card's every console line goes to the loop (prefixed, filtered), never beside its rows.
    const relay =
      (own: (...args: unknown[]) => void) =>
      (...args: unknown[]) => {
        const current = store.getStore()
        if (current === undefined) own(...args)
        else current.onLine(format(...args), line => print(line))
      }
    console.log = relay(outer.log)
    console.error = relay(outer.error)
    console.warn = relay(outer.warn)
  }
  depth += 1
  try {
    return await store.run(card, run)
  } finally {
    depth -= 1
    if (depth === 0) Object.assign(console, outer)
  }
}
