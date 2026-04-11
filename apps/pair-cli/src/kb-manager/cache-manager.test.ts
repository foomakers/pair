import { describe, it, expect } from 'vitest'
import { homedir } from 'os'
import { join } from 'path'
import { InMemoryFileSystemService } from '@pair/content-ops'
import cacheManager from './cache-manager'

describe('cache-manager', () => {
  it('getCachedKBPath returns correct path', () => {
    const result = cacheManager.getCachedKBPath('0.2.0')
    expect(result).toBe(join(homedir(), '.pair', 'kb', '0.2.0'))
  })

  it('isKBCached returns true when manifest exists', async () => {
    const expected = join(homedir(), '.pair', 'kb', '0.2.0')
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
    const cachePath = join(homedir(), '.pair', 'kb', '0.2.0')
    const fs = new InMemoryFileSystemService({ [cachePath + '/manifest.json']: '{}' }, '/', '/')
    const result = await cacheManager.backupCachedKB('0.2.0', fs)
    expect(result).toBe(true)
    expect(fs.existsSync(cachePath)).toBe(false)
    expect(fs.existsSync(cachePath + '.bak')).toBe(true)
  })

  it('backupCachedKB returns false when cache does not exist', async () => {
    const fs = new InMemoryFileSystemService({}, '/', '/')
    const result = await cacheManager.backupCachedKB('0.2.0', fs)
    expect(result).toBe(false)
  })

  it('restoreCachedKB moves .bak back to cache', async () => {
    const cachePath = join(homedir(), '.pair', 'kb', '0.2.0')
    const fs = new InMemoryFileSystemService({ [cachePath + '.bak/manifest.json']: '{}' }, '/', '/')
    await cacheManager.restoreCachedKB('0.2.0', fs)
    expect(fs.existsSync(cachePath)).toBe(true)
    expect(fs.existsSync(cachePath + '.bak')).toBe(false)
  })

  it('restoreCachedKB is no-op when no backup exists', async () => {
    const fs = new InMemoryFileSystemService({}, '/', '/')
    await cacheManager.restoreCachedKB('0.2.0', fs)
  })

  it('removeBackupKB deletes .bak directory', async () => {
    const cachePath = join(homedir(), '.pair', 'kb', '0.2.0')
    const fs = new InMemoryFileSystemService({ [cachePath + '.bak/manifest.json']: '{}' }, '/', '/')
    await cacheManager.removeBackupKB('0.2.0', fs)
    expect(fs.existsSync(cachePath + '.bak')).toBe(false)
  })

  it('removeBackupKB is no-op when no backup exists', async () => {
    const fs = new InMemoryFileSystemService({}, '/', '/')
    await cacheManager.removeBackupKB('0.2.0', fs)
  })

  it('ensureCacheDirectory creates directory', async () => {
    const fs = new InMemoryFileSystemService({}, '/', '/')
    const path = cacheManager.getCachedKBPath('0.2.0')
    await cacheManager.ensureCacheDirectory(path, fs)
    expect(fs.existsSync(path)).toBe(true)
  })
})
