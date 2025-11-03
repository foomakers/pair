import { describe, it, expect } from 'vitest'
import { createTestFs } from '../test-utils/test-helpers'
import * as utils from './command-utils'

describe('command-utils basic utilities', () => {
  it('parseTargetAndSource returns nulls for missing args', () => {
    expect(utils.parseTargetAndSource(undefined)).toEqual({ target: null, source: null })
    expect(utils.parseTargetAndSource([])).toEqual({ target: null, source: null })
  })

  it('parseTargetAndSource parses target and source', () => {
    const args = ['--foo', '--target', 'out/path', '--source', 'in/path']
    expect(utils.parseTargetAndSource(args)).toEqual({ target: 'out/path', source: 'in/path' })
  })

  it('createLogger records entries and respects verbose', () => {
    const { logs, pushLog } = utils.createLogger()
    expect(Array.isArray(logs)).toBe(true)
    pushLog('info', 'hello')
    expect(logs.length).toBe(1)
    expect(logs[0].message).toBe('hello')

    const { logs: logs2, pushLog: push2 } = utils.createLogger()
    push2('warn', 'w', { a: 1 })
    expect(logs2.length).toBe(1)
  })
})

describe('command-utils fs operations - ensureDir', () => {
  it('ensureDir creates directory with recursive option', async () => {
    const fs = createTestFs({}, {}, '/test')
    await utils.ensureDir(fs, '/test/new/nested/dir')
    expect(await fs.exists('/test/new/nested/dir')).toBe(true)
  })

  it('ensureDir works with existing directory', async () => {
    const fs = createTestFs({}, { '/test/existing/file.txt': 'content' }, '/test')
    await utils.ensureDir(fs, '/test/existing')
    expect(await fs.exists('/test/existing')).toBe(true)
  })
})

describe('command-utils fs operations - doCopyAndUpdateLinks', () => {
  it('doCopyAndUpdateLinks copies files from source to target', async () => {
    const fs = createTestFs(
      {},
      {
        '/dataset/src/file1.md': '# File 1',
        '/dataset/src/file2.md': '# File 2',
      },
      '/test',
    )

    await utils.doCopyAndUpdateLinks(fs, {
      source: 'src',
      target: 'dst',
      datasetRoot: '/dataset',
      options: { defaultBehavior: 'mirror' },
    })

    expect(await fs.exists('/dataset/dst/file1.md')).toBe(true)
    expect(await fs.exists('/dataset/dst/file2.md')).toBe(true)
  })
})

describe('extractMarkdownLinks', () => {
  it('extracts links from markdown content', async () => {
    const content = '[Link1](url1) some text [Link2](url2)'
    const links = await utils.extractMarkdownLinks(content)
    expect(links).toEqual([
      { text: 'Link1', href: 'url1' },
      { text: 'Link2', href: 'url2' },
    ])
  })

  it('returns empty array when no links found', async () => {
    const links = await utils.extractMarkdownLinks('no links here')
    expect(links).toEqual([])
  })

  it('handles malformed links gracefully', async () => {
    const content = '[text](url) [incomplete]('
    const links = await utils.extractMarkdownLinks(content)
    expect(links.length).toBe(1)
    expect(links[0]).toEqual({ text: 'text', href: 'url' })
  })
})

describe('detectLinkStyle - majority detection', () => {
  const cwd = '/test'

  it('returns relative when majority are relative', async () => {
    const fs = createTestFs(
      {},
      { [`${cwd}/.pair/file1.md`]: '[a](./file.md) [b](../other.md) [c](/abs.md)' },
      cwd,
    )
    expect(await utils.detectLinkStyle(fs, `${cwd}/.pair`)).toBe('relative')
  })

  it('returns absolute when majority are absolute', async () => {
    const fs = createTestFs(
      {},
      { [`${cwd}/.pair/file1.md`]: '[a](/abs1.md) [b](/abs2.md) [c](./rel.md)' },
      cwd,
    )
    expect(await utils.detectLinkStyle(fs, `${cwd}/.pair`)).toBe('absolute')
  })

  it('returns relative when counts are equal', async () => {
    const fs = createTestFs({}, { [`${cwd}/.pair/file1.md`]: '[a](./rel.md) [b](/abs.md)' }, cwd)
    expect(await utils.detectLinkStyle(fs, `${cwd}/.pair`)).toBe('relative')
  })
})

describe('detectLinkStyle - filtering', () => {
  const cwd = '/test'

  it('skips external links in detection', async () => {
    const fs = createTestFs(
      {},
      {
        [`${cwd}/.pair/file1.md`]: '[ext](https://example.com) [rel](./file.md) [abs](/abs.md)',
      },
      cwd,
    )
    expect(await utils.detectLinkStyle(fs, `${cwd}/.pair`)).toBe('relative')
  })

  it('skips anchor links in detection', async () => {
    const fs = createTestFs(
      {},
      { [`${cwd}/.pair/file1.md`]: '[anchor](#section) [abs](/abs.md)' },
      cwd,
    )
    expect(await utils.detectLinkStyle(fs, `${cwd}/.pair`)).toBe('absolute')
  })

  it('returns relative when no internal links found', async () => {
    const fs = createTestFs(
      {},
      { [`${cwd}/.pair/file1.md`]: '[ext](https://example.com) no links' },
      cwd,
    )
    expect(await utils.detectLinkStyle(fs, `${cwd}/.pair`)).toBe('relative')
  })
})
