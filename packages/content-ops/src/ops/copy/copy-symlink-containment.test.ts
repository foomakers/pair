import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync, existsSync } from 'fs'
import { readFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { fileSystemService } from '../../file-system'
import { InMemoryFileSystemService } from '../../test-utils'
import { copyPathOps } from './copyPathOps'

/**
 * US-396 review round 3 — the read side is bounded PHYSICALLY, not lexically.
 *
 * A third-party KB is untrusted content. `fs.stat` FOLLOWS a symlink, so a KB shipping
 * `leak -> ../../../.ssh` inside a registry source made the copier report `isDirectory:
 * true` and copy the victim's files into the repository they then commit — a lexical
 * containment check on the declared path never sees it, because nothing about `leak`
 * looks like an escape.
 */
describe('copy — a symlink may not carry content in from outside the read root', () => {
  let root: string
  let kb: string
  let secrets: string

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'pair-symlink-'))
    kb = join(root, 'kb')
    secrets = join(root, 'secrets')
    mkdirSync(join(kb, 'content'), { recursive: true })
    mkdirSync(secrets, { recursive: true })
    writeFileSync(join(secrets, 'id_rsa'), 'PRIVATE KEY')
    writeFileSync(join(kb, 'content', 'real.md'), '# real\n')
  })

  afterEach(() => rmSync(root, { recursive: true, force: true }))

  it('does not copy a symlinked FILE whose target is outside the root', async () => {
    symlinkSync('../../secrets/id_rsa', join(kb, 'content', 'key.md'))

    await copyPathOps({
      fileService: fileSystemService,
      source: 'content',
      target: 'out',
      datasetRoot: kb,
    })

    expect(existsSync(join(kb, 'out', 'real.md'))).toBe(true)
    expect(existsSync(join(kb, 'out', 'key.md'))).toBe(false)
  })

  it('does not descend a symlinked DIRECTORY whose target is outside the root', async () => {
    symlinkSync('../../secrets', join(kb, 'content', 'leak'))

    await copyPathOps({
      fileService: fileSystemService,
      source: 'content',
      target: 'out',
      datasetRoot: kb,
    })

    expect(existsSync(join(kb, 'out', 'leak', 'id_rsa'))).toBe(false)
  })

  it('does not copy an escaping symlink under flatten/prefix transforms either', async () => {
    mkdirSync(join(kb, 'content', 'skill-a'))
    writeFileSync(join(kb, 'content', 'skill-a', 'SKILL.md'), '# a\n')
    symlinkSync('../../../secrets/id_rsa', join(kb, 'content', 'skill-a', 'key.md'))

    await copyPathOps({
      fileService: fileSystemService,
      source: 'content',
      target: 'out',
      datasetRoot: kb,
      options: { flatten: true, prefix: 'acme' },
    })

    expect(existsSync(join(kb, 'out', 'acme-skill-a', 'SKILL.md'))).toBe(true)
    expect(existsSync(join(kb, 'out', 'acme-skill-a', 'key.md'))).toBe(false)
  })

  it('skips a symlink to elsewhere INSIDE the KB but outside the registry source', async () => {
    // The bound is the registry's own source directory, not the KB root: `containmentRoot`
    // is the top of THIS copy. A KB shipping `content/shared -> ../shared-guidelines`
    // keeps that content out of every consumer's install — reported at WARN, the registry
    // still `ok`, the summary still green. Documented in configuration.mdx, pinned here so
    // the doc and the code cannot drift apart (US-396 review round 4).
    mkdirSync(join(kb, 'shared-guidelines'))
    writeFileSync(join(kb, 'shared-guidelines', 'house-style.md'), '# house style\n')
    symlinkSync('../shared-guidelines', join(kb, 'content', 'shared'))

    await copyPathOps({
      fileService: fileSystemService,
      source: 'content',
      target: 'out',
      datasetRoot: kb,
    })

    expect(existsSync(join(kb, 'out', 'real.md'))).toBe(true)
    expect(existsSync(join(kb, 'out', 'shared', 'house-style.md'))).toBe(false)
  })

  it('does not fail the copy on a symlink to a DIRECTORY inside the root', async () => {
    // A KB shipping `latest -> ./v2` inside its own registry source. `resolvesWithin` says
    // contained, but `readdir` does not follow a link to classify it, so `entry.isDirectory()`
    // is false and the entry used to fall through to the FILE branch: `readFile` on a
    // directory throws EISDIR, `installRegistryOrReportFailure` catches it, the whole
    // registry is reported `failed` and `pair-cli install --source` exits 1 (US-396 round 5).
    mkdirSync(join(kb, 'content', 'v2'))
    writeFileSync(join(kb, 'content', 'v2', 'guide.md'), '# v2\n')
    symlinkSync('./v2', join(kb, 'content', 'latest'))

    await expect(
      copyPathOps({
        fileService: fileSystemService,
        source: 'content',
        target: 'out',
        datasetRoot: kb,
      }),
    ).resolves.not.toThrow()

    expect(existsSync(join(kb, 'out', 'v2', 'guide.md'))).toBe(true)
    // Not followed: a directory link is skipped, never read as a file.
    expect(existsSync(join(kb, 'out', 'latest'))).toBe(false)
  })

  it('does not fail a flatten/prefix copy on a symlink to a DIRECTORY inside the root', async () => {
    mkdirSync(join(kb, 'content', 'skill-a'))
    writeFileSync(join(kb, 'content', 'skill-a', 'SKILL.md'), '# a\n')
    symlinkSync('./skill-a', join(kb, 'content', 'latest'))

    await expect(
      copyPathOps({
        fileService: fileSystemService,
        source: 'content',
        target: 'out',
        datasetRoot: kb,
        options: { flatten: true, prefix: 'acme' },
      }),
    ).resolves.not.toThrow()

    expect(existsSync(join(kb, 'out', 'acme-skill-a', 'SKILL.md'))).toBe(true)
  })

  it('refuses a registry source that is itself a symlink out of the root', async () => {
    symlinkSync('../secrets', join(kb, 'leak'))

    await expect(
      copyPathOps({
        fileService: fileSystemService,
        source: 'leak',
        target: 'out',
        datasetRoot: kb,
      }),
    ).rejects.toThrow(/escapes the dataset root/i)
    expect(existsSync(join(kb, 'out', 'id_rsa'))).toBe(false)
  })

  it('still copies a symlink that resolves INSIDE the root — the bound is physical, not a symlink ban', async () => {
    writeFileSync(join(kb, 'content', 'target.md'), '# inside\n')
    symlinkSync('./target.md', join(kb, 'content', 'alias.md'))

    await copyPathOps({
      fileService: fileSystemService,
      source: 'content',
      target: 'out',
      datasetRoot: kb,
    })

    expect(readFileSync(join(kb, 'out', 'alias.md'), 'utf-8')).toBe('# inside\n')
  })
})

/**
 * The same guard, exercised through the in-memory double.
 *
 * The double used to model half a symlink: `symlink()` recorded one and `realpath()`
 * resolved it, but `readdir` enumerated only files and directories and its Dirents
 * hardcoded `isSymbolicLink: () => false`. So an in-memory test that symlinked a secret
 * in and asserted it absent from the copy passed for the WRONG reason — the entry was
 * never listed — and kept passing with the guard deleted (US-396 review round 4).
 */
describe('copy — the in-memory double reaches the containment guard', () => {
  const seed = { '/kb/content/real.md': '# real\n', '/outside/secrets/id_rsa': 'PRIVATE KEY' }

  it('skips an escaping symlink because the guard fired, not because the entry was invisible', async () => {
    const fs = new InMemoryFileSystemService(seed, '/kb', '/kb')
    await fs.symlink('/outside/secrets', '/kb/content/leak')
    const warned: string[] = []
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(m => {
      warned.push(String(m))
    })

    await copyPathOps({ fileService: fs, source: 'content', target: 'out', datasetRoot: '/kb' })
    warnSpy.mockRestore()

    expect(await fs.exists('/kb/out/leak/id_rsa')).toBe(false)
    // Absence alone proves nothing — this is what says the skip came from the guard.
    expect(warned.join('\n')).toContain('a symlink resolving outside')
    expect(await fs.exists('/kb/out/real.md')).toBe(true)
  })

  it('still copies a symlink resolving inside the root', async () => {
    const fs = new InMemoryFileSystemService(
      { ...seed, '/kb/content/target.md': '# inside\n' },
      '/kb',
      '/kb',
    )
    await fs.symlink('/kb/content/target.md', '/kb/content/alias.md')

    await copyPathOps({ fileService: fs, source: 'content', target: 'out', datasetRoot: '/kb' })

    expect(await fs.readFile('/kb/out/alias.md')).toBe('# inside\n')
  })

  it('skips a symlink to a directory inside the root instead of reading it as a file', async () => {
    const fs = new InMemoryFileSystemService(
      { ...seed, '/kb/content/v2/guide.md': '# v2\n' },
      '/kb',
      '/kb',
    )
    await fs.symlink('/kb/content/v2', '/kb/content/latest')
    const warned: string[] = []
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(m => {
      warned.push(String(m))
    })

    await copyPathOps({ fileService: fs, source: 'content', target: 'out', datasetRoot: '/kb' })
    warnSpy.mockRestore()

    expect(await fs.exists('/kb/out/v2/guide.md')).toBe(true)
    expect(await fs.exists('/kb/out/latest')).toBe(false)
    expect(warned.join('\n')).toContain('a symlink to a directory')
  })

  it('skips an escaping symlink under flatten/prefix transforms too', async () => {
    const fs = new InMemoryFileSystemService(
      { ...seed, '/kb/content/skill-a/SKILL.md': '# a\n' },
      '/kb',
      '/kb',
    )
    await fs.symlink('/outside/secrets/id_rsa', '/kb/content/skill-a/key.md')
    const warned: string[] = []
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(m => {
      warned.push(String(m))
    })

    await copyPathOps({
      fileService: fs,
      source: 'content',
      target: 'out',
      datasetRoot: '/kb',
      options: { flatten: true, prefix: 'acme' },
    })
    warnSpy.mockRestore()

    expect(await fs.exists('/kb/out/acme-skill-a/SKILL.md')).toBe(true)
    expect(await fs.exists('/kb/out/acme-skill-a/key.md')).toBe(false)
    expect(warned.join('\n')).toContain('a symlink resolving outside')
  })
})
