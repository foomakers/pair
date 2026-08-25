import type { EngineDefinition, TerminalEventRule } from './engines'

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
  return !/<[^>]*>/.test(candidate) && !candidate.includes('[--')
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
  return {
    outcome: success ? 'success' : 'failed',
    detail:
      typeof detail === 'string'
        ? `terminal event: ${detail}`
        : `terminal event matched (${success ? 'success' : 'failure'})`,
  }
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
): Promise<IterationResult> {
  let continueToken: string | undefined

  for await (const line of lines) {
    const trimmed = line.trim()
    if (trimmed.length === 0) continue

    let payload: unknown
    try {
      payload = JSON.parse(trimmed)
    } catch {
      // Untrusted input: an unparseable line is skipped, never evaluated.
      continue
    }

    // Searched in the DECODED event, not in the raw JSONL line: the newlines the anchor needs are
    // `\n` escapes on the wire, so a raw-line match could not be anchored at all (finding 5).
    continueToken = findContinueToken(payload) ?? continueToken

    const rule = engine.terminalEvents.find(candidate => matches(payload, candidate.match))
    if (rule) {
      const result = outcomeFor(rule, payload)
      return { ...result, ...(continueToken !== undefined && { continueToken }) }
    }
  }

  return { ...NO_TERMINAL_EVENT, ...(continueToken !== undefined && { continueToken }) }
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
