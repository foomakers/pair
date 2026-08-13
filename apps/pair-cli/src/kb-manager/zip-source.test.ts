import { describe, it, expect } from 'vitest'
import { createHash } from 'crypto'
import { InMemoryFileSystemService } from '@pair/content-ops'
import { zipKBSource } from './zip-source'
import { getSourceCachePath } from './cache-slot-key'

/**
 * US-395 (absorbed #429) — the identity of a local ZIP is the identity of its BYTES.
 * The hash must come from the byte-mode read: hashing a lossily utf-8-decoded binary
 * is not an identity to defend in a security-adjacent path.
 */
describe('zip-source — content identity of a local ZIP (US-395/#429)', () => {
  const bytes = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00, 0x80, 0xff, 0xfe, 0x81])
  const sha256 = createHash('sha256').update(bytes).digest('hex')

  it('hashes the bytes on disk with sha256, via the byte-mode read', async () => {
    const fs = new InMemoryFileSystemService({}, '/work', '/work')
    await fs.writeFileBinary('/downloads/acme.zip', bytes)

    const source = await zipKBSource('/downloads/acme.zip', fs)

    expect(source).toEqual({ kind: 'zip', path: '/downloads/acme.zip', contentHash: sha256 })
  })

  it('gives the same archive at two different paths the SAME slot', async () => {
    const fs = new InMemoryFileSystemService({}, '/work', '/work')
    await fs.writeFileBinary('/team-a/kb.zip', bytes)
    await fs.writeFileBinary('/backups/renamed-copy.zip', bytes)

    const a = await zipKBSource('/team-a/kb.zip', fs)
    const b = await zipKBSource('/backups/renamed-copy.zip', fs)

    expect(getSourceCachePath(a)).toBe(getSourceCachePath(b))
  })

  it('keeps two different archives apart even when their names collide', async () => {
    const fs = new InMemoryFileSystemService({}, '/work', '/work')
    await fs.writeFileBinary('/team-a/kb-1.0.0.zip', Buffer.from([1, 2, 3]))
    await fs.writeFileBinary('/team-b/kb-1.0.0.zip', Buffer.from([9, 8, 7]))

    const a = await zipKBSource('/team-a/kb-1.0.0.zip', fs)
    const b = await zipKBSource('/team-b/kb-1.0.0.zip', fs)

    expect(getSourceCachePath(a)).not.toBe(getSourceCachePath(b))
  })

  it('resolves a relative path against the injected cwd before hashing', async () => {
    const fs = new InMemoryFileSystemService({}, '/work', '/work')
    await fs.writeFileBinary('/work/dist/kb.zip', bytes)

    const source = await zipKBSource('dist/kb.zip', fs)

    expect(source.path).toBe('/work/dist/kb.zip')
    expect(source.contentHash).toBe(sha256)
  })

  it('names a missing archive the way the installer always has', async () => {
    const fs = new InMemoryFileSystemService({}, '/work', '/work')
    await expect(zipKBSource('/nope/kb.zip', fs)).rejects.toThrow(
      'ZIP file not found: /nope/kb.zip',
    )
  })
})
