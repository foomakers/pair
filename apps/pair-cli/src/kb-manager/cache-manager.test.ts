import { describe, it, expect } from 'vitest'
import { homedir } from 'os'
import { join } from 'path'
import { InMemoryFileSystemService } from '@pair/content-ops'
import cacheManager, {
  OFFICIAL_KB_NAME,
  cacheSlotKey,
  getSourceCachePath,
  inspectSlot,
  localKBSource,
  officialSource,
  purgeSlot,
} from './cache-manager'

const officialSlot = (version: string) => join(homedir(), '.pair', 'kb', version)
const externalRoot = join(homedir(), '.pair', 'kb', 'external')

describe('cache-manager', () => {
  it('getCachedKBPath returns correct path', () => {
    const result = cacheManager.getCachedKBPath('0.2.0')
    expect(result).toBe(officialSlot('0.2.0'))
  })

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

  it('restoreCachedKB moves .bak back to cache', async () => {
    const cachePath = officialSlot('0.2.0')
    const fs = new InMemoryFileSystemService({ [cachePath + '.bak/manifest.json']: '{}' }, '/', '/')
    await cacheManager.restoreCachedKB(officialSource('0.2.0'), fs)
    expect(fs.existsSync(cachePath)).toBe(true)
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
 * US-395 — a cache slot belongs to ONE source.
 * Keying by CLI version alone let `install --source <zip>` extract an external KB
 * into the official KB's slot, contaminating every other project on the machine.
 */
describe('cache-manager — source-identity keying (US-395)', () => {
  it('keeps the official KB on the bare version slot', () => {
    expect(getSourceCachePath(officialSource('0.2.0'))).toBe(officialSlot('0.2.0'))
    expect(getSourceCachePath(officialSource('v0.2.0'))).toBe(officialSlot('0.2.0'))
  })

  it('never puts an external ZIP in the official slot (AC1)', () => {
    const slot = getSourceCachePath({ kind: 'zip', path: '/downloads/acme-kb-1.0.0.zip' })
    expect(slot).not.toBe(officialSlot('0.2.0'))
    expect(slot.startsWith(externalRoot)).toBe(true)
  })

  it('keeps the external slot human-readable (source label in the slot name)', () => {
    const slot = getSourceCachePath({ kind: 'zip', path: '/downloads/acme-kb-1.0.0.zip' })
    expect(slot).toContain('acme-kb-1.0.0')
  })

  it('resolves the same source to the same slot (no unbounded cache growth)', () => {
    const a = cacheSlotKey({ kind: 'zip', path: '/downloads/acme-kb-1.0.0.zip' })
    const b = cacheSlotKey({ kind: 'zip', path: '/downloads/acme-kb-1.0.0.zip' })
    expect(a).toBe(b)
  })

  it('does not collapse two sources that declare the same name and version (AC4)', () => {
    const a = cacheSlotKey({ kind: 'zip', path: '/team-a/dist/kb-1.0.0.zip' })
    const b = cacheSlotKey({ kind: 'zip', path: '/team-b/dist/kb-1.0.0.zip' })
    expect(a).not.toBe(b)
  })

  it('gives every source form its own slot (AC4)', () => {
    const keys = [
      cacheSlotKey(officialSource('0.2.0')),
      cacheSlotKey({ kind: 'zip', path: '/kb/acme.zip' }),
      cacheSlotKey({ kind: 'directory', path: '/kb/acme' }),
      cacheSlotKey({ kind: 'git', url: 'https://github.com/acme/kb.git' }),
      cacheSlotKey({ kind: 'remote', url: 'https://cdn.example.com/acme.zip' }),
    ]
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('distinguishes git refs of the same repository', () => {
    const a = cacheSlotKey({ kind: 'git', url: 'https://github.com/acme/kb.git#v1' })
    const b = cacheSlotKey({ kind: 'git', url: 'https://github.com/acme/kb.git#v2' })
    expect(a).not.toBe(b)
  })

  it('produces filesystem-safe slot names for messy sources', () => {
    const slot = cacheSlotKey({ kind: 'remote', url: 'https://cdn.example.com/a b/KB (final)!.zip' })
    expect(slot.startsWith('external/')).toBe(true)
    expect(slot.slice('external/'.length)).toMatch(/^[a-z0-9._-]+$/)
  })

  it('localKBSource resolves relative paths and classifies zip vs directory', () => {
    const fs = new InMemoryFileSystemService({}, '/work', '/work')
    expect(localKBSource('dist/kb.zip', fs)).toEqual({ kind: 'zip', path: '/work/dist/kb.zip' })
    expect(localKBSource('/abs/kb', fs)).toEqual({ kind: 'directory', path: '/abs/kb' })
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
