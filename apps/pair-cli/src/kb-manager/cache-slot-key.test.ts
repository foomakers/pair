import { describe, it, expect } from 'vitest'
import { homedir } from 'os'
import { join } from 'path'
import { InMemoryFileSystemService } from '@pair/content-ops'
import {
  cacheSlotKey,
  getCacheRoot,
  getCachedKBPath,
  getSourceCachePath,
  localKBSource,
  officialSource,
  resolveSourcePath,
} from './cache-slot-key'

const officialSlot = (version: string) => join(homedir(), '.pair', 'kb', version)
const externalRoot = join(homedir(), '.pair', 'kb', 'external')

/**
 * US-395 — a cache slot belongs to ONE source.
 * Keying by CLI version alone let `install --source <zip>` extract an external KB
 * into the official KB's slot, contaminating every other project on the machine.
 */
describe('cache-slot-key — source-identity keying (US-395)', () => {
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

  it('gives every slot-owning source form its own slot (AC4)', () => {
    const keys = [
      cacheSlotKey(officialSource('0.2.0')),
      cacheSlotKey({ kind: 'zip', path: '/kb/acme.zip' }),
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
    const slot = cacheSlotKey({
      kind: 'remote',
      url: 'https://cdn.example.com/a b/KB (final)!.zip',
    })
    expect(slot.startsWith('external/')).toBe(true)
    expect(slot.slice('external/'.length)).toMatch(/^[a-z0-9._-]+$/)
  })

  it('localKBSource resolves relative paths and classifies zip vs directory', () => {
    const fs = new InMemoryFileSystemService({}, '/work', '/work')
    expect(localKBSource('dist/kb.zip', fs)).toEqual({ kind: 'zip', path: '/work/dist/kb.zip' })
    expect(localKBSource('/abs/kb', fs)).toEqual({ kind: 'directory', path: '/abs/kb' })
  })

  it('classifies the extension case-insensitively, so KB.ZIP is a ZIP', () => {
    const fs = new InMemoryFileSystemService({}, '/work', '/work')
    expect(localKBSource('/downloads/KB.ZIP', fs)).toEqual({
      kind: 'zip',
      path: '/downloads/KB.ZIP',
    })
  })

  it('treats a Windows absolute path as absolute instead of joining it onto the cwd', () => {
    const fs = new InMemoryFileSystemService({}, '/work', '/work')
    expect(resolveSourcePath('C:\\kb\\acme.zip', fs)).toBe('C:\\kb\\acme.zip')
    expect(resolveSourcePath('\\\\share\\kb', fs)).toBe('\\\\share\\kb')
  })
})

/**
 * One filesystem location must yield ONE slot. Every spurious slot is a full extra copy
 * of a KB on disk plus a needless re-extract — distinct from the accepted path-vs-content
 * trade-off (#429): here the SAME path expression failed to canonicalize.
 */
describe('cache-slot-key — one location, one slot (path canonicalization)', () => {
  const fs = new InMemoryFileSystemService({}, '/work', '/work')

  it('collapses `.` and `..` segments in an absolute path', () => {
    const plain = resolveSourcePath('/downloads/acme.zip', fs)
    expect(resolveSourcePath('/downloads/./acme.zip', fs)).toBe(plain)
    expect(resolveSourcePath('/downloads/../downloads/acme.zip', fs)).toBe(plain)
  })

  it('strips a trailing separator, so `--source /kb/` and `/kb` share one slot', () => {
    expect(resolveSourcePath('/kb/', fs)).toBe('/kb')
    expect(cacheSlotKey({ kind: 'zip', path: resolveSourcePath('/kb/acme.zip/', fs) })).toBe(
      cacheSlotKey({ kind: 'zip', path: resolveSourcePath('/kb/acme.zip', fs) }),
    )
  })

  it('canonicalizes the relative branch too (trailing slash after join)', () => {
    expect(resolveSourcePath('../acme-kb/', fs)).toBe('/acme-kb')
    expect(resolveSourcePath('./dist/kb.zip', fs)).toBe('/work/dist/kb.zip')
  })

  it('canonicalizes a Windows path with the Windows rules, not the POSIX ones', () => {
    expect(resolveSourcePath('C:\\kb\\..\\kb\\acme.zip', fs)).toBe('C:\\kb\\acme.zip')
    expect(resolveSourcePath('C:\\kb\\', fs)).toBe('C:\\kb')
  })

  it('leaves a filesystem root intact instead of stripping it to nothing', () => {
    expect(resolveSourcePath('/', fs)).toBe('/')
    expect(resolveSourcePath('C:\\', fs)).toBe('C:\\')
  })
})

// `vitest.setup.ts` deletes PAIR_KB_CACHE_DIR before EVERY test, so a suite that sets it
// needs no save/restore of its own — the setup file owns the variable.
describe('cache-slot-key — key → path mapping', () => {
  it('maps a key to a slot under the cache root', () => {
    expect(getCachedKBPath('0.2.0')).toBe(officialSlot('0.2.0'))
  })

  it('normalizes the version in cacheSlotKey only — getCachedKBPath takes a key verbatim', () => {
    expect(getCachedKBPath('v0.2.0')).toBe(officialSlot('v0.2.0'))
    expect(getSourceCachePath(officialSource('v0.2.0'))).toBe(officialSlot('0.2.0'))
  })

  it('refuses an empty key instead of resolving to the cache root (which purgeSlot deletes)', () => {
    expect(() => getCachedKBPath('')).toThrow(/must not be empty/)
    expect(() => getCachedKBPath('   ')).toThrow(/must not be empty/)
    expect(() => getSourceCachePath(officialSource(''))).toThrow(/must not be empty/)
  })

  it('honours PAIR_KB_CACHE_DIR, the documented cache-directory override', () => {
    process.env['PAIR_KB_CACHE_DIR'] = '/custom/kb-cache'
    expect(getCacheRoot()).toBe('/custom/kb-cache')
    expect(getCachedKBPath('0.2.0')).toBe(join('/custom/kb-cache', '0.2.0'))
    expect(getSourceCachePath({ kind: 'zip', path: '/downloads/acme.zip' })).toContain(
      join('/custom/kb-cache', 'external'),
    )
  })

  it('falls back to ~/.pair/kb when the override is unset or blank', () => {
    process.env['PAIR_KB_CACHE_DIR'] = '   '
    expect(getCacheRoot()).toBe(join(homedir(), '.pair', 'kb'))
    delete process.env['PAIR_KB_CACHE_DIR']
    expect(getCacheRoot()).toBe(join(homedir(), '.pair', 'kb'))
  })

  /**
   * The cache root feeds every slot path, and `purgeSlot` deletes a slot recursively.
   * A relative override would resolve slots against the process cwd, so `pair install`
   * inside a repository would create AND recursively delete directories in it.
   */
  it('refuses a relative PAIR_KB_CACHE_DIR instead of resolving slots against the cwd', () => {
    process.env['PAIR_KB_CACHE_DIR'] = '.cache/kb'
    expect(() => getCacheRoot()).toThrow(/PAIR_KB_CACHE_DIR/)
    expect(() => getCacheRoot()).toThrow(/absolute/)
  })

  it('refuses a PAIR_KB_CACHE_DIR that climbs out with `..`', () => {
    process.env['PAIR_KB_CACHE_DIR'] = '/var/cache/../../etc'
    expect(() => getCacheRoot()).toThrow(/PAIR_KB_CACHE_DIR/)
  })

  /**
   * The cache ROOT is judged by the HOST convention, unlike a `--source` path. On POSIX,
   * `C:\cache\kb` is a RELATIVE name: `join('C:\\cache\\kb', '0.4.3')` gives
   * `C:\cache\kb/0.4.3`, which resolves against the process cwd — the same hazard as
   * `.cache/kb` one test above, so it gets the same answer.
   */
  it('judges the override by the HOST convention, not by either convention', () => {
    process.env['PAIR_KB_CACHE_DIR'] = 'C:\\cache\\kb'
    if (process.platform === 'win32') {
      expect(getCacheRoot()).toBe('C:\\cache\\kb')
    } else {
      expect(() => getCacheRoot()).toThrow(/PAIR_KB_CACHE_DIR/)
      expect(() => getCacheRoot()).toThrow(/absolute/)
    }
  })

  it('refuses a key that climbs out of the cache root', () => {
    expect(() => getCachedKBPath('../../etc')).toThrow(/cache root/)
    expect(() => getCachedKBPath('external/../../etc')).toThrow(/cache root/)
    expect(() => getSourceCachePath(officialSource('../evil'))).toThrow(/cache root/)
  })
})
