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

/** The `PAIR_EVENT` bodies of ONE decoded stream event, one run per string that carries any, in order. */
export function eventBodyRuns(payload: unknown, depth = 0): string[][] {
  if (depth > MAX_DEPTH) return []
  if (typeof payload === 'string') {
    const bodies = [...payload.matchAll(MARKER)].map(m => m[1]!)
    return bodies.length > 0 ? [bodies] : []
  }
  if (typeof payload === 'object' && payload !== null) {
    const values = Array.isArray(payload) ? payload : Object.values(payload)
    return values.flatMap(value => eventBodyRuns(value, depth + 1))
  }
  return []
}

/** Every `PAIR_EVENT` body carried by ONE decoded stream event, in order. */
export const eventBodies = (payload: unknown): string[] => eventBodyRuns(payload).flat()

/**
 * r0-3 (recorded live, claude 2.x): a background Workflow's `log()` never reaches `claude -p`
 * stream-json, so its `PAIR_EVENT` lines are mute there. Its agents' labels do stream, live, in
 * `system/task_progress.workflow_progress` — `pair-implement-batch` names each stage agent
 * `<step>:#<card> …` (`implement:#573`, `verify:#573 r1`). Every progress event repeats the whole
 * list, so an agent is mapped once (keyed by `agentId`); a card's first agent opens it.
 */
const STAGE_OF_STEP: Readonly<Record<string, string>> = {
  prepare: 'prepare',
  validate: 'prepare',
  implement: 'implement',
  verify: 'review',
  green: 'fix',
  merge: 'merge',
}
const STAGE_LABEL = /^([a-z]+):#?([A-Za-z0-9._-]+)(?:\s|$)/

/** The `workflow_progress` list of a claude `task_progress` event, or `[]` for any other event. */
function progressEntries(payload: unknown): ReadonlyArray<Record<string, unknown> | null> {
  if (typeof payload !== 'object' || payload === null) return []
  const p = payload as Record<string, unknown>
  if (p['type'] !== 'system' || p['subtype'] !== 'task_progress') return []
  return Array.isArray(p['workflow_progress']) ? (p['workflow_progress'] as []) : []
}

/** An agent entry's `{ card, stage }` from its label, or `undefined` when the label names no stage. */
function stageOfAgent(
  entry: Record<string, unknown> | null,
): { card: string; stage: string } | undefined {
  if (entry?.['type'] !== 'workflow_agent' || typeof entry['label'] !== 'string') return undefined
  const match = STAGE_LABEL.exec(entry['label'])
  const stage = match ? STAGE_OF_STEP[match[1]!] : undefined
  return match && stage !== undefined ? { card: match[2]!, stage } : undefined
}

export function progressRunEvents(payload: unknown, seen: Set<string>): RunEvent[] {
  const events: RunEvent[] = []
  for (const entry of progressEntries(payload)) {
    const key = `agent:${String(entry?.['agentId'] ?? entry?.['index'])}`
    const found = stageOfAgent(entry)
    if (found === undefined || seen.has(key)) continue
    seen.add(key)
    if (!seen.has(`card:${found.card}`)) {
      seen.add(`card:${found.card}`)
      events.push({ event: 'card-start', card: found.card })
    }
    events.push({ event: 'stage', card: found.card, stage: found.stage })
  }
  return events
}
