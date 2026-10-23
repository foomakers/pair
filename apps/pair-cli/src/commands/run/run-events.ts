/**
 * The run-event model (US-573 T-2) — ONE typed source the console, the audit and `--json` consume.
 *
 * The workflows (`pair-loop.js`, `pair-implement-batch.js`) announce each event as one line
 * `PAIR_EVENT {json}` in their log. The driver does not know where an engine puts a workflow's log
 * (a tool result, an assistant message, a command's output), so the lines are looked for in every
 * string of a decoded stream event — engine-agnostic, bounded depth, exactly like the continue-token.
 * Stream content is untrusted: a body that does not validate is counted by the caller, never acted on.
 */

export const RUN_EVENT_NAMES = [
  'loop-start',
  'iteration',
  'card-start',
  'stage',
  'card-end',
  'loop-end',
] as const

export type RunEventName = (typeof RUN_EVENT_NAMES)[number]

export interface RunEvent {
  readonly event: RunEventName
  /** Card id as a string, verbatim — a Linear/Filesystem id renders unchanged. */
  readonly card?: string
  readonly title?: string
  /** `prepare` | `implement` | `review` | `fix N/max` | `merge`. */
  readonly stage?: string
  readonly pr?: number
  /** Terminal status on `card-end` / `loop-end` (`loop-end`: `completed` | `halted` | `interrupted`). */
  readonly status?: string
  readonly reason?: string
  readonly iteration?: number
  /** `loop-end`: eligible cards the run left undriven, when the workflow knows it. */
  readonly eligibleLeft?: number
  /** Every other field the line carried — kept for the audit, never interpreted. */
  readonly extra?: Readonly<Record<string, unknown>>
}

/** Set by the `--parallel` pool on each child `run --card`: the child then prints its stage events. */
export const RUN_EVENTS_ENV = 'PAIR_RUN_EVENTS'

/** The one-line wire form of an event — what the workflows print and a child process relays. */
export const runEventLine = (event: Readonly<Record<string, unknown>>): string =>
  `PAIR_EVENT ${JSON.stringify(event)}`

const MARKER = /^[ \t]*PAIR_EVENT[ \t]+(.+?)[ \t]*$/gm
const MAX_DEPTH = 6
const STRING_FIELDS = ['title', 'stage', 'status', 'reason'] as const
const KNOWN = new Set(['event', 'card', 'pr', 'iteration', 'eligibleLeft', ...STRING_FIELDS])

const isCount = (value: unknown): value is number => Number.isInteger(value) && Number(value) >= 0

/** One `PAIR_EVENT` body → a typed event, or `undefined` when it does not validate. */
function objectOf(body: string): Record<string, unknown> | undefined {
  let raw: unknown
  try {
    raw = JSON.parse(body)
  } catch {
    return undefined
  }
  return typeof raw === 'object' && raw !== null && !Array.isArray(raw)
    ? (raw as Record<string, unknown>)
    : undefined
}

export function parseRunEvent(body: string): RunEvent | undefined {
  const found = objectOf(body)
  if (found === undefined) return undefined
  if (!(RUN_EVENT_NAMES as readonly unknown[]).includes(found['event'])) return undefined
  const card = found['card']
  if (card !== undefined && typeof card !== 'string' && typeof card !== 'number') return undefined
  const extra = Object.fromEntries(Object.entries(found).filter(([key]) => !KNOWN.has(key)))
  return {
    event: found['event'] as RunEventName,
    ...(card !== undefined && { card: String(card) }),
    ...pick(found, STRING_FIELDS, value => typeof value === 'string'),
    ...pick(found, ['pr'], value => isCount(value) && value > 0),
    ...pick(found, ['iteration', 'eligibleLeft'], isCount),
    ...(Object.keys(extra).length > 0 && { extra }),
  }
}

/** The `keys` of `found` whose value passes `valid` — an invalid optional field is dropped, never coerced. */
function pick(
  found: Record<string, unknown>,
  keys: readonly string[],
  valid: (value: unknown) => boolean,
): Record<string, unknown> {
  return Object.fromEntries(keys.filter(key => valid(found[key])).map(key => [key, found[key]]))
}

/** Every `PAIR_EVENT` body carried by ONE decoded stream event, in order. */
export function eventBodies(payload: unknown, depth = 0): string[] {
  if (depth > MAX_DEPTH) return []
  if (typeof payload === 'string') return [...payload.matchAll(MARKER)].map(m => m[1]!)
  if (typeof payload === 'object' && payload !== null) {
    const values = Array.isArray(payload) ? payload : Object.values(payload)
    return values.flatMap(value => eventBodies(value, depth + 1))
  }
  return []
}
