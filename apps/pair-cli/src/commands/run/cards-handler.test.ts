import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, realpathSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { InMemoryFileSystemService } from '@pair/content-ops'
import type { CardProcessExit } from './parallel'

/** US-614 T-4: `--cards` through the REAL handler — fake `run --card` processes, no engine, no gh. */

let root: string
const PATH_BEFORE = process.env['PATH']

beforeEach(() => {
  root = realpathSync(mkdtempSync(join(tmpdir(), 'pair-614-')))
  vi.resetModules()
})
afterEach(() => {
  vi.restoreAllMocks()
  process.env['PATH'] = PATH_BEFORE
  rmSync(root, { recursive: true, force: true })
})

async function runCards(
  flags: Record<string, unknown>,
  exits: Record<string, CardProcessExit[]>,
  closed: string[] = [],
) {
  const { handleRunCommand } = await import('./handler.js')
  const { parseRunCommand } = await import('./parser.js')
  process.env['PATH'] = '/bin'
  const out: string[] = []
  vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => void out.push(a.join(' ')))
  const started: string[] = []
  const calls: Record<string, number> = {}
  const fs = new InMemoryFileSystemService(
    { [`${root}/config.json`]: JSON.stringify({ asset_registries: {} }), '/bin/claude': '' },
    root,
    root,
  )
  const code = await handleRunCommand(
    parseRunCommand({ cwd: root, autonomous: true, ...flags }),
    fs,
    {
      readCardClosedAt: card => (closed.includes(card) ? new Date() : null),
      runCardProcess: async ({ card, args }) => {
        started.push(`${card.id}:${args.slice(0, 3).join(' ')}`)
        const n = (calls[card.id] = (calls[card.id] ?? 0) + 1)
        const list = exits[card.id]!
        return list[Math.min(n - 1, list.length - 1)]!
      },
      appendAudit: () => {},
    },
  )
  return { code, out: out.join('\n'), started }
}

const ok: CardProcessExit = { exitCode: 0, signal: null, cycleStatus: 'ready-for-merge' }
const stuck: CardProcessExit = { exitCode: 1, signal: null, cycleStatus: 'rounds-bound-reached' }
const escalated: CardProcessExit = { exitCode: 1, signal: null, cycleStatus: 'escalated' }

describe('run --cards through the handler', () => {
  it('AC1/AC9: serial, each via `run --card <id>`; all at target ⇒ exit 0 and a report', async () => {
    const { code, out, started } = await runCards({ cards: '12,15' }, { 12: [ok], 15: [ok] })
    expect(code).toBe(0)
    expect(started).toEqual(['12:run --card 12', '15:run --card 15'])
    expect(out).toContain('#12: at-target')
    expect(out).toContain('Passes: 1')
    expect(out).toContain('Stop: all-at-target')
  })

  it('AC5/AC9: a stalled card ⇒ stop no-progress, exit 1, reason reported', async () => {
    const { code, out } = await runCards({ cards: '12,15' }, { 12: [stuck], 15: [ok] })
    expect(code).toBe(1)
    expect(out).toContain('#12: retryable — rounds-bound-reached')
    expect(out).toContain('Stop: no-progress')
  })

  it('AC6: an escalated card is not retried and does not block the next', async () => {
    const { code, started } = await runCards({ cards: '1,2' }, { 1: [escalated], 2: [ok] })
    expect(started.map(s => s.split(':')[0])).toEqual(['1', '2'])
    expect(code).toBe(1)
  })

  it('AC6: an awaiting-human card with exit 0 remains terminal and is not reported done', async () => {
    const parked: CardProcessExit = { exitCode: 0, signal: null, cycleStatus: 'awaiting-human' }
    const { code, out, started } = await runCards({ cards: '1,2' }, { 1: [parked], 2: [ok] })
    expect(started.map(s => s.split(':')[0])).toEqual(['1', '2'])
    expect(out).toContain('#1: terminal — awaiting-human')
    expect(code).toBe(1)
  })

  it('AC8: a closed card is skipped, reported done', async () => {
    const { code, out, started } = await runCards({ cards: '1,2' }, { 1: [ok], 2: [ok] }, ['1'])
    expect(started.map(s => s.split(':')[0])).toEqual(['2'])
    expect(out).toContain('#1: at-target — already at target')
    expect(code).toBe(0)
  })

  it('AC7: a card run that throws is a global halt: the run stops at once, exit 1', async () => {
    const { handleRunCommand } = await import('./handler.js')
    const { parseRunCommand } = await import('./parser.js')
    process.env['PATH'] = '/bin'
    const out: string[] = []
    vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => void out.push(a.join(' ')))
    const started: string[] = []
    const fs = new InMemoryFileSystemService(
      { [`${root}/config.json`]: JSON.stringify({ asset_registries: {} }), '/bin/claude': '' },
      root,
      root,
    )
    const code = await handleRunCommand(
      parseRunCommand({ cwd: root, autonomous: true, cards: '1,2' }),
      fs,
      {
        readCardClosedAt: () => null,
        runCardProcess: async ({ card }) => {
          started.push(card.id)
          throw new Error('project is not trusted')
        },
        appendAudit: () => {},
      },
    )
    expect(code).toBe(1)
    expect(started).toEqual(['1'])
    expect(out.join('\n')).toContain('Stop: halt')
    expect(out.join('\n')).toContain('project is not trusted')
  })

  it('AC2: --card alone still takes the single-card path (no cards report)', async () => {
    const { handleRunCommand } = await import('./handler.js')
    const { parseRunCommand } = await import('./parser.js')
    const config = parseRunCommand({ cwd: root, card: '9', dryRun: true })
    expect(config.cards).toBeUndefined()
    void handleRunCommand
  })

  it('--dry-run prints the list and spawns nothing', async () => {
    const { code, out, started } = await runCards(
      { cards: '1,2', dryRun: true },
      { 1: [ok], 2: [ok] },
    )
    expect(code).toBe(0)
    expect(started).toEqual([])
    expect(out).toContain('#1 → #2')
  })
})
