import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'fs'
import { tmpdir, hostname } from 'os'
import { join } from 'path'
import { createCardLockAcquirer, LOCK_DIRECTORY } from './card-lock'
import { probeCardLock } from './lock-probe'
import { livenessOf } from './lock-holder'
import { runWatchLoop } from './watch-loop'
import { renderIterationLine } from './loop-report'

let area: string
beforeEach(() => {
  area = mkdtempSync(join(tmpdir(), 'pair-lock-stale-'))
})
afterEach(() => rmSync(area, { recursive: true, force: true }))

const DEAD = 2_147_483_000 // no such pid
const holderDir = (id: string) => join(area, LOCK_DIRECTORY, id)
function plant(id: string, holder: Record<string, unknown>) {
  mkdirSync(holderDir(id), { recursive: true })
  writeFileSync(join(holderDir(id), 'holder.json'), JSON.stringify({ card: id, ...holder }))
}

describe('L: stale locks (holder pid dead on this host)', () => {
  it('livenessOf: dead pid, live pid, foreign host, no pid', () => {
    plant('a', { pid: DEAD })
    expect(livenessOf(holderDir('a'))).toMatchObject({ state: 'dead', pid: DEAD })
    plant('b', { pid: process.pid })
    expect(livenessOf(holderDir('b'))).toMatchObject({ state: 'alive', pid: process.pid })
    plant('c', { pid: DEAD, host: 'some-other-host' })
    expect(livenessOf(holderDir('c')).state).toBe('unknown')
    plant('d', { pid: DEAD, host: hostname() })
    expect(livenessOf(holderDir('d')).state).toBe('dead')
    plant('e', {})
    expect(livenessOf(holderDir('e')).state).toBe('unknown')
  })

  it('a dead-pid lock is reclaimed on acquire (the card runs) and reported', () => {
    plant('353', { pid: DEAD, acquiredAt: 'T0' })
    const out = createCardLockAcquirer()({ workingArea: area, card: '353' })
    expect(out.kind).toBe('acquired')
    if (out.kind !== 'acquired') return
    expect(out.reclaimed).toEqual({ pid: DEAD })
    const note = JSON.parse(readFileSync(join(holderDir('353'), 'holder.json'), 'utf-8'))
    expect(note.pid).toBe(process.pid)
    expect(note.host).toBe(hostname())
    out.lock.release()
    expect(existsSync(holderDir('353'))).toBe(false)
  })

  it('a live-pid lock is respected, and the refusal names the pid and that it is alive', () => {
    plant('399', { pid: process.pid, acquiredAt: 'T0' })
    const out = createCardLockAcquirer()({ workingArea: area, card: '399' })
    expect(out).toMatchObject({ kind: 'held', pid: process.pid, alive: true })
    expect(existsSync(holderDir('399'))).toBe(true)
  })

  it('a lock with no pid / foreign host is never reclaimed', () => {
    plant('1', {})
    plant('2', { pid: DEAD, host: 'elsewhere' })
    expect(createCardLockAcquirer()({ workingArea: area, card: '1' }).kind).toBe('held')
    expect(createCardLockAcquirer()({ workingArea: area, card: '2' }).kind).toBe('held')
  })

  it('the probe reports stale vs held-alive without touching the lock', () => {
    plant('353', { pid: DEAD })
    plant('399', { pid: process.pid })
    expect(probeCardLock({ workingArea: area, card: '353' })).toMatchObject({
      kind: 'stale',
      pid: DEAD,
    })
    expect(probeCardLock({ workingArea: area, card: '399' })).toMatchObject({
      kind: 'held',
      pid: process.pid,
      alive: true,
    })
    expect(existsSync(holderDir('353'))).toBe(true)
  })

  it('the loop treats a stale lock as workable and says so; a live lock is "locked by pid P (alive)"', async () => {
    const records: Parameters<Parameters<typeof runWatchLoop>[1]['onIteration']>[0][] = []
    const cardOf = (id: string) => ({
      id,
      title: 't',
      branch: 'b',
      tier: 'risk:green',
      labels: [],
      mutexResources: [],
      prerequisites: [],
      escalated: false,
    })
    await runWatchLoop(
      { watch: false, intervalMs: 1, cap: 1 },
      {
        select: async () => ({ candidates: [cardOf('353'), cardOf('399')] }),
        probeLock: c =>
          c.id === '353'
            ? { kind: 'stale', path: '/l/353', pid: 111 }
            : { kind: 'held', path: '/l/399', pid: 222, alive: true },
        runBatch: async cards => ({
          outcomes: cards.map(c => ({ id: c.id, outcome: 'completed' as const, detail: 'ok' })),
        }),
        wait: async () => 'elapsed',
        isInterrupted: () => false,
        onIteration: r => void records.push(r),
      },
    )
    const r = records[0]!
    expect(r.outcomes.map(o => o.id)).toEqual(['353'])
    expect(r.skipped[0]!.detail).toMatch(/locked by pid 222 \(alive\)/)
    expect(r.reclaimed).toEqual([{ id: '353', pid: 111 }])
    const line = renderIterationLine(r, '1m')
    expect(line).toMatch(/#399 locked by pid 222 \(alive\)/)
    expect(line).toMatch(/reclaimed stale lock #353 \(pid 111 dead\)/)
  })

  it('A3: two runs racing to reclaim the SAME stale lock never both acquire — the late reclaimer must not take the live lock the early one just created', () => {
    plant('353', { pid: DEAD, acquiredAt: 'T0' })
    let winner: ReturnType<ReturnType<typeof createCardLockAcquirer>> | undefined
    // X reads the holder as dead; before it can move the lock aside, Y reclaims and takes it (a live holder now)
    const x = createCardLockAcquirer(undefined, {
      afterLivenessRead: () => {
        winner = createCardLockAcquirer()({ workingArea: area, card: '353' })
      },
    })
    const lateReclaimer = x({ workingArea: area, card: '353' })
    expect(winner?.kind).toBe('acquired')
    expect(lateReclaimer.kind).toBe('held')
    // the winner's live lock is intact
    const note = JSON.parse(readFileSync(join(holderDir('353'), 'holder.json'), 'utf-8'))
    expect(note.pid).toBe(process.pid)
  })

  it('A3: a reclaim in progress (the sidecar guard exists) makes a second reclaimer back off — it never races the rename', () => {
    plant('353', { pid: DEAD, acquiredAt: 'T0' })
    mkdirSync(`${holderDir('353')}.reclaim`)
    expect(createCardLockAcquirer()({ workingArea: area, card: '353' }).kind).toBe('held')
  })
})
