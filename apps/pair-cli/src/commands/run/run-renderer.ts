import { format } from 'util'
import type { RunEvent } from './run-events'

/**
 * Console renderers for the run events (US-573 T-7).
 *
 * `cardLine` is pure over (card, columns, color, now) so it is tested without a terminal. The sink
 * picks one mode: a TTY with a known width gets one line per card rewritten in place (cards running
 * in parallel keep their own cursor-addressed row); anything else gets append-only timestamped
 * lines; `--json` writes the events as NDJSON (human text to stderr); `--quiet` prints only the
 * plain log lines the driver printed before live progress existed.
 */

export interface CardView {
  readonly id: string
  readonly title?: string | undefined
  readonly stage?: string | undefined
  readonly pr?: number | undefined
  /** Terminal status from `card-end`; present ⇒ the card is done. */
  readonly status?: string | undefined
  readonly reason?: string | undefined
  readonly startedAt: number
  readonly endedAt?: number | undefined
}

export interface LineOptions {
  readonly columns: number
  readonly color: boolean
  readonly now: number
  readonly frame?: number
}

const SPINNER = '⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏'
const DONE = new Set(['merged', 'completed'])
const PARKED = new Set(['awaiting-human', 'ready-for-merge', 'target-ready'])
const SEP = ' · '

const paint = (color: boolean, code: number, text: string) =>
  color ? `\x1b[${code}m${text}\x1b[39m` : text

/** A numeric id reads as an issue (`#573`); any other id (Linear, Filesystem) renders unchanged. */
export const displayId = (id: string): string => (/^\d+$/.test(id) ? `#${id}` : id)

function icon(card: CardView, color: boolean, frame: number): string {
  if (card.status === undefined) return paint(color, 36, SPINNER[frame % SPINNER.length]!)
  if (DONE.has(card.status)) return paint(color, 32, '✔')
  if (PARKED.has(card.status)) return paint(color, 33, '⏸')
  if (card.status === 'escalated') return paint(color, 33, '⚠')
  return paint(color, 31, '✖')
}

function elapsed(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  const pad = (n: number) => String(n).padStart(2, '0')
  if (s >= 3600) return `${Math.floor(s / 3600)}h${pad(Math.floor((s % 3600) / 60))}m`
  return `${pad(Math.floor(s / 60))}:${pad(s % 60)}`
}

function stateText(card: CardView): string | undefined {
  if (card.status === undefined) return card.stage
  const failed = !DONE.has(card.status) && !PARKED.has(card.status) && card.status !== 'escalated'
  return failed && card.reason ? `${card.status}: ${card.reason.slice(0, 60)}` : card.status
}

const visible = (text: string) => text.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '').length // eslint-disable-line no-control-regex

/** One card's line: icon · id · title · stage · PR · elapsed — the title shrinks first, then goes. */
export function cardLine(card: CardView, options: LineOptions): string {
  const head = `${icon(card, options.color, options.frame ?? 0)} ${displayId(card.id)}`
  const tail = [
    stateText(card),
    card.pr !== undefined ? `PR #${card.pr}` : undefined,
    elapsed((card.endedAt ?? options.now) - card.startedAt),
  ].filter((part): part is string => part !== undefined)
  const fixed = [head, ...tail].join(SEP)
  const room = options.columns - visible(fixed) - SEP.length
  if (card.title && room >= 2) {
    const title = card.title.length <= room ? card.title : `${card.title.slice(0, room - 1)}…`
    return [head, title, ...tail].join(SEP)
  }
  const plain = visible(fixed)
  return plain <= options.columns ? fixed : `${fixed.slice(0, options.columns - 1)}…`
}

/** Append-only line for a non-TTY: timestamp, event, then whatever the event carries. */
export function plainLine(event: RunEvent, ts: string, iteration?: number): string {
  const parts = [
    ts,
    event.event,
    event.card !== undefined ? displayId(event.card) : undefined,
    event.event === 'card-start' ? event.title : undefined,
    event.event === 'iteration' && iteration !== undefined ? String(iteration) : undefined,
    event.stage,
    event.status,
    event.pr !== undefined ? `PR #${event.pr}` : undefined,
  ].filter(Boolean)
  return parts.join(' ') + (event.reason ? ` — ${event.reason}` : '')
}

export interface Output {
  write(text: string): unknown
  readonly isTTY?: boolean
  readonly columns?: number | undefined
  on?(event: 'resize', listener: () => void): unknown
  off?(event: 'resize', listener: () => void): unknown
}

export type OutputMode = 'live' | 'quiet' | 'json'

export interface ConsoleSinkInput {
  readonly out: Output
  readonly err: Output
  readonly mode: OutputMode
  readonly color: boolean
  readonly now?: () => number
  /** Redraw elapsed times every second on a live TTY (off in tests). */
  readonly ticker?: boolean
}

export interface ConsoleSink {
  /** True when card lines are rewritten in place: any other console output must go through `log`. */
  readonly inPlace: boolean
  event(event: RunEvent, iteration?: number): void
  log(line: string): void
  /** Finalizes the live rows and restores the cursor; idempotent. */
  finish(): void
}

const isLiveTty = (out: Output) => out.isTTY === true && (out.columns ?? 0) > 0

export function createConsoleSink(input: ConsoleSinkInput): ConsoleSink {
  const now = input.now ?? Date.now
  const { out, err } = input
  if (input.mode === 'quiet')
    return {
      inPlace: false,
      event: () => {},
      log: line => void out.write(`${line}\n`),
      finish: () => {},
    }
  if (input.mode === 'json')
    return {
      inPlace: false,
      event: (event, iteration) =>
        void out.write(
          `${JSON.stringify({ ts: new Date(now()).toISOString(), ...(iteration !== undefined && { iteration }), ...event })}\n`,
        ),
      log: line => void err.write(`${line}\n`),
      finish: () => {},
    }
  if (!isLiveTty(out))
    return {
      inPlace: false,
      event: (event, iteration) =>
        void out.write(`${plainLine(event, new Date(now()).toISOString(), iteration)}\n`),
      log: line => void out.write(`${line}\n`),
      finish: () => {},
    }
  return liveTtySink(input, now)
}

/** Folds one card event into the card views: `card-start` (re)opens a card, `card-end` closes it. */
export function applyCardEvent(
  cards: Map<string, CardView>,
  event: RunEvent & { card: string },
  at: number,
): void {
  const card = cards.get(event.card) ?? { id: event.card, startedAt: at }
  const pr = event.pr !== undefined ? { pr: event.pr } : {}
  if (event.event === 'card-start')
    cards.set(event.card, { id: event.card, title: event.title ?? card.title, startedAt: at })
  else if (event.event === 'card-end')
    cards.set(event.card, {
      ...card,
      ...pr,
      status: event.status ?? 'failed',
      reason: event.reason,
      endedAt: at,
    })
  else
    cards.set(event.card, {
      ...card,
      ...pr,
      ...(event.stage !== undefined && { stage: event.stage }),
    })
}

/** The cursor-addressed block of card rows: redrawn in place, with log lines inserted above it. */
function rowBlock(input: ConsoleSinkInput, cards: Map<string, CardView>, now: () => number) {
  const { out } = input
  let drawn = 0
  let frame = 0
  let cursorHidden = false
  const render = () => {
    if (cards.size === 0) return
    const lines = [...cards.values()].map(card =>
      cardLine(card, { columns: out.columns ?? 80, color: input.color, now: now(), frame }),
    )
    out.write(
      `${cursorHidden ? '' : '\x1b[?25l'}${drawn > 0 ? `\x1b[${drawn}F` : ''}${lines.map(line => `\x1b[2K${line}`).join('\n')}\n`,
    )
    cursorHidden = true
    drawn = lines.length
  }
  return {
    render,
    tick: () => {
      frame++
      render()
    },
    above: (line: string) => {
      out.write(`${drawn > 0 ? `\x1b[${drawn}F\x1b[J` : ''}${line}\n`)
      drawn = 0
      render()
    },
    restoreCursor: () => {
      if (cursorHidden) out.write('\x1b[?25h')
    },
  }
}

function liveTtySink(input: ConsoleSinkInput, now: () => number): ConsoleSink {
  const { out } = input
  const cards = new Map<string, CardView>()
  const block = rowBlock(input, cards, now)
  let finished = false
  const ticker = input.ticker === false ? undefined : setInterval(block.tick, 1000)
  ticker?.unref()
  out.on?.('resize', block.render)
  // Once finished the rows are final: a later line is appended below them.
  const log = (line: string) => (finished ? void out.write(`${line}\n`) : block.above(line))

  return {
    inPlace: true,
    event: (event, iteration) => {
      if (finished) return
      if (event.card === undefined)
        return log(plainLine(event, new Date(now()).toISOString(), iteration))
      applyCardEvent(cards, { ...event, card: event.card }, now())
      block.render()
    },
    log,
    finish: () => {
      if (finished) return
      finished = true
      if (ticker) clearInterval(ticker)
      out.off?.('resize', block.render)
      block.render()
      block.restoreCursor()
    },
  }
}

/**
 * While card lines are drawn in place, every other `console.log` (a child's relayed line, a module's
 * notice) is routed through the sink so it lands ABOVE the rows instead of over them. Returns the restore.
 */
export function routeConsoleTo(sink: ConsoleSink): () => void {
  if (!sink.inPlace) return () => {}
  const log = console.log
  console.log = (...args: unknown[]) => sink.log(format(...args))
  return () => {
    console.log = log
  }
}
