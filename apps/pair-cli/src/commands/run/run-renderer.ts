import { format } from 'util'
import type { RunEvent } from './run-events'
import { plainNote } from './plain-console'
import { pooledCard } from './pooled-card'

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
  /** Plain-words context of the current stage; replaced by the next stage event, never carried over. */
  readonly detail?: string | undefined
  readonly pr?: number | undefined
  /** Terminal status from `card-end`; present ⇒ the card is done. */
  readonly status?: string | undefined
  readonly reason?: string | undefined
  /** Plain mode: the card's latest note (a review verdict, a recovery, an escalation), shown on its own row. */
  readonly note?: string | undefined
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
/** `card-end` status of a preparation run whose card goes on into the delivery cycle (one row per card). */
export const PREPARED = 'prepared'
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
  if (card.status === 'unknown') return paint(color, 90, '?')
  return paint(color, 31, '✖')
}

function elapsed(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  const pad = (n: number) => String(n).padStart(2, '0')
  if (s >= 3600) return `${Math.floor(s / 3600)}h${pad(Math.floor((s % 3600) / 60))}m`
  return `${pad(Math.floor(s / 60))}:${pad(s % 60)}`
}

function stateText(card: CardView): string | undefined {
  if (card.status === undefined) return card.detail ?? card.stage
  const failed =
    !DONE.has(card.status) &&
    !PARKED.has(card.status) &&
    card.status !== 'escalated' &&
    card.status !== 'unknown'
  return failed && card.reason ? `${card.status}: ${card.reason.slice(0, 60)}` : card.status
}

/** An ANSI CSI sequence (built from the ESC code so no control character sits in a regex literal). */
export const ANSI_SEQUENCE = new RegExp(`${String.fromCharCode(27)}\\[[0-9;?]*[A-Za-z]`, 'g')
const visible = (text: string) => text.replace(ANSI_SEQUENCE, '').length

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
  readonly rows?: number | undefined
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
  /** Live TTY only: hide the driver's technical lines, show short plain notes (off under `--verbose`). */
  readonly plain?: boolean
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
  // A card the loop drives in-process never draws its own block: the loop owns the terminal.
  const pooled = pooledCard()
  if (pooled !== undefined)
    return {
      inPlace: false,
      event: event => {
        if (event.event !== 'card-start') pooled.onEvent?.(event)
      },
      log: line => console.log(line),
      finish: () => {},
    }
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
      ...(event.stage !== undefined && { stage: event.stage, detail: event.detail }),
    })
}

/**
 * The cursor-addressed block of card rows, one per card for the whole run: redrawn in place, at most `rows - 1`
 * tall (read on every draw, so a resize applies); log lines and, past the cap, the oldest finished cards are inserted above it (AC2b).
 * ponytail: running cards past the cap are not shown until a row frees up; a "+N more" row if it matters.
 */
/** A finished card keeps its row (a re-driven card reuses it); past `cap` the oldest finished ones leave the block. */
function scrollFinished(cards: Map<string, CardView>, cap: number): CardView[] {
  const gone: CardView[] = []
  for (const card of [...cards.values()]) {
    if (cards.size <= cap) break
    if (card.endedAt === undefined) continue
    cards.delete(card.id)
    gone.push(card)
  }
  return gone
}

function rowBlock(input: ConsoleSinkInput, cards: Map<string, CardView>, now: () => number) {
  const { out } = input
  let drawn = 0
  let frame = 0
  let cursorHidden = false
  /** The loop's one status line (its latest iteration), redrawn under the card rows instead of appended. */
  let status: string | undefined
  const lineOf = (card: CardView) =>
    cardLine(card, { columns: out.columns ?? 80, color: input.color, now: now(), frame })
  /** Moves the cursor back over the drawn block and clears it. */
  const up = () => (drawn > 0 ? `\x1b[${drawn}F\x1b[J` : '')
  const render = () => {
    const cap = Math.max(1, (out.rows ?? Infinity) - 1 - (status === undefined ? 0 : 1))
    const gone = scrollFinished(cards, cap).map(lineOf)
    if (gone.length > 0) {
      out.write(`${up()}${gone.map(l => `${l}\n`).join('')}`)
      drawn = 0
    }
    const lines = [...cards.values()].slice(0, cap).map(lineOf)
    if (status !== undefined) lines.push(status.slice(0, (out.columns ?? 80) - 1))
    if (lines.length === 0 && drawn === 0) return
    // Auto-wrap off while drawing (DECAWM): a row wider than the terminal (an ambiguous-width glyph counted as
    // two columns) is clipped, never wrapped — a wrap would add a screen line the next redraw does not erase.
    out.write(
      `${cursorHidden ? '' : '\x1b[?25l'}${up()}\x1b[?7l${lines.map(line => `\x1b[2K${line}\n`).join('')}\x1b[?7h`,
    )
    cursorHidden = true
    drawn = lines.length
  }
  const above = (line: string) => {
    out.write(`${up()}${line}\n`)
    drawn = 0
    render()
  }
  return {
    render,
    tick: () => {
      frame++
      render()
    },
    above,
    status: (line: string) => {
      status = line
      render()
    },
    restoreCursor: () => {
      if (cursorHidden) out.write('\x1b[?25h')
    },
  }
}

/** The loop's per-iteration line: on a plain live terminal it replaces the previous one. */
const LOOP_STATUS = /^ {2}(Iteration \d+\/\S+:|Waiting for new cards|Checking for cards)/
/** A card's plain note (`  #577 review: approved`): on a plain live terminal it becomes the card row's detail. */
const CARD_NOTE = /^ {2}#(\S+) (.+)$/
const NOTE_CHARS = 60

/** Plain mode: the loop's iteration and a running card's note land on their rows, never as new lines. */
function onRow(
  shown: string,
  cards: Map<string, CardView>,
  block: { status(line: string): void; render(): void },
): boolean {
  if (LOOP_STATUS.test(shown)) {
    block.status(shown)
    return true
  }
  const note = CARD_NOTE.exec(shown)
  const card = note ? cards.get(note[1]!) : undefined
  if (card === undefined) return false
  const raw = note![2]!
  const text = raw.length > NOTE_CHARS ? `${raw.slice(0, NOTE_CHARS - 1)}…` : raw
  cards.set(card.id, { ...card, detail: text, note: text })
  block.render()
  return true
}

/** A card ended on a bare exit code is explained by its last note (the escalation, the stop reason). */
function explainExit(cards: Map<string, CardView>, id: string): void {
  const ended = cards.get(id)
  if (ended?.note && /^exit \d+$/.test(ended.reason ?? ''))
    cards.set(id, { ...ended, reason: ended.note })
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
  const raw = (line: string) => (finished ? void out.write(`${line}\n`) : block.above(line))
  const log = (line: string) => {
    const shown = input.plain === true ? plainNote(line) : line
    if (shown === undefined) return
    if (input.plain === true && !finished && onRow(shown, cards, block)) return
    raw(shown)
  }

  return {
    inPlace: true,
    event: (event, iteration) => {
      if (finished) return
      if (event.card === undefined)
        return input.plain === true
          ? undefined
          : log(plainLine(event, new Date(now()).toISOString(), iteration))
      applyCardEvent(cards, { ...event, card: event.card }, now())
      if (event.event === 'card-end') explainExit(cards, event.card)
      // A prepared card continues in the delivery cycle's own line: its row is dropped, not settled.
      if (event.event === 'card-end' && event.status === PREPARED) cards.delete(event.card)
      // One row per card for the whole run: an ended card keeps its row (final state); a re-driven card reuses it.
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
  const { log, error, warn } = console
  // Every console write lands above the rows: a line written beside them would shift the block the next redraw erases.
  console.log = console.error = console.warn = (...args: unknown[]) => sink.log(format(...args))
  return () => {
    console.log = log
    console.error = error
    console.warn = warn
  }
}
