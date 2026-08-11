import { describe, it, expect } from 'vitest'
import { homedir } from 'os'
import { join } from 'path'
import { InMemoryFileSystemService } from '@pair/content-ops'
import cacheManager, { inspectSlot, purgeSlot } from './cache-manager'
import { getSourceCachePath, OFFICIAL_KB_NAME, officialSource } from './cache-slot-key'

const officialSlot = (version: string) => join(homedir(), '.pair', 'kb', version)

describe('cache-manager', () => {
  it('isKBCached returns true when manifest exists', async () => {
    const expected = officialSlot('0.2.0')
    const fs = new InMemoryFileSystemService({ [expected + '/manifest.json']: '{}' }, '/', '/')
    const res = await cacheManager.isKBCached('0.2.0', fs)
    expect(res).toBe(true)
  })

  it('isKBCached returns false when missing', async () => {
    const fs = new InMemoryFileSystemService({}, '/', '/')
    const res = await cacheManager.isKBCached('0.2.0', fs)
    expect(res).toBe(false)
  })

  it('backupCachedKB moves cache to .bak and returns true', async () => {
    const cachePath = officialSlot('0.2.0')
    const fs = new InMemoryFileSystemService({ [cachePath + '/manifest.json']: '{}' }, '/', '/')
    const result = await cacheManager.backupCachedKB(officialSource('0.2.0'), fs)
    expect(result).toBe(true)
    expect(fs.existsSync(cachePath)).toBe(false)
    expect(fs.existsSync(cachePath + '.bak')).toBe(true)
  })

  it('backupCachedKB returns false when cache does not exist', async () => {
    const fs = new InMemoryFileSystemService({}, '/', '/')
    const result = await cacheManager.backupCachedKB(officialSource('0.2.0'), fs)
    expect(result).toBe(false)
  })

  it('backupCachedKB replaces a stale .bak left behind by an earlier interrupted install', async () => {
    const cachePath = officialSlot('0.2.0')
    const fs = new InMemoryFileSystemService(
      {
        [cachePath + '/manifest.json']: '{"name":"current"}',
        [cachePath + '.bak/manifest.json']: '{"name":"stale"}',
      },
      '/',
      '/',
    )

    expect(await cacheManager.backupCachedKB(officialSource('0.2.0'), fs)).toBe(true)

    expect(await fs.readFile(cachePath + '.bak/manifest.json')).toBe('{"name":"current"}')
  })

  it('restoreCachedKB moves .bak back to cache', async () => {
    const cachePath = officialSlot('0.2.0')
    const fs = new InMemoryFileSystemService({ [cachePath + '.bak/manifest.json']: '{}' }, '/', '/')
    await cacheManager.restoreCachedKB(officialSource('0.2.0'), fs)
    expect(fs.existsSync(cachePath)).toBe(true)
    expect(fs.existsSync(cachePath + '.bak')).toBe(false)
  })

  it('restoreCachedKB replaces a half-written slot left by the failed install', async () => {
    const cachePath = officialSlot('0.2.0')
    const fs = new InMemoryFileSystemService(
      {
        [cachePath + '/partial.md']: 'half-written download',
        [cachePath + '.bak/manifest.json']: '{"name":"knowledge-base"}',
      },
      '/',
      '/',
    )

    await cacheManager.restoreCachedKB(officialSource('0.2.0'), fs)

    expect(fs.existsSync(cachePath + '/partial.md')).toBe(false)
    expect(await fs.readFile(cachePath + '/manifest.json')).toBe('{"name":"knowledge-base"}')
    expect(fs.existsSync(cachePath + '.bak')).toBe(false)
  })

  it('restoreCachedKB is no-op when no backup exists', async () => {
    const fs = new InMemoryFileSystemService({}, '/', '/')
    await cacheManager.restoreCachedKB(officialSource('0.2.0'), fs)
  })

  it('removeBackupKB deletes .bak directory', async () => {
    const cachePath = officialSlot('0.2.0')
    const fs = new InMemoryFileSystemService({ [cachePath + '.bak/manifest.json']: '{}' }, '/', '/')
    await cacheManager.removeBackupKB(officialSource('0.2.0'), fs)
    expect(fs.existsSync(cachePath + '.bak')).toBe(false)
  })

  it('removeBackupKB is no-op when no backup exists', async () => {
    const fs = new InMemoryFileSystemService({}, '/', '/')
    await cacheManager.removeBackupKB(officialSource('0.2.0'), fs)
  })

  it('ensureCacheDirectory creates directory', async () => {
    const fs = new InMemoryFileSystemService({}, '/', '/')
    const path = cacheManager.getCachedKBPath('0.2.0')
    await cacheManager.ensureCacheDirectory(path, fs)
    expect(fs.existsSync(path)).toBe(true)
  })
})

/**
 * US-395 AC5 — an already-contaminated slot is detected, not trusted.
 */
describe('cache-manager — contamination detection (US-395 AC5)', () => {
  it('reports an empty slot', async () => {
    const fs = new InMemoryFileSystemService({}, '/', '/')
    expect(await inspectSlot(officialSource('0.2.0'), fs)).toEqual({ status: 'empty' })
  })

  it('reports a slot holding the official KB as ready', async () => {
    const slot = officialSlot('0.2.0')
    const fs = new InMemoryFileSystemService(
      { [slot + '/manifest.json']: JSON.stringify({ name: OFFICIAL_KB_NAME, version: '0.2.0' }) },
      '/',
      '/',
    )
    expect(await inspectSlot(officialSource('0.2.0'), fs)).toEqual({ status: 'ready' })
  })

  it('reports a foreign KB in the official slot as contaminated', async () => {
    const slot = officialSlot('0.2.0')
    const fs = new InMemoryFileSystemService(
      { [slot + '/manifest.json']: JSON.stringify({ name: 'acme-kb', version: '1.0.0' }) },
      '/',
      '/',
    )
    expect(await inspectSlot(officialSource('0.2.0'), fs)).toEqual({
      status: 'contaminated',
      expected: OFFICIAL_KB_NAME,
      found: 'acme-kb',
    })
  })

  it('reports a slot with no manifest at all as empty, so a half-written download is re-fetched', async () => {
    const slot = officialSlot('0.2.0')
    const fs = new InMemoryFileSystemService(
      { [slot + '/.pair/knowledge/partial.md']: 'half-extracted' },
      '/',
      '/',
    )
    expect(await inspectSlot(officialSource('0.2.0'), fs)).toEqual({ status: 'empty' })
  })

  it('trusts a slot whose manifest predates the name field (inconclusive, not foreign)', async () => {
    const slot = officialSlot('0.2.0')
    const fs = new InMemoryFileSystemService(
      { [slot + '/manifest.json']: JSON.stringify({ version: '0.2.0' }) },
      '/',
      '/',
    )
    expect(await inspectSlot(officialSource('0.2.0'), fs)).toEqual({ status: 'ready' })
  })

  it('trusts a slot with an unreadable manifest rather than deleting user content', async () => {
    const slot = officialSlot('0.2.0')
    const fs = new InMemoryFileSystemService({ [slot + '/manifest.json']: 'not json' }, '/', '/')
    expect(await inspectSlot(officialSource('0.2.0'), fs)).toEqual({ status: 'ready' })
  })

  it('trusts an external slot, which declares no expected manifest name', async () => {
    const source = { kind: 'zip' as const, path: '/downloads/acme-kb.zip' }
    const slot = getSourceCachePath(source)
    const fs = new InMemoryFileSystemService({ [slot + '/AGENTS.md']: '# acme' }, '/', '/')
    expect(await inspectSlot(source, fs)).toEqual({ status: 'ready' })
  })

  it('isKBCached refuses a contaminated official slot so the install re-fetches', async () => {
    const slot = officialSlot('0.2.0')
    const fs = new InMemoryFileSystemService(
      { [slot + '/manifest.json']: JSON.stringify({ name: 'acme-kb', version: '1.0.0' }) },
      '/',
      '/',
    )
    expect(await cacheManager.isKBCached('0.2.0', fs)).toBe(false)
  })

  it('purgeSlot removes the slot so foreign files cannot survive a re-install', async () => {
    const slot = officialSlot('0.2.0')
    const fs = new InMemoryFileSystemService(
      {
        [slot + '/manifest.json']: JSON.stringify({ name: 'acme-kb' }),
        [slot + '/.pair/knowledge/foreign.md']: 'foreign',
      },
      '/',
      '/',
    )
    await purgeSlot(officialSource('0.2.0'), fs)
    expect(fs.existsSync(slot)).toBe(false)
    expect(fs.existsSync(slot + '/.pair/knowledge/foreign.md')).toBe(false)
  })
})
