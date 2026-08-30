import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, existsSync, writeFileSync, mkdirSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { acquireCardLock, LOCK_DIRECTORY } from './card-lock'

/**
 * Tested against a REAL filesystem, deliberately (see the module's own note and
 * ADL 2026-08-30): the property under test is the atomicity of an exclusive create, and an
 * in-memory double that cannot fail the second create would prove exactly nothing.
 */
describe('acquireCardLock — one run per card', () => {
  let workingArea: string

  beforeEach(() => {
    workingArea = mkdtempSync(join(tmpdir(), 'pair-card-lock-'))
  })
  afterEach(() => rmSync(workingArea, { recursive: true, force: true }))

  /** The lock, or the failure of the test — every success path here expects an acquisition. */
  const granted = (card: string, area = workingArea) => {
    const outcome = acquireCardLock({ workingArea: area, card })
    expect(outcome.kind).toBe('acquired')
    return outcome.kind === 'acquired' ? outcome.lock : undefined!
  }

  it('grants the lock to the first caller and creates it on disk', () => {
    const lock = granted('217')

    expect(existsSync(lock.path)).toBe(true)
    // The directory this module OWNS — the constant a caller reporting a held lock must reuse
    // rather than re-spell, so the two can never name different places.
    expect(lock.path).toBe(join(workingArea, LOCK_DIRECTORY, '217'))
  })

  it('refuses a second dispatch on the same card while the first holds it (trigger burst)', () => {
    const first = granted('217')

    expect(acquireCardLock({ workingArea, card: '217' }).kind).toBe('held')
    expect(existsSync(first.path)).toBe(true)
  })

  it('reports the holder — its directory and when it took the lock — instead of a bare refusal', () => {
    // A lock has no timeout and nothing reaps it: a SIGKILLed run leaves this directory behind and
    // every later trigger on the card skips forever. The holder's age is the only signal that
    // separates a healthy burst from a stale lock, and the path is what an operator removes.
    const before = Date.now()
    const held = granted('217')

    const second = acquireCardLock({ workingArea, card: '217' })

    expect(second).toMatchObject({ kind: 'held', path: held.path })
    const since = second.kind === 'held' ? second.since : undefined
    expect(since).toBeDefined()
    expect(new Date(since!).getTime()).toBeGreaterThanOrEqual(before - 1000)
  })

  it('still reports the holder when its note is unreadable — the age is unknown, not the lock free', () => {
    const held = granted('217')
    writeFileSync(join(held.path, 'holder.json'), '{ not json')

    const second = acquireCardLock({ workingArea, card: '217' })

    expect(second).toEqual({ kind: 'held', path: held.path })
  })

  it('never blocks a DIFFERENT card', () => {
    granted('217')

    expect(acquireCardLock({ workingArea, card: '218' }).kind).toBe('acquired')
  })

  it('releases the lock so the next dispatch can take it', () => {
    granted('217').release()

    expect(acquireCardLock({ workingArea, card: '217' }).kind).toBe('acquired')
  })

  it('is idempotent on release — a double release is not an error', () => {
    const lock = granted('217')

    lock.release()
    expect(() => lock.release()).not.toThrow()
  })

  it('creates the working area when it does not exist yet', () => {
    const fresh = join(workingArea, 'nested', 'automation')

    expect(acquireCardLock({ workingArea: fresh, card: '217' }).kind).toBe('acquired')
  })

  it('keeps a card id from escaping the lock directory', () => {
    expect(() => acquireCardLock({ workingArea, card: '../../etc' })).toThrow(/card/)
  })

  it('surfaces a real failure instead of reporting the lock as held', () => {
    // A FILE where the lock directory must go is not "someone else holds it" — it is a broken
    // working area, and reporting it as contention would silently park every dispatch forever.
    const locks = join(workingArea, 'automation', 'locks')
    mkdirSync(locks, { recursive: true })
    writeFileSync(join(locks, '217'), 'not a directory')

    expect(() => acquireCardLock({ workingArea, card: '217' })).toThrow()
  })
})
