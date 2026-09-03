import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdtemp, mkdir, writeFile, symlink, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { existsCaseSensitive } from './exists-case-sensitive'
import { fileSystemService } from './file-system-service'
import { InMemoryFileSystemService } from '../test-utils/in-memory-fs'

/**
 * Real filesystem on purpose: the semantics under test are the filesystem's own.
 * On APFS (macOS default) `fs.stat('docs/guide.md')` succeeds when only
 * `Docs/Guide.md` exists; github.com and Linux CI say 404 / ENOENT for the same
 * path. Every row below must read the same on both, which is the whole point.
 */
describe('existsCaseSensitive — real filesystem', () => {
  let root: string

  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'pair-case-'))
    await mkdir(join(root, 'Docs', 'Sub'), { recursive: true })
    await writeFile(join(root, 'Docs', 'Guide.md'), '# Guide')
    await writeFile(join(root, 'Docs', 'Sub', 'Deep.md'), '# Deep')
    await symlink(join(root, 'Docs'), join(root, 'alias'), 'dir')
  })

  afterAll(async () => {
    await rm(root, { recursive: true, force: true })
  })

  const rows: ReadonlyArray<{ rel: string; expected: boolean; why: string }> = [
    { rel: 'Docs/Guide.md', expected: true, why: 'exact file' },
    { rel: 'Docs', expected: true, why: 'exact directory' },
    { rel: 'Docs/Sub/Deep.md', expected: true, why: 'exact nested file' },
    { rel: '', expected: true, why: 'the root itself' },
    { rel: 'docs/Guide.md', expected: false, why: 'miscased directory segment' },
    { rel: 'Docs/guide.md', expected: false, why: 'miscased leaf' },
    { rel: 'Docs/sub/Deep.md', expected: false, why: 'miscased middle segment' },
    { rel: 'DOCS/GUIDE.MD', expected: false, why: 'every segment miscased' },
    { rel: 'Docs/Missing.md', expected: false, why: 'missing leaf' },
    { rel: 'Nope/Guide.md', expected: false, why: 'missing directory' },
    { rel: 'Docs/Guide.md/extra', expected: false, why: 'file used as a directory' },
    { rel: 'alias/Guide.md', expected: true, why: 'exact path through a symlinked directory' },
    { rel: 'alias/guide.md', expected: false, why: 'miscased leaf through a symlinked directory' },
    { rel: 'Alias/Guide.md', expected: false, why: 'miscased symlink name' },
  ]

  for (const { rel, expected, why } of rows) {
    it(`${why}: ${JSON.stringify(rel)} → ${expected}`, async () => {
      expect(await existsCaseSensitive(fileSystemService, join(root, rel))).toBe(expected)
    })
  }

  it('agrees with `exists` on an exact path and disagrees only on case (APFS makes the two differ)', async () => {
    const exact = join(root, 'Docs', 'Guide.md')
    expect(await fileSystemService.exists(exact)).toBe(true)
    expect(await existsCaseSensitive(fileSystemService, exact)).toBe(true)
    // `exists` is fs.stat: true here on a case-insensitive volume, false on Linux —
    // the disagreement this helper exists to remove. Only the case-sensitive answer
    // is asserted; the stat answer is volume-dependent by construction.
    expect(await existsCaseSensitive(fileSystemService, join(root, 'docs', 'guide.md'))).toBe(false)
  })

  it('resolves a relative path against the service working directory', async () => {
    const cwd = process.cwd()
    try {
      process.chdir(root)
      expect(await existsCaseSensitive(fileSystemService, 'Docs/Guide.md')).toBe(true)
      expect(await existsCaseSensitive(fileSystemService, 'docs/Guide.md')).toBe(false)
    } finally {
      process.chdir(cwd)
    }
  })
})

describe('existsCaseSensitive — in-memory double', () => {
  const fs = new InMemoryFileSystemService({ '/dataset/Docs/Guide.md': '# Guide' }, '/', '/')

  it('is true for an exact path and false for a missing or miscased one', async () => {
    expect(await existsCaseSensitive(fs, '/dataset/Docs/Guide.md')).toBe(true)
    expect(await existsCaseSensitive(fs, '/dataset/Docs')).toBe(true)
    expect(await existsCaseSensitive(fs, '/dataset/docs/Guide.md')).toBe(false)
    expect(await existsCaseSensitive(fs, '/dataset/Docs/Other.md')).toBe(false)
  })
})
