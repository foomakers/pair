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

/** `pair-loop`'s own degraded-path marker, borrowed verbatim — the driver invents no protocol. */
const CONTINUE_TOKEN_MARKER = /CONTINUE-TOKEN:\s*([^"\\\n\r]+)/

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

    const token = CONTINUE_TOKEN_MARKER.exec(trimmed)
    if (token?.[1]) continueToken = token[1].trim()

    let payload: unknown
    try {
      payload = JSON.parse(trimmed)
    } catch {
      // Untrusted input: an unparseable line is skipped, never evaluated.
      continue
    }

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
