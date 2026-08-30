import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, existsSync, writeFileSync, mkdirSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { acquireCardLock } from './card-lock'

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

  it('grants the lock to the first caller and creates it on disk', () => {
    const lock = acquireCardLock({ workingArea, card: '217' })

    expect(lock).toBeDefined()
    expect(existsSync(lock!.path)).toBe(true)
  })

  it('refuses a second dispatch on the same card while the first holds it (trigger burst)', () => {
    const first = acquireCardLock({ workingArea, card: '217' })

    expect(acquireCardLock({ workingArea, card: '217' })).toBeUndefined()
    expect(first).toBeDefined()
  })

  it('never blocks a DIFFERENT card', () => {
    acquireCardLock({ workingArea, card: '217' })

    expect(acquireCardLock({ workingArea, card: '218' })).toBeDefined()
  })

  it('releases the lock so the next dispatch can take it', () => {
    acquireCardLock({ workingArea, card: '217' })!.release()

    expect(acquireCardLock({ workingArea, card: '217' })).toBeDefined()
  })

  it('is idempotent on release — a double release is not an error', () => {
    const lock = acquireCardLock({ workingArea, card: '217' })!

    lock.release()
    expect(() => lock.release()).not.toThrow()
  })

  it('creates the working area when it does not exist yet', () => {
    const fresh = join(workingArea, 'nested', 'automation')

    expect(acquireCardLock({ workingArea: fresh, card: '217' })).toBeDefined()
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
