import { describe, it, expect, vi } from 'vitest'
import { homedir } from 'os'
import { join } from 'path'
import { InMemoryFileSystemService } from '@pair/content-ops'
import cacheManager, { inspectSlot, purgeSlot } from './cache-manager'
import {
  getCachedKBPath,
  getSourceCachePath,
  OFFICIAL_KB_NAME,
  officialSource,
} from './cache-slot-key'

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

  /**
   * Round 5: the restore used to DELETE the half-written slot and only then rename the
   * backup back. When that recursive delete fails (the same Windows antivirus/indexer case
   * as `removeBackupKB`), the good `.bak` AND the half-written slot both survive — and the
   * next install's `backupCachedKB` deletes the `.bak` to make room, so a second failure
   * leaves the user with the half-written slot and no backup at all. The ADL's invariant is
   * "a failing re-fetch must leave the user with the cache they had, not with none", so the
   * backup is moved back FIRST and the half-written copy discarded afterwards, best-effort.
   */
  it('restoreCachedKB puts the backup back even when the half-written slot cannot be deleted', async () => {
    const cachePath = officialSlot('0.2.0')
    const fs = new InMemoryFileSystemService(
      {
        [cachePath + '/partial.md']: 'half-written download',
        [cachePath + '.bak/manifest.json']: '{"name":"knowledge-base"}',
      },
      '/',
      '/',
    )
    vi.spyOn(fs, 'rm').mockRejectedValue(
      Object.assign(new Error('EBUSY: resource busy or locked'), { code: 'EBUSY' }),
    )

    await expect(cacheManager.restoreCachedKB(officialSource('0.2.0'), fs)).resolves.toBeUndefined()

    expect(await fs.readFile(cachePath + '/manifest.json')).toBe('{"name":"knowledge-base"}')
    expect(fs.existsSync(cachePath + '/partial.md')).toBe(false)
    expect(fs.existsSync(cachePath + '.bak')).toBe(false)
  })

  /**
   * Round 6: rename-first closed the data-loss chain, but the residual failure was
   * user-INVISIBLE. If the second rename (`.bak` back into the slot) throws, the slot does
   * not exist — it was just moved aside — so the user is left with no cache while their only
   * good copy sits at `<slot>.bak`, named nowhere they will see it (`log.debug` is off by
   * default). A transient hold must not be terminal either: the old order (delete the
   * half-written slot outright, then retry the rename) is tried before giving up.
   */
  it('restoreCachedKB retries in the old order when the rename back fails once', async () => {
    const cachePath = officialSlot('0.2.0')
    const fs = new InMemoryFileSystemService(
      {
        [cachePath + '/partial.md']: 'half-written download',
        [cachePath + '.bak/manifest.json']: '{"name":"knowledge-base"}',
      },
      '/',
      '/',
    )
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const realRename = fs.rename.bind(fs)
    let backupRenames = 0
    vi.spyOn(fs, 'rename').mockImplementation(async (from, to) => {
      if (from.endsWith('.bak') && ++backupRenames === 1) {
        throw Object.assign(new Error('EPERM: operation not permitted'), { code: 'EPERM' })
      }
      return realRename(from, to)
    })

    await cacheManager.restoreCachedKB(officialSource('0.2.0'), fs)

    expect(await fs.readFile(cachePath + '/manifest.json')).toBe('{"name":"knowledge-base"}')
    expect(fs.existsSync(cachePath + '.bak')).toBe(false)
    expect(consoleWarnSpy).not.toHaveBeenCalled()
    consoleWarnSpy.mockRestore()
  })

  /**
   * Round 6, the invariant the ADL bolds — "a failing re-fetch must leave the user with the
   * cache they had". When the restore cannot complete at all, the copy is still there, but
   * under a name the user has no reason to look at: the failure must be WARNED, and the
   * warning must name both the recoverable copy and where to move it back to.
   */
  it('restoreCachedKB warns and names the recoverable copy when it cannot put the backup back', async () => {
    const cachePath = officialSlot('0.2.0')
    const fs = new InMemoryFileSystemService(
      {
        [cachePath + '/partial.md']: 'half-written download',
        [cachePath + '.bak/manifest.json']: '{"name":"knowledge-base"}',
      },
      '/',
      '/',
    )
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const realRename = fs.rename.bind(fs)
    vi.spyOn(fs, 'rename').mockImplementation(async (from, to) => {
      if (from.endsWith('.bak')) {
        throw Object.assign(new Error('EPERM: operation not permitted'), { code: 'EPERM' })
      }
      return realRename(from, to)
    })

    await expect(cacheManager.restoreCachedKB(officialSource('0.2.0'), fs)).resolves.toBeUndefined()

    // The good copy survives — nothing deleted it — and the user is TOLD where it is
    expect(await fs.readFile(cachePath + '.bak/manifest.json')).toBe('{"name":"knowledge-base"}')
    const warned = consoleWarnSpy.mock.calls.map(c => String(c[0])).join('\n')
    expect(warned).toContain(cachePath + '.bak')
    expect(warned).toContain(cachePath)
    consoleWarnSpy.mockRestore()
  })

  /**
   * Round 6: the set-aside name used millisecond resolution alone, so two restores of the
   * same source inside one millisecond collided on the rename and took the silent path.
   */
  it('restoreCachedKB gives each set-aside copy a distinct name within the same millisecond', async () => {
    const cachePath = officialSlot('0.2.0')
    const seed = () =>
      new InMemoryFileSystemService(
        {
          [cachePath + '/partial.md']: 'half-written download',
          [cachePath + '.bak/manifest.json']: '{"name":"knowledge-base"}',
        },
        '/',
        '/',
      )
    vi.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000)
    const setAsidePaths: string[] = []

    for (const fs of [seed(), seed()]) {
      const realRename = fs.rename.bind(fs)
      vi.spyOn(fs, 'rename').mockImplementation(async (from, to) => {
        if (to.includes('.discarded-')) setAsidePaths.push(to)
        return realRename(from, to)
      })
      await cacheManager.restoreCachedKB(officialSource('0.2.0'), fs)
    }

    expect(setAsidePaths).toHaveLength(2)
    expect(setAsidePaths[0]).not.toBe(setAsidePaths[1])
    vi.mocked(Date.now).mockRestore()
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

  /**
   * The `existsSync` guard is a check-then-act: a concurrent install of the same source
   * (deferred to #428) can delete the `.bak` in between, and Node's `rm` without `force`
   * then throws ENOENT — an error on a cleanup whose goal (no `.bak` on disk) has been
   * reached. The mock encodes Node's own rule so the assertion is about behaviour, not
   * about the option object.
   */
  it('removeBackupKB tolerates a .bak that vanishes between the check and the delete', async () => {
    const cachePath = officialSlot('0.2.0')
    const fs = new InMemoryFileSystemService({ [cachePath + '.bak/manifest.json']: '{}' }, '/', '/')
    vi.spyOn(fs, 'rm').mockImplementation(async (_path, options) => {
      if (!options?.force) throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
    })

    await expect(cacheManager.removeBackupKB(officialSource('0.2.0'), fs)).resolves.toBeUndefined()
  })

  /**
   * Discarding the backup is the LAST step of a successful install: a leftover `.bak` is
   * inert (the next `backupCachedKB` overwrites it) while a thrown error aborts a install
   * that already succeeded. Windows makes this concrete — an antivirus/indexer handle on a
   * just-renamed tree yields EPERM/EBUSY.
   */
  it('removeBackupKB never throws when the delete itself fails (EBUSY)', async () => {
    const cachePath = officialSlot('0.2.0')
    const fs = new InMemoryFileSystemService({ [cachePath + '.bak/manifest.json']: '{}' }, '/', '/')
    vi.spyOn(fs, 'rm').mockRejectedValue(Object.assign(new Error('EBUSY'), { code: 'EBUSY' }))

    await expect(cacheManager.removeBackupKB(officialSource('0.2.0'), fs)).resolves.toBeUndefined()
  })

  it('ensureCacheDirectory creates directory', async () => {
    const fs = new InMemoryFileSystemService({}, '/', '/')
    const path = getCachedKBPath('0.2.0')
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
    const source = { kind: 'zip' as const, path: '/downloads/acme-kb.zip', contentHash: 'c'.repeat(64) }
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
