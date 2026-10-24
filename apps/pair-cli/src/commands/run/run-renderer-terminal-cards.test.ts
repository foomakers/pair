import { describe, it, expect } from 'vitest'
import { EventEmitter } from 'events'
import { createConsoleSink, ANSI_SEQUENCE } from './run-renderer'

const CLEAR_LINE = '\x1b[2K'

class FakeTty extends EventEmitter {
  readonly isTTY = true
  chunks: string[] = []
  constructor(
    public columns: number,
    public rows: number,
  ) {
    super()
  }
  write(s: string) {
    this.chunks.push(s)
    return true
  }
  get plain() {
    return this.chunks.join('').replace(ANSI_SEQUENCE, '')
  }
  /** Rows (re)drawn by the most recent write. */
  get lastRedrawRows() {
    return this.chunks.at(-1)!.split(CLEAR_LINE).length - 1
  }
  /** Rows (re)drawn across EVERY write `action` makes — the whole redraw frame, however chunked. */
  rowsDrawnBy(action: () => void) {
    const from = this.chunks.length
    action()
    return this.chunks.slice(from).join('').split(CLEAR_LINE).length - 1
  }
}

function sinkOn(out: FakeTty) {
  return createConsoleSink({
    out,
    err: out,
    mode: 'live',
    color: false,
    now: () => 0,
    ticker: false,
  })
}

/** Every terminal class the producer recognises, with the icon its final line carries. */
const TERMINAL = [
  ['merged', '✔'],
  ['awaiting-human', '⏸'],
  ['escalated', '⚠'],
  ['failed', '✖'],
] as const

const occurrences = (text: string, needle: string) => text.split(needle).length - 1

describe('r0-2 (AC2b): one row per card; past the terminal height the oldest finished cards scroll away', () => {
  it.each(TERMINAL)(
    'W-r0-2a [%s]: after 10 finished cards, a stage event redraws at most rows - 1 rows',
    status => {
      const out = new FakeTty(80, 5)
      const sink = sinkOn(out)
      for (let i = 1; i <= 10; i++) {
        sink.event({ event: 'card-start', card: String(i), title: `t${i}` })
        sink.event({ event: 'card-end', card: String(i), status })
      }
      sink.event({ event: 'card-start', card: '11', title: 't11' })
      sink.event({ event: 'stage', card: '11', stage: 'implement' })
      expect(out.lastRedrawRows).toBeLessThanOrEqual(4)
      expect(out.chunks.at(-1)).toContain('t11')
      sink.finish()
    },
  )

  it.each(TERMINAL)(
    'W-r0-2b [%s]: each finished card ends exactly once — scrolled away above, or on its row in the last frame',
    (status, icon) => {
      const out = new FakeTty(80, 5)
      const sink = sinkOn(out)
      for (let i = 1; i <= 10; i++) {
        sink.event({ event: 'card-start', card: String(i), title: `t${i}` })
        sink.event({ event: 'card-end', card: String(i), status })
      }
      sink.event({ event: 'card-start', card: '11', title: 't11' })
      sink.event({ event: 'stage', card: '11', stage: 'implement' })
      sink.finish()
      const frames = out.chunks.filter(c => c.includes(CLEAR_LINE))
      const last = frames.at(-1)!.replace(ANSI_SEQUENCE, '')
      const above = out.chunks
        .filter(c => !c.includes(CLEAR_LINE))
        .join('')
        .replace(ANSI_SEQUENCE, '')
      for (let i = 1; i <= 10; i++) {
        const line = `${icon} #${i} · t${i} ·`
        expect(occurrences(above, line) + occurrences(last, line)).toBe(1)
      }
    },
  )

  const platformCases = ['darwin', 'linux'] as const
  it.each(platformCases)(
    'W-r0-2e: a re-driven card reuses its own row, never a second one (platform %s)',
    platform => {
      const original = Object.getOwnPropertyDescriptor(process, 'platform')!
      Object.defineProperty(process, 'platform', { value: platform })
      try {
        const out = new FakeTty(80, 10)
        const sink = sinkOn(out)
        sink.event({ event: 'card-start', card: '577', title: 'Linear' })
        sink.event({ event: 'card-end', card: '577', status: 'failed' })
        sink.event({ event: 'card-start', card: '577', title: 'Linear' })
        sink.event({ event: 'stage', card: '577', stage: 'fix 2/10' })
        const last = out.chunks.at(-1)!.replace(ANSI_SEQUENCE, '')
        expect(occurrences(last, '#577 ·')).toBe(1)
        expect(out.chunks.filter(c => !c.includes(CLEAR_LINE)).join('')).not.toContain('#577')
        sink.finish()
      } finally {
        Object.defineProperty(process, 'platform', original)
      }
    },
  )

  it('W-r0-2c: the block never redraws more than rows - 1 rows', () => {
    const out = new FakeTty(80, 5)
    const sink = sinkOn(out)
    for (let i = 1; i <= 8; i++)
      sink.event({ event: 'card-start', card: String(i), title: `t${i}` })
    const rows = out.rowsDrawnBy(() => sink.event({ event: 'stage', card: '8', stage: 'review' }))
    expect(rows).toBeLessThanOrEqual(4)
    sink.finish()
  })

  it('W-r0-2d: after a resize that shrinks the terminal, the cap follows the new rows - 1', () => {
    const out = new FakeTty(80, 10)
    const sink = sinkOn(out)
    for (let i = 1; i <= 8; i++)
      sink.event({ event: 'card-start', card: String(i), title: `t${i}` })
    out.rows = 5
    out.emit('resize')
    const rows = out.rowsDrawnBy(() => sink.event({ event: 'stage', card: '8', stage: 'review' }))
    expect(rows).toBeLessThanOrEqual(4)
    sink.finish()
  })

  it('C-r0-2a: a running card stays live and is redrawn on its stage change', () => {
    const out = new FakeTty(80, 5)
    const sink = sinkOn(out)
    sink.event({ event: 'card-start', card: '1', title: 'a' })
    sink.event({ event: 'card-start', card: '2', title: 'b' })
    sink.event({ event: 'stage', card: '2', stage: 'review' })
    expect(out.chunks.at(-1)!.replace(ANSI_SEQUENCE, '')).toContain('#2 · b · review')
    sink.finish()
  })
})
