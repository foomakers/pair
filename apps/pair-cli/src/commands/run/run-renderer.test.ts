import { describe, it, expect, afterEach } from 'vitest'
import { EventEmitter } from 'events'
import {
  cardLine,
  createConsoleSink,
  displayId,
  routeConsoleTo,
  type CardView,
} from './run-renderer'

/* eslint-disable no-control-regex */
const ANSI = /\x1b\[[0-9;?]*[A-Za-z]/g
const strip = (s: string) => s.replace(ANSI, '')

class FakeOut extends EventEmitter {
  chunks: string[] = []
  constructor(
    public isTTY: boolean,
    public columns: number | undefined,
  ) {
    super()
  }
  write(s: string) {
    this.chunks.push(s)
    return true
  }
  get text() {
    return this.chunks.join('')
  }
  /** What a terminal would show: the last frame's rows (after the last cursor-up + clear). */
  get screen() {
    return strip(this.text.split(/\x1b\[\d+F/).at(-1)!)
      .split('\n')
      .filter(Boolean)
  }
}

const T0 = 1_000_000
const running: CardView = {
  id: '573',
  title: 'pair run live progress',
  stage: 'implement',
  startedAt: T0,
}

describe('cardLine — pure over (card, columns, color, now)', () => {
  it('renders icon · id · title · stage · PR · elapsed', () => {
    const line = cardLine({ ...running, pr: 41 }, { columns: 120, color: false, now: T0 + 65_000 })
    expect(line).toBe('⠋ #573 · pair run live progress · implement · PR #41 · 01:05')
  })

  it('a terminal outcome replaces the spinner: ✔ merged, ⏸ awaiting-human, ⚠ escalated, ✖ failed + reason', () => {
    const at = { columns: 200, color: false, now: T0 }
    expect(cardLine({ ...running, status: 'merged', endedAt: T0 }, at)).toMatch(
      /^✔ #573 .* merged · 00:00$/,
    )
    expect(cardLine({ ...running, status: 'awaiting-human', endedAt: T0 }, at)).toMatch(
      /^⏸ .* awaiting-human/,
    )
    expect(cardLine({ ...running, status: 'escalated', endedAt: T0 }, at)).toMatch(
      /^⚠ .* escalated/,
    )
    expect(
      cardLine({ ...running, status: 'failed-implement', reason: 'gate red', endedAt: T0 }, at),
    ).toMatch(/^✖ .* failed-implement: gate red/)
  })

  it('truncates the title to the width, and drops it first when id + stage do not fit', () => {
    const narrow = cardLine(running, { columns: 40, color: false, now: T0 })
    expect(narrow.length).toBeLessThanOrEqual(40)
    expect(narrow).toContain('…')
    expect(narrow).toContain('implement')
    const tiny = cardLine(running, { columns: 26, color: false, now: T0 })
    expect(tiny).toBe('⠋ #573 · implement · 00:00')
  })

  it('non-numeric ids render unchanged; numeric ones get #', () => {
    expect(displayId('ENG-12')).toBe('ENG-12')
    expect(displayId('573')).toBe('#573')
  })

  it('colors only when asked', () => {
    expect(
      cardLine(
        { ...running, status: 'merged', endedAt: T0 },
        { columns: 80, color: true, now: T0 },
      ),
    ).toMatch(ANSI)
    expect(cardLine(running, { columns: 80, color: false, now: T0 })).not.toMatch(ANSI)
  })
})

describe('console sink — TTY: one line per card, rewritten in place (AC2)', () => {
  let sink: ReturnType<typeof createConsoleSink> | undefined
  afterEach(() => sink?.finish())

  it('rewrites the card line on each stage change instead of appending', () => {
    const out = new FakeOut(true, 100)
    sink = createConsoleSink({
      out,
      err: out,
      mode: 'live',
      color: false,
      now: () => T0,
      ticker: false,
    })
    sink.event({ event: 'card-start', card: '573', title: 'Live' })
    sink.event({ event: 'stage', card: '573', stage: 'implement' })
    sink.event({ event: 'stage', card: '573', stage: 'review', pr: 41 })
    expect(out.screen).toEqual(['⠋ #573 · Live · review · PR #41 · 00:00'])
  })

  it('--parallel: three cards keep three cursor-addressed rows, never interleaved', () => {
    const out = new FakeOut(true, 100)
    sink = createConsoleSink({
      out,
      err: out,
      mode: 'live',
      color: false,
      now: () => T0,
      ticker: false,
    })
    for (const id of ['1', 'ENG-2', '3'])
      sink.event({ event: 'card-start', card: id, title: `t${id}` })
    sink.event({ event: 'stage', card: 'ENG-2', stage: 'fix 1/3' })
    sink.event({ event: 'card-end', card: '1', status: 'merged' })
    expect(out.screen).toEqual([
      '✔ #1 · t1 · merged · 00:00',
      '⠋ ENG-2 · tENG-2 · fix 1/3 · 00:00',
      '⠋ #3 · t3 · 00:00',
    ])
  })

  it('a log line goes ABOVE the live rows, which are redrawn under it', () => {
    const out = new FakeOut(true, 100)
    sink = createConsoleSink({
      out,
      err: out,
      mode: 'live',
      color: false,
      now: () => T0,
      ticker: false,
    })
    sink.event({ event: 'card-start', card: '1', title: 'a' })
    sink.log('  Iteration 1 ended')
    expect(strip(out.text.split('\x1b[1F').at(-1)!)).toBe('  Iteration 1 ended\n⠋ #1 · a · 00:00\n')
  })

  it('re-reads the width on resize', () => {
    const out = new FakeOut(true, 100)
    sink = createConsoleSink({
      out,
      err: out,
      mode: 'live',
      color: false,
      now: () => T0,
      ticker: false,
    })
    sink.event({
      event: 'card-start',
      card: '573',
      title: 'a fairly long title that will need truncating',
    })
    out.columns = 30
    out.emit('resize')
    expect(out.screen[0]!.length).toBeLessThanOrEqual(30)
  })

  it('hides the cursor while live and restores it on finish (Ctrl+C included)', () => {
    const out = new FakeOut(true, 100)
    sink = createConsoleSink({
      out,
      err: out,
      mode: 'live',
      color: false,
      now: () => T0,
      ticker: false,
    })
    sink.event({ event: 'card-start', card: '1' })
    expect(out.text).toContain('\x1b[?25l')
    sink.finish()
    expect(out.text.endsWith('\x1b[?25h')).toBe(true)
  })
})

describe('console sink — other modes (AC3)', () => {
  it('non-TTY: append-only timestamped lines, one per event', () => {
    const out = new FakeOut(false, undefined)
    const sink = createConsoleSink({
      out,
      err: out,
      mode: 'live',
      color: false,
      now: () => Date.parse('2026-10-23T10:00:00Z'),
    })
    sink.event({ event: 'card-start', card: 'ENG-12', title: 'Linear' })
    sink.event({ event: 'stage', card: 'ENG-12', stage: 'review', pr: 4 })
    sink.finish()
    expect(out.text).toBe(
      '2026-10-23T10:00:00.000Z card-start ENG-12 Linear\n2026-10-23T10:00:00.000Z stage ENG-12 review PR #4\n',
    )
  })

  it('a TTY whose width is unknown falls back to line mode', () => {
    const out = new FakeOut(true, undefined)
    const sink = createConsoleSink({ out, err: out, mode: 'live', color: false, now: () => T0 })
    sink.event({ event: 'card-start', card: '1' })
    sink.finish()
    expect(out.text).not.toMatch(ANSI)
    expect(out.text).toMatch(/card-start #1\n$/)
  })

  it('--json: stdout carries only parseable NDJSON events; human text goes to stderr', () => {
    const out = new FakeOut(false, undefined)
    const err = new FakeOut(false, undefined)
    const sink = createConsoleSink({ out, err, mode: 'json', color: false, now: () => T0 })
    sink.log('  banner')
    sink.event({ event: 'card-end', card: '7', status: 'merged', pr: 9 }, 2)
    sink.finish()
    const events = out.text
      .trim()
      .split('\n')
      .map(l => JSON.parse(l))
    expect(events).toEqual([
      {
        ts: new Date(T0).toISOString(),
        iteration: 2,
        event: 'card-end',
        card: '7',
        status: 'merged',
        pr: 9,
      },
    ])
    expect(err.text).toBe('  banner\n')
  })

  it('--quiet: events print nothing, log lines print as today', () => {
    const out = new FakeOut(true, 100)
    const sink = createConsoleSink({ out, err: out, mode: 'quiet', color: false, now: () => T0 })
    sink.event({ event: 'card-start', card: '1' })
    sink.log('  Iteration 1: success — done')
    sink.finish()
    expect(out.text).toBe('  Iteration 1: success — done\n')
  })
})

describe('routeConsoleTo — other output lands above the live rows (AC2: no interleaving)', () => {
  it('routes console.log through the sink only while lines are drawn in place, and restores it', () => {
    const out = new FakeOut(true, 80)
    const sink = createConsoleSink({
      out,
      err: out,
      mode: 'live',
      color: false,
      now: () => T0,
      ticker: false,
    })
    const original = console.log
    const restore = routeConsoleTo(sink)
    sink.event({ event: 'card-start', card: '1', title: 'a' })
    console.log('  [#2] child line %d', 7)
    restore()
    sink.finish()
    expect(console.log).toBe(original)
    expect(strip(out.text)).toContain('  [#2] child line 7\n⠋ #1 · a · 00:00\n')
    const plain = createConsoleSink({
      out: new FakeOut(false, undefined),
      err: out,
      mode: 'live',
      color: false,
    })
    expect(routeConsoleTo(plain)).toBeInstanceOf(Function)
    expect(console.log).toBe(original)
  })
})
