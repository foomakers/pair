import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import {
  parseFrontmatter,
  stripJsx,
  getUrlFromFilePath,
  getLlmPages,
  formatLlmsIndex,
  formatLlmsFull,
  type LlmPage,
} from './get-llm-text'

describe('parseFrontmatter', () => {
  it('extracts title and description from frontmatter', () => {
    const raw = `---
title: My Page
description: A description
---

Content here.`
    const result = parseFrontmatter(raw)
    expect(result.data.title).toBe('My Page')
    expect(result.data.description).toBe('A description')
    expect(result.content).toBe('\nContent here.')
  })

  it('returns raw content when no frontmatter present', () => {
    const raw = 'Just content, no frontmatter.'
    const result = parseFrontmatter(raw)
    expect(result.data).toEqual({})
    expect(result.content).toBe(raw)
  })

  it('handles colons in frontmatter values', () => {
    const raw = `---
title: Part A: The Beginning
---

Content.`
    const result = parseFrontmatter(raw)
    expect(result.data.title).toBe('Part A: The Beginning')
  })
})

describe('stripJsx', () => {
  it('removes self-closing JSX tags', () => {
    expect(stripJsx('Before <MyComponent /> After')).toBe('Before  After')
  })

  it('removes JSX blocks with children', () => {
    const input = `Before

<Card title="test">
  Some child content
</Card>

After`
    const result = stripJsx(input)
    expect(result).toContain('Before')
    expect(result).toContain('After')
    expect(result).not.toContain('Card')
    expect(result).not.toContain('child content')
  })

  it('removes opening/closing JSX tags without matched content', () => {
    expect(stripJsx('Text <Wrapper> more </Wrapper> end')).toBe('Text  end')
  })

  it('preserves standard HTML tags', () => {
    expect(stripJsx('A <div>block</div> here')).toBe('A <div>block</div> here')
  })

  it('strips nested same-type JSX components', () => {
    const input = `Before

<Card>
  <Card>
    Inner content
  </Card>
</Card>

After`
    const result = stripJsx(input)
    expect(result).toContain('Before')
    expect(result).toContain('After')
    expect(result).not.toContain('Card')
    expect(result).not.toContain('Inner content')
  })

  it('collapses multiple blank lines after stripping', () => {
    const input = `Line 1


<Component />



Line 2`
    const result = stripJsx(input)
    expect(result).not.toMatch(/\n{3,}/)
  })
})

describe('getUrlFromFilePath', () => {
  const contentDir = '/project/content/docs'

  it('maps index.mdx to /docs', () => {
    expect(getUrlFromFilePath(`${contentDir}/index.mdx`, contentDir)).toBe('/docs')
  })

  it('maps section/index.mdx to /docs/section', () => {
    expect(getUrlFromFilePath(`${contentDir}/concepts/index.mdx`, contentDir)).toBe(
      '/docs/concepts',
    )
  })

  it('maps nested page to /docs/section/page', () => {
    expect(getUrlFromFilePath(`${contentDir}/concepts/knowledge-base.mdx`, contentDir)).toBe(
      '/docs/concepts/knowledge-base',
    )
  })

  it('maps deeply nested page', () => {
    expect(getUrlFromFilePath(`${contentDir}/reference/cli/commands.mdx`, contentDir)).toBe(
      '/docs/reference/cli/commands',
    )
  })
})

describe('getLlmPages', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'llm-test-'))
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  function writeFile(relativePath: string, content: string) {
    const fullPath = path.join(tmpDir, relativePath)
    fs.mkdirSync(path.dirname(fullPath), { recursive: true })
    fs.writeFileSync(fullPath, content, 'utf-8')
  }

  it('extracts pages from MDX files', () => {
    writeFile(
      'index.mdx',
      `---
title: Welcome
description: Home page
---

Home content.`,
    )
    writeFile(
      'concepts/kb.mdx',
      `---
title: Knowledge Base
description: KB docs
---

KB content here.`,
    )

    const pages = getLlmPages(tmpDir)

    expect(pages).toHaveLength(2)
    expect(pages[0]).toEqual({
      title: 'Welcome',
      url: '/docs',
      content: 'Home content.',
    })
    expect(pages[1]).toEqual({
      title: 'Knowledge Base',
      url: '/docs/concepts/kb',
      content: 'KB content here.',
    })
  })

  it('excludes draft pages', () => {
    writeFile(
      'published.mdx',
      `---
title: Published
---

Content.`,
    )
    writeFile(
      'draft.mdx',
      `---
title: Draft Page
draft: true
---

Draft content.`,
    )

    const pages = getLlmPages(tmpDir)
    expect(pages).toHaveLength(1)
    expect(pages[0].title).toBe('Published')
  })

  it('excludes draft pages when draft is boolean true', () => {
    writeFile(
      'published.mdx',
      `---
title: Published
---

Content.`,
    )
    writeFile(
      'draft-bool.mdx',
      `---
title: Draft Boolean
draft: true
---

Draft content.`,
    )

    // Simulate a parser that returns boolean true (future gray-matter compat)
    const pages = getLlmPages(tmpDir)
    expect(pages).toHaveLength(1)
    expect(pages[0].title).toBe('Published')
  })

  it('strips JSX from content', () => {
    writeFile(
      'page.mdx',
      `---
title: Page With JSX
---

Text before.

<PairLogo variant="favicon" size={48} />

Text after.`,
    )

    const pages = getLlmPages(tmpDir)
    expect(pages).toHaveLength(1)
    expect(pages[0].content).not.toContain('PairLogo')
    expect(pages[0].content).toContain('Text before.')
    expect(pages[0].content).toContain('Text after.')
  })

  it('returns empty array for nonexistent directory', () => {
    const pages = getLlmPages('/nonexistent/path')
    expect(pages).toEqual([])
  })

  it('returns empty array for empty directory', () => {
    const pages = getLlmPages(tmpDir)
    expect(pages).toEqual([])
  })

  it('returns pages sorted by URL', () => {
    writeFile('z-page.mdx', '---\ntitle: Z Page\n---\nZ.')
    writeFile('a-page.mdx', '---\ntitle: A Page\n---\nA.')
    writeFile('m-page.mdx', '---\ntitle: M Page\n---\nM.')

    const pages = getLlmPages(tmpDir)
    const urls = pages.map(p => p.url)
    expect(urls).toEqual([...urls].sort())
  })
})

describe('formatLlmsIndex', () => {
  const siteUrl = 'https://pair.foomakers.com'

  it('produces llmstxt.org header with title and tagline', () => {
    const result = formatLlmsIndex([], siteUrl)
    expect(result).toMatch(/^# pair\n/)
    expect(result).toContain('> AI-assisted software development')
  })

  it('groups single-segment pages under Docs heading', () => {
    const pages: LlmPage[] = [{ title: 'Welcome', url: '/docs/welcome', content: '' }]
    const result = formatLlmsIndex(pages, siteUrl)
    expect(result).toContain('## Docs')
    expect(result).toContain(`- [Welcome](${siteUrl}/docs/welcome)`)
  })

  it('groups nested pages by first path segment with capitalized heading', () => {
    const pages: LlmPage[] = [
      { title: 'KB', url: '/docs/concepts/kb', content: '' },
      { title: 'Skills', url: '/docs/concepts/skills', content: '' },
      { title: 'CLI', url: '/docs/reference/cli', content: '' },
    ]
    const result = formatLlmsIndex(pages, siteUrl)
    expect(result).toContain('## Concepts')
    expect(result).toContain('## Reference')
    expect(result).toContain(`- [KB](${siteUrl}/docs/concepts/kb)`)
    expect(result).toContain(`- [CLI](${siteUrl}/docs/reference/cli)`)
  })

  it('replaces hyphens with spaces in section headings', () => {
    const pages: LlmPage[] = [{ title: 'Setup', url: '/docs/getting-started/setup', content: '' }]
    const result = formatLlmsIndex(pages, siteUrl)
    expect(result).toContain('## Getting started')
  })
})

describe('formatLlmsFull', () => {
  const siteUrl = 'https://pair.foomakers.com'

  it('produces llmstxt.org header with title and tagline', () => {
    const result = formatLlmsFull([], siteUrl)
    expect(result).toMatch(/^# pair\n/)
    expect(result).toContain('> AI-assisted software development')
  })

  it('concatenates pages with title, source, content, and separator', () => {
    const pages: LlmPage[] = [
      { title: 'Welcome', url: '/docs', content: 'Home content.' },
      { title: 'KB', url: '/docs/concepts/kb', content: 'KB content.' },
    ]
    const result = formatLlmsFull(pages, siteUrl)
    expect(result).toContain('## Welcome')
    expect(result).toContain(`Source: ${siteUrl}/docs`)
    expect(result).toContain('Home content.')
    expect(result).toContain('---')
    expect(result).toContain('## KB')
    expect(result).toContain(`Source: ${siteUrl}/docs/concepts/kb`)
    expect(result).toContain('KB content.')
  })

  it('returns only header for empty pages', () => {
    const result = formatLlmsFull([], siteUrl)
    expect(result).not.toContain('##')
    expect(result).not.toContain('---')
  })
})
