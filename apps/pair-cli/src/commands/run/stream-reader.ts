import type { EngineDefinition, TerminalEventRule } from './engines'
import { eventBodyRuns, parseRunEvent, progressRunEvents, type RunEvent } from './run-events'

/**
 * The JSONL terminal-event reader (US-451 T-7) — the ONLY thing that decides an iteration's
 * outcome.
 *
 * The exit code is never consulted, anywhere: pi documents no exit-code contract, so an outcome
 * inferred from it would be noise. An explicit terminal event in the stream is the signal; its
 * ABSENCE is a FAILURE (AC7, BR6 — when in doubt, fail).
 *
 * The reader is engine-agnostic: which line is terminal, and what makes it a success, are
 * `TerminalEventRule`s in the engine map. Stream content is untrusted input — a malformed line
 * is skipped, never evaluated — and the stream is consumed line by line, never buffered whole.
 */

export type IterationOutcome = 'success' | 'failed'

/**
 * US-573 AC6: why a `failed` iteration failed, when the engine turn itself may have ended cleanly —
 * the workflow HALTed, the background workflow was cut before its `loop-end`, or the idle watchdog
 * stopped the engine. Each is a failure: `pair run` exits non-zero on all three.
 */
export type FailureCause = 'halted' | 'cut' | 'timed-out'

export interface IterationResult {
  readonly outcome: IterationOutcome
  /** Why, in one line — the terminal event's own detail, or the fail-closed reason. */
  readonly detail: string
  /**
   * The continue-token the skill printed, if any (ADR-017 §4 / `pair-loop`'s output format).
   *
   * The driver IS the caller that re-invokes on it. Its presence means "there is more to do";
   * its absence means the skill reported itself finished, which is a STOP, not a failure.
   */
  readonly continueToken?: string
  /**
   * US-506 T-8 (AC12): the iteration made no terminal progress within its time bound and was
   * stopped — a STALL, not a stream that ended on its own. The loop resumes it within the same
   * dead-dispatch budget; a process realization resumes fresh.
   */
  readonly stalled?: true
  /** The stage's final JSON result from the terminal event's text, when the engine exposes it and it carries one. */
  readonly final?: StageFinalResult
  /** US-573: set when the iteration failed for one of the truthful-outcome causes. */
  readonly cause?: FailureCause
  /** US-573: unparseable stream lines + malformed `PAIR_EVENT` bodies, skipped (present when > 0). */
  readonly skippedLines?: number
  /** US-573: run events the stream carried (present when > 0; absent ⇒ the engine degrades to start/end lines). */
  readonly runEvents?: number
}

/**
 * A stage's own final JSON result (`{ status, reason?, next? }`), kept from the terminal event's final
 * text so a deliberate `failed`/`blocked` is never mistaken for a dead dispatch. Relayed, never judged.
 */
export interface StageFinalResult {
  readonly status?: string
  readonly reason?: string
  readonly verdict?: string
  readonly next?: { readonly step?: string; readonly [key: string]: unknown } | undefined
}

function asFinal(value: unknown): StageFinalResult | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  const found = value as Record<string, unknown>
  if (typeof found['status'] !== 'string') return undefined
  const next =
    typeof found['next'] === 'object' && found['next'] !== null ? found['next'] : undefined
  return {
    status: found['status'],
    ...(typeof found['reason'] === 'string' && { reason: found['reason'] }),
    ...(typeof found['verdict'] === 'string' && { verdict: found['verdict'] }),
    ...(next !== undefined && { next: next as StageFinalResult['next'] }),
  }
}

/** Every TOP-LEVEL `{…}` span of a text (string-aware, so braces in strings and nested objects never count). */
function topLevelObjects(text: string): string[] {
  const spans: string[] = []
  const scan = { depth: 0, start: -1, inString: false, escaped: false }
  for (let i = 0; i < text.length; i++) {
    if (stepString(scan, text[i]!)) continue
    if (text[i] === '"' && scan.depth > 0) scan.inString = true
    else if (text[i] === '{') openBrace(scan, i)
    else if (text[i] === '}' && scan.depth > 0 && --scan.depth === 0) {
      spans.push(text.slice(scan.start, i + 1))
    }
  }
  return spans
}

interface Scan {
  depth: number
  start: number
  inString: boolean
  escaped: boolean
}

function openBrace(scan: Scan, at: number): void {
  if (scan.depth === 0) scan.start = at
  scan.depth++
}

/** Advances the in-string state; `true` when the character was consumed as string content. */
function stepString(scan: Scan, ch: string): boolean {
  if (!scan.inString) return false
  if (scan.escaped) scan.escaped = false
  else if (ch === '\\') scan.escaped = true
  else if (ch === '"') scan.inString = false
  return true
}

/** A stage's own result carries more than a bare `status` (a `cache-hit` echo does not). */
const RESULT_KEYS = ['verdict', 'reviewedHead', 'prNumber', 'next', 'reason']
const isResultShaped = (raw: Record<string, unknown>): boolean =>
  RESULT_KEYS.some(key => key in raw)

/**
 * The stage's final result: the LAST top-level JSON object with a string `status` that is result-shaped
 * (`verdict`, `reviewedHead`, `prNumber`, `next` or `reason`); failing that, the last one with a `status`.
 * Intermediate objects (a contract-phase `cache-hit`) and nested ones never win over the real result.
 */
export function parseFinalResult(text: string): StageFinalResult | undefined {
  let shaped: StageFinalResult | undefined
  let any: StageFinalResult | undefined
  for (const span of topLevelObjects(text)) {
    let raw: unknown
    try {
      raw = JSON.parse(span)
    } catch {
      continue
    }
    const found = asFinal(raw)
    if (found === undefined) continue
    any = found
    if (isResultShaped(raw as Record<string, unknown>)) shaped = found
  }
  return shaped ?? any
}

const NO_TERMINAL_EVENT: IterationResult = {
  outcome: 'failed',
  detail: 'no terminal event in the engine stream (fail-closed: the exit code is never consulted)',
}

/**
 * `pair-loop`'s own one-card-path marker, borrowed verbatim — the driver invents no protocol.
 *
 * ANCHORED to the start of its own line, and required to be a CONCRETE invocation (round 1,
 * finding 5). Two shapes must not be read as a token, and an unanchored substring match read both:
 *
 * - the **documented template**, `CONTINUE-TOKEN: pair-loop [--root <id>] … --iteration <n+1>`,
 *   which appears verbatim in the skill's own `SKILL.md` — any agent that reads, quotes or
 *   summarises that file echoes it into the stream. A spurious token there means the driver
 *   re-invokes a finished run until the perimeter cap;
 * - a **prose mention** mid-sentence ("it would print a CONTINUE-TOKEN: … line").
 *
 * Hence: line-anchored, the value must start with the skill name it re-invokes (`pair-`), and it
 * must carry no placeholder syntax (`<…>`, `[…]`) — a real token names real values.
 *
 * The value class deliberately admits `"` and `\`. An earlier version excluded both — a leftover
 * from when the match ran against the RAW JSONL line, where a quote really did mean "the JSON
 * string ended here". Since the match moved to the DECODED event that reasoning no longer holds,
 * and excluding them broke the very shape this story's own contract declares
 * (`--predicate "<text>"`): a token carrying a quoted multi-word predicate did not match at all,
 * so the loop read "no token", stopped after ONE card, and reported success — AC4 lost in silence
 * (round 2, Major). Only a real line break ends the value.
 */
const CONTINUE_TOKEN_MARKER = /^[ \t]*CONTINUE-TOKEN:[ \t]*(pair-\S+[^\n\r]*?)[ \t]*$/m

/**
 * A template, not a token: the documented form keeps its `<placeholders>` and `[--optional flags]`.
 *
 * Narrow on PURPOSE. An earlier version rejected any candidate containing `<`, `>`, `[` or `]`,
 * which is not "placeholder syntax" — it is a character class, and it swept up legitimate values:
 * a predicate spelled `tag:risk:red => Done` carries `>` and is not a template at all, so the
 * token was discarded and an unattended run stopped after ONE card reporting success (round 3,
 * Major — the same failure mode as round 2's, reached through a different input). The rule is now
 * the two shapes a real template actually has:
 *
 * - `<…>` — an angle-bracket placeholder (`<id>`, `<text>`, `<n+1>`);
 * - `[--` — an uncompiled optional flag (`[--root <id>]`).
 *
 * A concrete token has neither. Anything else about its content is the skill's business, not this
 * reader's: guessing at "looks unfinished" is what cost two rounds.
 */
function isConcreteToken(candidate: string): boolean {
  // QUOTE-AWARE (round 4, minor 2): a quoted argument is a VALUE, and a value may legitimately
  // contain angle brackets — `tag:a<b>` passes the policy's own content check, and tier 1 accepts
  // it. Placeholders live in the token's flag STRUCTURE, so the check runs on the token with its
  // quoted values removed; judging the value too discarded a real token and stopped the loop after
  // one card, the signature of the rounds-2 and -3 Majors.
  // One left-to-right pass, so a quote of one kind inside the other is just content. The skill
  // single-quotes every value and spells an embedded quote `'\\''` — close, escape, reopen — which
  // this alternation consumes as a quoted run, the bare `\\'` unit, then the next quoted run.
  const structure = candidate.replace(/\\'|'[^']*'|"(?:[^"\\]|\\.)*"/g, '""')
  return !/<[^>]*>/.test(structure) && !structure.includes('[--')
}

/** How deep into an event's structure the token is looked for — engines nest text a few levels. */
const MAX_EVENT_DEPTH = 6

/**
 * The continue-token carried by ONE decoded event, if any.
 *
 * Walks the event's string values (bounded depth, so a pathological payload cannot spin) and
 * applies the anchored marker to each. Returns the LAST match in the event: `pair-loop` prints the
 * token as the final line of its report, and a summary that quotes an earlier one must not win.
 */
function findContinueToken(payload: unknown, depth = 0): string | undefined {
  if (depth > MAX_EVENT_DEPTH) return undefined
  if (typeof payload === 'string') return tokenInText(payload)
  if (Array.isArray(payload)) return firstTokenIn(payload, depth)
  if (typeof payload === 'object' && payload !== null) {
    return firstTokenIn(Object.values(payload), depth)
  }
  return undefined
}

/**
 * The LAST concrete token in one string — INTENTIONAL, not an artefact of iteration order.
 *
 * `pair-loop` prints the token as the final line of its report, so within one event the last match
 * is the operative one: a run that quotes an earlier token (a summary, a retried attempt, a
 * recap of the previous iteration) must not have that stale value re-invoked. `firstTokenIn`
 * reverses collections for the same reason — later members of an event's `content` array are later
 * output. Both are "most recent wins", stated here so a future reader does not "simplify" it.
 */
function tokenInText(text: string): string | undefined {
  const matches = [...text.matchAll(new RegExp(CONTINUE_TOKEN_MARKER, 'gm'))].reverse()
  for (const match of matches) {
    const candidate = match[1]?.trim()
    if (candidate && isConcreteToken(candidate)) return candidate
  }
  return undefined
}

/** Same most-recent-wins order across a nested collection's members — see `tokenInText`. */
function firstTokenIn(values: readonly unknown[], depth: number): string | undefined {
  for (const value of [...values].reverse()) {
    const found = findContinueToken(value, depth + 1)
    if (found) return found
  }
  return undefined
}

function fieldAt(payload: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((current, segment) => {
    if (typeof current !== 'object' || current === null) return undefined
    return (current as Record<string, unknown>)[segment]
  }, payload)
}

function matches(payload: unknown, expected: Readonly<Record<string, unknown>>): boolean {
  return Object.entries(expected).every(([path, value]) => fieldAt(payload, path) === value)
}

function outcomeFor(rule: TerminalEventRule, payload: unknown): IterationResult {
  const success = rule.successWhen === undefined || matches(payload, rule.successWhen)
  const detail = rule.detailField ? fieldAt(payload, rule.detailField) : undefined
  const text = rule.resultField ? fieldAt(payload, rule.resultField) : undefined
  const final = typeof text === 'string' ? parseFinalResult(text) : undefined
  return {
    ...(final !== undefined && { final }),
    outcome: success ? 'success' : 'failed',
    detail:
      typeof detail === 'string'
        ? `terminal event: ${detail}`
        : `terminal event matched (${success ? 'success' : 'failure'})`,
  }
}

/** The workflow's own HALT message (`pair-loop: HALT — <reason>`) — the fallback when no `loop-end` reached the stream. */
const HALT_TEXT = /pair-loop: HALT — ([^\n]+)/

interface EventTally {
  count: number
  skipped: number
  loopStarted: boolean
  loopEnd?: RunEvent
  /** Bodies relayed so far, in stream order — the history a re-quote is matched against. */
  readonly seen: string[]
  /** Agents (and cards) already mapped from claude's `workflow_progress` (r0-3). */
  readonly progress: Set<string>
  /** Cards a `PAIR_EVENT` card-end already closed — never closed again at iteration end (r2-7). */
  readonly ended: Set<string>
  readonly maxFixRounds?: number
}

/** The longest k such that the first k bodies of `next` repeat the last k of `seen`. */
function overlap(seen: readonly string[], next: readonly string[]): number {
  for (let k = Math.min(seen.length, next.length); k > 0; k--) {
    if (next.slice(0, k).every((body, i) => body === seen[seen.length - k + i])) return k
  }
  return 0
}

/**
 * The bodies ONE decoded event adds to the run. A re-quote repeats what the stream just said (the
 * same line in two fields of one event, pi's `turn_end`/`agent_end`, the final result text), so the
 * part of the event that overlaps the tail of the history is dropped; a body that comes back after
 * something else happened (`review` after `fix 1/3`, a card-end in a later iteration) is new.
 * Within one string nothing is dropped: its lines are the workflow's own sequence.
 * ponytail: a body repeated back-to-back by the workflow itself reads as a re-quote; a per-line seq would fix it.
 */
function freshBodies(payload: unknown, seen: readonly string[]): string[] {
  const merged: string[] = []
  for (const run of eventBodyRuns(payload)) merged.push(...run.slice(overlap(merged, run)))
  return merged.slice(overlap(seen, merged))
}

/** Counts and relays the run events ONE decoded stream event carries; a malformed body is skipped and counted. */
function tallyRunEvents(
  payload: unknown,
  tally: EventTally,
  onRunEvent?: (event: RunEvent) => void,
): void {
  for (const body of freshBodies(payload, tally.seen)) {
    tally.seen.push(body)
    const event = parseRunEvent(body)
    if (event === undefined) {
      tally.skipped++
      continue
    }
    tally.count++
    if (event.event === 'loop-start') tally.loopStarted = true
    if (event.event === 'card-end' && event.card !== undefined) tally.ended.add(event.card)
    if (event.event === 'loop-end') tally.loopEnd = event
    onRunEvent?.(event)
  }
  for (const event of progressRunEvents(payload, tally.progress, tally.maxFixRounds)) {
    tally.count++
    onRunEvent?.(event)
  }
}

/** The card statuses a workflow return carries (`batch[]` of pair-implement-batch, `log[]` of pair-loop), last wins. */
function returnedStatuses(text: unknown): Map<string, string> {
  const statuses = new Map<string, string>()
  if (typeof text !== 'string') return statuses
  for (const span of topLevelObjects(text)) {
    let raw: unknown
    try {
      raw = JSON.parse(span)
    } catch {
      continue
    }
    const found = raw as Record<string, unknown>
    for (const entry of [found['batch'], found['log']].flatMap(v => (Array.isArray(v) ? v : []))) {
      const { id, status } = (entry ?? {}) as Record<string, unknown>
      if ((typeof id === 'string' || typeof id === 'number') && typeof status === 'string')
        statuses.set(String(id), status)
    }
  }
  return statuses
}

/**
 * r2-7: a card opened from claude's progress labels has no `PAIR_EVENT` to close it, so the iteration's
 * end does: with the status the workflow returned when readable, else the explicit `unknown` (the
 * workflow's own tally token) — never a done status it did not report.
 */
function closeProgressCards(
  tally: EventTally,
  finalText: unknown,
  onRunEvent?: (event: RunEvent) => void,
): void {
  const statuses = returnedStatuses(finalText)
  for (const key of tally.progress) {
    const card = key.startsWith('card:') ? key.slice(5) : undefined
    if (card === undefined || tally.ended.has(card)) continue
    tally.ended.add(card)
    tally.count++
    onRunEvent?.({ event: 'card-end', card, status: statuses.get(card) ?? 'unknown' })
  }
}

/** The counters the result carries (each only when non-zero) and the continue-token when one was seen. */
const extrasOf = (
  tally: EventTally,
  continueToken: string | undefined,
): Partial<IterationResult> => ({
  ...(tally.skipped > 0 && { skippedLines: tally.skipped }),
  ...(tally.count > 0 && { runEvents: tally.count }),
  ...(continueToken !== undefined && { continueToken }),
})

/**
 * US-573 AC6: the engine turn's `subtype` only says the TURN ended; the workflow's own terminal status
 * decides the iteration. A non-`completed` `loop-end`, or a HALT message in the final text, is
 * `halted`; a `loop-start` with no `loop-end` means the background workflow was cut.
 */
function truthful(result: IterationResult, tally: EventTally, finalText: unknown): IterationResult {
  if (result.outcome !== 'success') return result
  const end = tally.loopEnd
  if (end !== undefined && end.status !== 'completed')
    return {
      ...result,
      outcome: 'failed',
      cause: 'halted',
      detail: `${end.status ?? 'halted'}: ${end.reason ?? 'no reason given'}`,
    }
  if (end !== undefined) return result
  const halt = typeof finalText === 'string' ? HALT_TEXT.exec(finalText) : null
  if (halt)
    return { ...result, outcome: 'failed', cause: 'halted', detail: `halted: ${halt[1]!.trim()}` }
  if (tally.loopStarted)
    return {
      ...result,
      outcome: 'failed',
      cause: 'cut',
      detail:
        'cut: the engine turn ended before the workflow reported its loop-end (background workflow stopped)',
    }
  return result
}

const newTally = (maxFixRounds: number | undefined): EventTally => ({
  count: 0,
  skipped: 0,
  loopStarted: false,
  seen: [],
  progress: new Set(),
  ended: new Set(),
  ...(maxFixRounds !== undefined && { maxFixRounds }),
})

/** One stream line decoded, or `undefined` (blank, or unparseable — untrusted input, skipped and counted). */
function decode(line: string, tally: EventTally): unknown {
  const trimmed = line.trim()
  if (trimmed.length === 0) return undefined
  try {
    return JSON.parse(trimmed)
  } catch {
    tally.skipped++
    return undefined
  }
}

/** The iteration's outcome from its terminal event; progress-opened cards are closed first (r2-7). */
function terminalResult(
  rule: TerminalEventRule,
  payload: unknown,
  tally: EventTally,
  onRunEvent: ((event: RunEvent) => void) | undefined,
): IterationResult {
  const finalText = rule.resultField ? fieldAt(payload, rule.resultField) : undefined
  closeProgressCards(tally, finalText, onRunEvent)
  return truthful(outcomeFor(rule, payload), tally, finalText)
}

/**
 * Reads the engine's JSONL stream and returns exactly ONE outcome for the iteration.
 *
 * The first line matching a terminal rule decides it; later lines are not read. A continue-token
 * seen before that point is carried into the result, because `pair-loop`'s degraded path prints
 * it just before finishing.
 */
export async function readIterationOutcome(
  lines: AsyncIterable<string>,
  engine: EngineDefinition,
  /**
   * US-491: sees every decoded event (terminal included) — how a caller reads a marker line.
   * A DEFAULTED parameter, so the reader's arity stays 2: no exit-code slot exists (AC7 test).
   */
  onEvent: ((payload: unknown) => void) | undefined = undefined,
  /**
   * US-573: `onRunEvent` sees every run event once, in stream order; r2-6: `options.maxFixRounds` is the
   * run's budget a claude progress `fix n/<max>` renders (`?` when absent). A rest tuple, so the
   * arity stays 2.
   */
  ...observers: [
    onRunEvent?: ((event: RunEvent) => void) | undefined,
    options?: { readonly maxFixRounds?: number | undefined },
  ]
): Promise<IterationResult> {
  const [onRunEvent, options = {}] = observers
  let continueToken: string | undefined
  const tally = newTally(options.maxFixRounds)

  for await (const line of lines) {
    const payload = decode(line, tally)
    if (payload === undefined) continue
    tallyRunEvents(payload, tally, onRunEvent)

    // Searched in the DECODED event, not in the raw JSONL line: the newlines the anchor needs are
    // `\n` escapes on the wire, so a raw-line match could not be anchored at all (finding 5).
    continueToken = findContinueToken(payload) ?? continueToken
    onEvent?.(payload)

    const rule = engine.terminalEvents.find(candidate => matches(payload, candidate.match))
    if (rule)
      return {
        ...terminalResult(rule, payload, tally, onRunEvent),
        ...extrasOf(tally, continueToken),
      }
  }

  closeProgressCards(tally, undefined, onRunEvent)
  return { ...NO_TERMINAL_EVENT, ...extrasOf(tally, continueToken) }
}
/**
 * Splits a byte stream into lines, incrementally — the whole stream is never held in memory.
 *
 * A trailing partial line (a truncated stream: the engine was killed mid-write) is yielded as
 * it stands, so it can be parsed if it happens to be complete JSON and skipped if not; either
 * way the fail-closed default applies when no terminal event was seen.
 */
export async function* toLines(chunks: AsyncIterable<string | Uint8Array>): AsyncGenerator<string> {
  let buffer = ''
  for await (const chunk of chunks) {
    buffer += typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf-8')
    const parts = buffer.split(/\r?\n/)
    buffer = parts.pop() ?? ''
    for (const part of parts) yield part
  }
  if (buffer.length > 0) yield buffer
}
