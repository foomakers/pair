import { InMemoryFileSystemService } from '@pair/content-ops'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { handleKbCacheCommand } from './handler'
import type { KbCacheCommandConfig } from './parser'

// `prune` is the only command in the CLI that deletes from a machine-wide directory the user
// never named. What it must NOT delete is therefore the whole test: an external KB is a slot
// this CLI cannot re-download, and the running version's slot is what the next command reads.
// These tests exercise the handler against a real filesystem tree so the assertions are about
// what survives on disk, not about what the reporting line claimed.

const ROOT = '/cache/kb'

const SLOTS = [
  `${ROOT}/0.4.3`, // current — must survive
  `${ROOT}/0.3.9`, // superseded official
  `${ROOT}/0.4.3.bak`, // interrupted install
  `${ROOT}/0.4.3.tmp-4821-0`, // abandoned stage
  `${ROOT}/git-deadbeef`, // pre-#395 clone at root
  `${ROOT}/external/zip-8ae362dc47aa`, // external — must survive
  `${ROOT}/external/git-a1b2c3`, // external — must survive
]

const seedFiles = (): Record<string, string> =>
  Object.fromEntries(SLOTS.map(s => [`${s}/manifest.json`, '{"name":"kb"}']))

const cfg = (
  action: 'list' | 'prune',
  extra: Partial<KbCacheCommandConfig> = {},
): KbCacheCommandConfig => ({ command: 'kb-cache', action, json: false, dryRun: false, ...extra })

const listing = async (fs: InMemoryFileSystemService, dir: string): Promise<string[]> =>
  (await fs.readdir(dir)).map(e => e.name).sort()

describe('handleKbCacheCommand', () => {
  let fs: InMemoryFileSystemService

  beforeEach(() => {
    vi.stubEnv('PAIR_KB_CACHE_DIR', ROOT)
    fs = new InMemoryFileSystemService(seedFiles(), '/module', '/project')
  })
  afterEach(() => vi.unstubAllEnvs())

  it('list reports every slot and deletes nothing', async () => {
    const before = await listing(fs, ROOT)

    const code = await handleKbCacheCommand(cfg('list'), fs, { version: '0.4.3' })

    expect(code).toBe(0)
    expect(await listing(fs, ROOT)).toEqual(before)
    expect(await listing(fs, `${ROOT}/external`)).toEqual(['git-a1b2c3', 'zip-8ae362dc47aa'])
  })

  it('prune --dry-run removes nothing from disk', async () => {
    const before = await listing(fs, ROOT)

    const code = await handleKbCacheCommand(cfg('prune', { dryRun: true }), fs, {
      version: '0.4.3',
    })

    expect(code).toBe(0)
    expect(await listing(fs, ROOT)).toEqual(before)
  })

  it('prune removes the stale slots and spares the current one and every external KB', async () => {
    const code = await handleKbCacheCommand(cfg('prune'), fs, { version: '0.4.3' })

    expect(code).toBe(0)
    expect(await listing(fs, ROOT)).toEqual(['0.4.3', 'external'])
    // An external KB was fetched from a URL the CLI does not retain; deleting it is not
    // recoverable by re-running an install.
    expect(await listing(fs, `${ROOT}/external`)).toEqual(['git-a1b2c3', 'zip-8ae362dc47aa'])
  })

  it('prunes nothing at all when the running version is unknown', async () => {
    // Empty version means "cannot tell which official slot is current". Guessing would delete
    // the slot the running CLI is about to read, so every official slot is spared.
    const before = await listing(fs, ROOT)

    await handleKbCacheCommand(cfg('prune'), fs, { version: '' })

    expect(await listing(fs, ROOT)).toContain('0.4.3')
    expect(await listing(fs, ROOT)).toContain('0.3.9')
    expect(before.every(n => n)).toBe(true)
  })

  it('reports failure when a slot could not be removed, instead of claiming a clean prune', async () => {
    // A partial prune that exits 0 tells the user disk was reclaimed when it was not.
    vi.spyOn(fs, 'rm').mockImplementation(async (path: string) => {
      if (path.endsWith('0.3.9')) throw new Error('EACCES')
    })

    const code = await handleKbCacheCommand(cfg('prune'), fs, { version: '0.4.3' })

    expect(code).toBe(1)
  })

  it('surfaces an unreadable cache as a failure rather than an empty cache', async () => {
    vi.spyOn(fs, 'readdir').mockRejectedValue(new Error('EIO'))

    const code = await handleKbCacheCommand(cfg('list'), fs, { version: '0.4.3' })

    expect(code).toBe(1)
  })
})
