import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { fileSystemService } from './file-system-service'
import { resolvesWithin, resolvesWithinSync } from './path-containment'
import { InMemoryFileSystemService } from '../test-utils/in-memory-fs'

describe('resolvesWithin — containment is decided on the PHYSICAL path', () => {
  let root: string
  let kb: string

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'pair-containment-'))
    kb = join(root, 'kb')
    mkdirSync(join(kb, 'inner'), { recursive: true })
    mkdirSync(join(root, 'outside'), { recursive: true })
    writeFileSync(join(root, 'outside', 'secret'), 'x')
    writeFileSync(join(kb, 'inner', 'own.md'), 'x')
  })

  afterEach(() => rmSync(root, { recursive: true, force: true }))

  it('accepts a real path under the root', async () => {
    expect(await resolvesWithin(fileSystemService, join(kb, 'inner', 'own.md'), kb)).toBe(true)
    expect(resolvesWithinSync(fileSystemService, join(kb, 'inner'), kb)).toBe(true)
  })

  it('accepts the root itself', async () => {
    expect(await resolvesWithin(fileSystemService, kb, kb)).toBe(true)
  })

  it('rejects a symlink whose target is outside, however contained its NAME is', async () => {
    symlinkSync('../outside/secret', join(kb, 'leak'))

    expect(await resolvesWithin(fileSystemService, join(kb, 'leak'), kb)).toBe(false)
    expect(resolvesWithinSync(fileSystemService, join(kb, 'leak'), kb)).toBe(false)
  })

  it('rejects a path reached through a symlinked PARENT, not only a symlinked leaf', async () => {
    symlinkSync('../outside', join(kb, 'gate'))

    expect(await resolvesWithin(fileSystemService, join(kb, 'gate', 'secret'), kb)).toBe(false)
  })

  it('accepts a symlink resolving back inside the root', async () => {
    symlinkSync('./inner/own.md', join(kb, 'alias.md'))

    expect(await resolvesWithin(fileSystemService, join(kb, 'alias.md'), kb)).toBe(true)
  })

  it('accepts a root that is itself reached through a symlink', async () => {
    // `/tmp` → `/private/tmp` on macOS, a KB under a symlinked home: resolving only one
    // side would reject every honest install on such a machine.
    const alias = join(root, 'kb-alias')
    symlinkSync(kb, alias)

    expect(await resolvesWithin(fileSystemService, join(alias, 'inner'), alias)).toBe(true)
  })

  it('treats a path that does not exist as contained — there is nothing to dereference', async () => {
    expect(await resolvesWithin(fileSystemService, join(kb, 'never-shipped'), kb)).toBe(true)
    // ...including a dangling symlink, which no read can follow anyway
    symlinkSync('../outside/gone', join(kb, 'dangling'))
    expect(await resolvesWithin(fileSystemService, join(kb, 'dangling'), kb)).toBe(true)
  })

  it('works against the in-memory double the CLI tests use', async () => {
    const fs = new InMemoryFileSystemService(
      { '/kb/inner/own.md': 'x', '/elsewhere/secret': 'x' },
      '/kb',
      '/kb',
    )
    await fs.symlink('/elsewhere', '/kb/leak')

    expect(resolvesWithinSync(fs, '/kb/inner/own.md', '/kb')).toBe(true)
    expect(resolvesWithinSync(fs, '/kb/leak', '/kb')).toBe(false)
    expect(resolvesWithinSync(fs, '/kb/leak/secret', '/kb')).toBe(false)
  })
})
