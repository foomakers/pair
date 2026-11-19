import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { spawnSync } from 'child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { hostname, tmpdir } from 'os'
import { join } from 'path'
import { acquireRunLock, RUN_LOCK_FILE } from './run-lock'

/**
 * #691 AC5 — one driver per card run dir (`<runDir>/run.lock`). Real filesystem on purpose: the property is the
 * exclusive create, which an in-memory double cannot fail.
 */
describe('acquireRunLock — #691 AC5 per-card run lock', () => {
  let runDir: string
  beforeEach(() => {
    runDir = mkdtempSync(join(tmpdir(), 'pair-run-lock-'))
  })
  afterEach(() => rmSync(runDir, { recursive: true, force: true }))

  const holder = (pid: number, host = hostname()) =>
    writeFileSync(
      join(runDir, RUN_LOCK_FILE),
      JSON.stringify({ pid, host, startedAt: '2026-11-19T00:00:00Z' }),
    )
  const deadPid = () => spawnSync(process.execPath, ['-e', '0']).pid!

  it('a free run dir is locked with this pid and host, and released', () => {
    const out = acquireRunLock(runDir)
    expect(out.kind).toBe('acquired')
    const note = JSON.parse(readFileSync(join(runDir, RUN_LOCK_FILE), 'utf8'))
    expect([note.pid, note.host]).toEqual([process.pid, hostname()])
    if (out.kind === 'acquired') out.release()
    expect(existsSync(join(runDir, RUN_LOCK_FILE))).toBe(false)
  })

  it.each([
    ['a live holder on this host', () => process.pid, hostname()],
    ['a holder on another host (its pid proves nothing here)', deadPid, 'other-host.example'],
  ])('%s ⇒ run-locked naming its pid and host, the lock untouched', (_, pidOf, host) => {
    const pid = pidOf()
    holder(pid, host)
    const before = readFileSync(join(runDir, RUN_LOCK_FILE), 'utf8')
    const out = acquireRunLock(runDir)
    expect(out).toEqual({ kind: 'run-locked', pid, host })
    expect(readFileSync(join(runDir, RUN_LOCK_FILE), 'utf8')).toBe(before)
  })

  it('a dead holder on this host is taken over and reported', () => {
    const pid = deadPid()
    holder(pid)
    const out = acquireRunLock(runDir)
    expect(out.kind === 'acquired' && out.takenOver).toEqual({ pid, host: hostname() })
    expect(JSON.parse(readFileSync(join(runDir, RUN_LOCK_FILE), 'utf8')).pid).toBe(process.pid)
  })

  // PR #692 r0-1: B read the holder as dead; before B acts, A completes its own takeover (or takes over and releases).
  it.each([
    ['A still holds', false],
    ['A already released', true],
  ])(
    'two takers of one dead lock (%s) ⇒ never both acquire, never a raw fs error',
    (_, aReleases) => {
      holder(999_999)
      let a: ReturnType<typeof acquireRunLock> | undefined
      const b = acquireRunLock(runDir, pid => {
        if (pid === 999_999 && a === undefined) {
          a = acquireRunLock(runDir, () => false)
          if (aReleases && a.kind === 'acquired') a.release()
        }
        return false
      })
      expect(a?.kind).toBe('acquired')
      expect(b.kind).toBe(aReleases ? 'acquired' : 'run-locked')
    },
  )

  it('liveness is the injected probe, not a platform guess (platform linux/darwin: kill(pid, 0); any other: the seam)', () => {
    holder(4242)
    const probed: number[] = []
    const out = acquireRunLock(runDir, pid => (probed.push(pid), false))
    expect(probed).toEqual([4242])
    expect(out.kind === 'acquired' && out.takenOver).toEqual({ pid: 4242, host: hostname() })
  })
})
