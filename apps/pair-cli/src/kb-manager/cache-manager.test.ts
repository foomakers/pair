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

  it('clearCachedKB removes existing cache directory', async () => {
    const cachePath = join(homedir(), '.pair', 'kb', '0.2.0')
    const fs = new InMemoryFileSystemService(
      { [cachePath + '/manifest.json']: '{}' },
      '/',
      '/',
    )
    expect(fs.existsSync(cachePath)).toBe(true)
    await cacheManager.clearCachedKB('0.2.0', fs)
    expect(fs.existsSync(cachePath)).toBe(false)
  })

  it('clearCachedKB is no-op when cache does not exist', async () => {
    const fs = new InMemoryFileSystemService({}, '/', '/')
    // Should not throw
    await cacheManager.clearCachedKB('0.2.0', fs)
  })

  it('ensureCacheDirectory creates directory', async () => {
    const fs = new InMemoryFileSystemService({}, '/', '/')
    const path = cacheManager.getCachedKBPath('0.2.0')
    await cacheManager.ensureCacheDirectory(path, fs)
    expect(fs.existsSync(path)).toBe(true)
  })
})
