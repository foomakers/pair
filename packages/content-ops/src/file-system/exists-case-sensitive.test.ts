import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdtemp, mkdir, writeFile, symlink, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  existsCaseSensitive,
  existsCaseSensitiveSync,
  resolveCaseSensitiveSync,
} from './exists-case-sensitive'
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

  /**
   * The SYNC driver over the same rows. Both drivers turn the ONE `caseSensitiveWalk`
   * coroutine, so a segment rule deleted from it reddens here twice — and in the
   * website's docs-staleness suite, which imports `existsCaseSensitiveSync` rather
   * than keeping a second copy of this loop (ADR-024's rule, applied to this file).
   */
  for (const { rel, expected, why } of rows) {
    it(`sync — ${why}: ${JSON.stringify(rel)} → ${expected}`, () => {
      expect(existsCaseSensitiveSync(root, rel)).toBe(expected)
    })
  }

  /**
   * `..` is RFC 3986 dot-segment removal, not a traversal escape hatch, because that is
   * what the reader's own client does before the request leaves the machine:
   * `curl -v .../blob/main/.pair/knowledge/../knowledge/skills-guide.md` puts
   * `GET /foomakers/pair/blob/main/.pair/knowledge/skills-guide.md` on the wire (200),
   * and `.../blob/main/../../etc/passwd` puts `GET /foomakers/pair/etc/passwd` (404).
   * So a collapsing `..` resolves and an ESCAPING one is dead, matching both codes.
   */
  const dotRows: ReadonlyArray<{ rel: string; expected: boolean; why: string }> = [
    { rel: 'Docs/../Docs/Guide.md', expected: true, why: 'a `..` that collapses back' },
    { rel: 'Docs/Sub/../Guide.md', expected: true, why: 'a `..` out of a subdirectory' },
    { rel: 'Docs/../docs/Guide.md', expected: false, why: 'case still decides after the collapse' },
    { rel: '../etc/passwd', expected: false, why: 'a `..` that escapes the root is dead' },
    { rel: 'Docs/../../etc/passwd', expected: false, why: 'and so is one that escapes late' },
  ]

  for (const { rel, expected, why } of dotRows) {
    it(`sync — ${why}: ${JSON.stringify(rel)} → ${expected}`, () => {
      expect(existsCaseSensitiveSync(root, rel)).toBe(expected)
    })
  }

  it('async collapses the same `..` in an unnormalized absolute path', async () => {
    expect(await existsCaseSensitive(fileSystemService, `${root}/Docs/../Docs/Guide.md`)).toBe(true)
    expect(await existsCaseSensitive(fileSystemService, `${root}/Docs/../docs/Guide.md`)).toBe(
      false,
    )
  })

  /**
   * The walk keeps WHERE it stopped, which is the whole input to a "did you mean"
   * diagnostic: the failing segment and what its parent actually lists.
   */
  it('reports the failing segment and its siblings', () => {
    const miss = resolveCaseSensitiveSync(root, 'docs/Guide.md')
    expect(miss.kind).toBe('missing')
    if (miss.kind !== 'missing') return
    expect(miss.segment).toBe('docs')
    expect(miss.parent).toBe(root)
    expect([...miss.siblings].sort()).toEqual(['Docs', 'alias'])
  })

  it('reports the DEEP failing segment, not the whole path', () => {
    const miss = resolveCaseSensitiveSync(root, 'Docs/Sub/deep.md')
    expect(miss.kind).toBe('missing')
    if (miss.kind !== 'missing') return
    expect(miss.segment).toBe('deep.md')
    expect(miss.parent).toBe(join(root, 'Docs', 'Sub'))
    expect(miss.siblings).toEqual(['Deep.md'])
  })

  /**
   * WHERE it stopped is an INDEX, not a name. A path may repeat a segment name
   * (`apps/website/apps/x.md`), and a caller that re-finds the failing segment by
   * `indexOf` rewrites the FIRST occurrence — a different path than the one being
   * repaired. So the walk carries the depth it stopped at, and the collapsed segments
   * it actually walked, and the caller splices rather than searches.
   */
  it('reports the DEPTH it stopped at, so a repeated segment name is unambiguous', () => {
    const miss = resolveCaseSensitiveSync(root, 'Docs/Sub/Docs/x.md')
    expect(miss.kind).toBe('missing')
    if (miss.kind !== 'missing') return
    expect(miss.segment).toBe('Docs')
    expect(miss.depth).toBe(2)
    expect(miss.segments).toEqual(['Docs', 'Sub', 'Docs', 'x.md'])
  })

  it('carries the DOT-SEGMENT-COLLAPSED segments, the ones actually walked', () => {
    const miss = resolveCaseSensitiveSync(root, 'Docs/./Sub/../Sub/deep.md')
    expect(miss.kind).toBe('missing')
    if (miss.kind !== 'missing') return
    expect(miss.segments).toEqual(['Docs', 'Sub', 'deep.md'])
    expect(miss.depth).toBe(2)
    expect(miss.segments[miss.depth]).toBe(miss.segment)
  })

  it('reports no siblings when the parent itself cannot be listed', () => {
    // The parent here is a FILE, so `readdir` throws and there is nothing to suggest.
    const miss = resolveCaseSensitiveSync(root, 'Docs/Guide.md/extra')
    expect(miss.kind).toBe('missing')
    if (miss.kind !== 'missing') return
    expect(miss.segment).toBe('extra')
    expect(miss.siblings).toEqual([])
  })

  it('resolves to the absolute path it walked to', () => {
    expect(resolveCaseSensitiveSync(root, 'Docs/Guide.md')).toEqual({
      kind: 'resolved',
      path: join(root, 'Docs', 'Guide.md'),
    })
  })

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
