import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtempSync, rmSync, existsSync, writeFileSync, mkdirSync, readdirSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { acquireCardLock, LOCK_DIRECTORY } from './card-lock'
import { acquireResourceLocks, resourceLockId } from './parallel'
import { probeCardLock, probeResourceLocks } from './lock-probe'
import type { RootCandidate } from './root-plan'

/** Real temp directory, as `card-lock.test.ts` (ADL 2026-08-30): the in-memory FS cannot model the lock. */
describe('lock probes', () => {
  let workingArea: string
  beforeEach(() => {
    workingArea = mkdtempSync(join(tmpdir(), 'pair-lock-probe-'))
  })
  afterEach(() => rmSync(workingArea, { recursive: true, force: true }))

  const cardWith = (...mutexResources: string[]): RootCandidate => ({
    id: '1',
    title: 't',
    branch: 'b',
    tier: 'risk:green',
    mutexResources,
    prerequisites: [],
  })

  describe('probeCardLock', () => {
    it('free: nothing on disk, and the probe creates nothing', () => {
      expect(probeCardLock({ workingArea, card: '217' })).toEqual({ kind: 'free' })
      expect(existsSync(join(workingArea, 'automation'))).toBe(false)
    })

    it('free: the locks directory exists but not this card', () => {
      mkdirSync(join(workingArea, LOCK_DIRECTORY, '999'), { recursive: true })
      expect(probeCardLock({ workingArea, card: '217' })).toEqual({ kind: 'free' })
      expect(readdirSync(join(workingArea, LOCK_DIRECTORY))).toEqual(['999'])
    })

    it('held: reports path and since, and leaves the lock intact', () => {
      const outcome = acquireCardLock({ workingArea, card: '217' })
      if (outcome.kind !== 'acquired') throw new Error('setup')
      const probe = probeCardLock({ workingArea, card: '217' })
      expect(probe).toMatchObject({ kind: 'held', path: outcome.lock.path })
      expect(typeof (probe as { since?: string }).since).toBe('string')
      expect(existsSync(outcome.lock.path)).toBe(true)
      outcome.lock.release()
      expect(probeCardLock({ workingArea, card: '217' })).toEqual({ kind: 'free' })
    })

    it('held without since when holder.json is unreadable', () => {
      const path = join(workingArea, LOCK_DIRECTORY, '217')
      mkdirSync(path, { recursive: true })
      writeFileSync(join(path, 'holder.json'), '{ not json')
      expect(probeCardLock({ workingArea, card: '217' })).toEqual({ kind: 'held', path })
    })

    it('rejects an unsafe card id (it becomes a path segment)', () => {
      expect(() => probeCardLock({ workingArea, card: '../x' })).toThrow(/plain identifier/)
    })

    it('a file where the lock goes is a broken working area, not contention', () => {
      mkdirSync(join(workingArea, LOCK_DIRECTORY), { recursive: true })
      writeFileSync(join(workingArea, LOCK_DIRECTORY, '217'), '')
      expect(() => probeCardLock({ workingArea, card: '217' })).toThrow(/not a directory/)
    })
  })

  describe('probeResourceLocks', () => {
    it('free: no resources, or none held', () => {
      expect(probeResourceLocks({ card: cardWith(), workingArea })).toEqual({ kind: 'free' })
      expect(probeResourceLocks({ card: cardWith('a.ts', 'b.ts'), workingArea })).toEqual({
        kind: 'free',
      })
      expect(existsSync(join(workingArea, 'automation'))).toBe(false)
    })

    it('held: names the first held resource, path and since', () => {
      const holder = acquireResourceLocks({
        card: cardWith('b.ts'),
        workingArea,
        acquireLock: acquireCardLock,
      })
      if (holder.kind !== 'acquired') throw new Error('setup')
      const probe = probeResourceLocks({ card: cardWith('a.ts', 'b.ts'), workingArea })
      expect(probe).toMatchObject({
        kind: 'held',
        resource: 'b.ts',
        path: join(workingArea, LOCK_DIRECTORY, resourceLockId('b.ts')),
      })
      expect(typeof (probe as { since?: string }).since).toBe('string')
      holder.release()
      expect(probeResourceLocks({ card: cardWith('b.ts'), workingArea })).toEqual({ kind: 'free' })
    })

    it('held with an unreadable holder.json has no since', () => {
      const path = join(workingArea, LOCK_DIRECTORY, resourceLockId('a.ts'))
      mkdirSync(path, { recursive: true })
      expect(probeResourceLocks({ card: cardWith('a.ts'), workingArea })).toEqual({
        kind: 'held',
        resource: 'a.ts',
        path,
      })
    })
  })

  describe.each(['darwin', 'linux'] as const)('platform %s', platform => {
    afterEach(() => vi.unstubAllGlobals())

    it('builds the same lock path under an injected platform', () => {
      vi.stubGlobal('process', Object.create(process, { platform: { value: platform } }))
      const path = join(workingArea, LOCK_DIRECTORY, '217')
      mkdirSync(path, { recursive: true })
      expect(probeCardLock({ workingArea, card: '217' })).toEqual({ kind: 'held', path })
    })
  })
})
