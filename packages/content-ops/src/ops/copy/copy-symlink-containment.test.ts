import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync, existsSync } from 'fs'
import { readFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { fileSystemService } from '../../file-system'
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
