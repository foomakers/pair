import { describe, it, expect } from 'vitest'
import {
  readMarkdown,
  fencedBlocks,
  atxHeadingText,
  isSetextUnderline,
  HTML_KINDS_RENDERING_ANCHORS,
  type MarkdownEvent,
} from './commonmark-blocks'
import { COMMONMARK_BLOCK_ROWS } from '../test-utils/commonmark-rows'

/**
 * The reader itself, against the SHARED row table — the same rows the website's
 * docs-staleness gate and the knowledge-hub conformance sweep run, each value taken
 * from github.com's own renderer (see `../test-utils/commonmark-rows.ts` for the
 * command). This file asserts the two things a consumer derives from the reader:
 * which lines are RENDERED MARKDOWN (so they can carry a heading anchor) and which
 * are a FENCED BLOCK body.
 */
describe('readMarkdown / fencedBlocks — the shared CommonMark block table', () => {
  const MARKDOWN_INFO_RE = /^(?:markdown|md)\b/i

  for (const row of COMMONMARK_BLOCK_ROWS) {
    it(`[${row.name}] ${row.why} — fenced blocks`, () => {
      const blocks = fencedBlocks(row.content)
        .filter(b => MARKDOWN_INFO_RE.test(b.info))
        .map(b => b.body)
      expect(blocks, row.name).toEqual([...(row.readerBlocks ?? row.markdownBlocks)])
    })
  }

  /**
   * The reader's own contract, one level below the two derived views: a line is
   * classified exactly once, and every event's index is a real source line. Run over
   * the whole table so a container rule that silently drops a line reddens here first.
   */
  it('accounts for every source line exactly once, in order', () => {
    for (const row of COMMONMARK_BLOCK_ROWS) {
      const lines = row.content.split(/\r?\n/)
      if (lines[lines.length - 1] === '') lines.pop()
      const seen: MarkdownEvent[] = [...readMarkdown(row.content)]
      const lineEvents = seen.filter(e => e.kind !== 'fence-end' && e.kind !== 'html-end')
      // A fence CLOSER carries no content of its own, so it is the one line that emits a
      // `fence-end` and nothing else. Every other line emits exactly one line event.
      const closers = seen
        .filter(e => e.kind === 'fence-end' && e.index < lines.length)
        .map(e => e.index)
        .filter(i => !lineEvents.some(e => e.index === i))
      expect(
        [...lineEvents.map(e => e.index), ...closers].sort((a, b) => a - b),
        row.name,
      ).toEqual(lines.map((_l, i) => i))
      expect(
        lineEvents.map(e => e.index),
        `${row.name}: line events in document order`,
      ).toEqual([...lineEvents.map(e => e.index)].sort((a, b) => a - b))
      for (const ev of lineEvents) {
        expect(ev.raw, `${row.name} line ${ev.index}`).toBe(lines[ev.index])
      }
    }
  })

  it('opens and ends each block exactly once (no dangling fence or HTML block)', () => {
    for (const row of COMMONMARK_BLOCK_ROWS) {
      const events = [...readMarkdown(row.content)]
      const fenceOpens = events.filter(e => e.kind === 'fence-open').length
      const fenceEnds = events.filter(e => e.kind === 'fence-end').length
      const htmlOpens = events.filter(e => e.kind === 'html-open').length
      const htmlEnds = events.filter(e => e.kind === 'html-end').length
      expect(fenceEnds, `${row.name}: fence-end per fence-open`).toBe(fenceOpens)
      expect(htmlEnds, `${row.name}: html-end per html-open`).toBe(htmlOpens)
    }
  })
})

/**
 * The MDX flavour. Every expectation is the REAL renderer's, read out of the
 * prerendered `.next/server/app/docs/<page>.html` after
 * `pnpm --filter @pair/website build` on a probe page — MDX gives indentation to JSX
 * instead of to code blocks, and parses JSX children as ordinary markdown.
 */
describe('readMarkdown — the mdx flavour', () => {
  const leaves = (md: string, mdx: boolean): string[] =>
    [...readMarkdown(md, { mdx })]
      .filter(ev => ev.kind === 'leaf')
      .map(ev => (ev.kind === 'leaf' ? ev.text : ''))

  it('has NO indented code blocks', () => {
    const md = 'text\n\n    indented\n'
    expect([...readMarkdown(md)].some(ev => ev.kind === 'leaf' && ev.indentedCode)).toBe(true)
    expect(
      [...readMarkdown(md, { mdx: true })].some(ev => ev.kind === 'leaf' && ev.indentedCode),
    ).toBe(false)
  })

  it('has NO § 4.6 HTML blocks — a <div> is just a line', () => {
    const md = '<div>\ninside\n</div>\n'
    expect([...readMarkdown(md)].some(ev => ev.kind === 'html-open')).toBe(true)
    expect([...readMarkdown(md, { mdx: true })].some(ev => ev.kind === 'html-open')).toBe(false)
    expect(leaves(md, true)).toEqual(['<div>', 'inside', '</div>'])
  })

  it('keeps a FENCE inside a <div> a fence — the site renders it as code', () => {
    const md = '<div>\n```bash\nls\n```\n</div>\n'
    expect(fencedBlocks(md, { mdx: true })).toEqual([{ info: 'bash', body: 'ls\n' }])
    // Without the flag the fence is swallowed by the HTML block, as § 4.6 says.
    expect(fencedBlocks(md)).toEqual([])
  })

  it('still reads fences, containers and headings', () => {
    const md = '- # In List\n\n> ## Quoted\n\n```md\nbody\n```\n'
    expect(leaves(md, true)).toEqual(['# In List', '', '## Quoted', ''])
    expect(fencedBlocks(md, { mdx: true })).toEqual([{ info: 'md', body: 'body\n' }])
  })

  it('accounts for every source line exactly once under the flag too', () => {
    for (const row of COMMONMARK_BLOCK_ROWS) {
      const lines = row.content.split(/\r?\n/)
      if (lines[lines.length - 1] === '') lines.pop()
      const seen = [...readMarkdown(row.content, { mdx: true })]
      const lineEvents = seen.filter(e => e.kind !== 'fence-end' && e.kind !== 'html-end')
      const closers = seen
        .filter(e => e.kind === 'fence-end' && e.index < lines.length)
        .map(e => e.index)
        .filter(i => !lineEvents.some(e => e.index === i))
      expect(
        [...lineEvents.map(e => e.index), ...closers].sort((a, b) => a - b),
        row.name,
      ).toEqual(lines.map((_l, i) => i))
    }
  })
})

describe('readMarkdown — frontmatter', () => {
  it('skips YAML frontmatter only when asked', () => {
    const md = '---\ntitle: X\n---\n\n# Real\n'
    const withFm = [...readMarkdown(md, { frontmatter: true })].filter(e => e.kind === 'leaf')
    expect(withFm.map(e => (e.kind === 'leaf' ? e.text : ''))).toEqual(['', '# Real'])
    const withoutFm = [...readMarkdown(md)].filter(e => e.kind === 'leaf')
    expect(withoutFm).toHaveLength(5)
  })

  it('treats an UNCLOSED frontmatter delimiter as ordinary content', () => {
    const leaves = [...readMarkdown('---\ntitle: X\n\n# Real\n', { frontmatter: true })].filter(
      e => e.kind === 'leaf',
    )
    expect(leaves).toHaveLength(4)
  })
})

describe('readMarkdown — the paragraph a setext underline heads', () => {
  const paragraphAt = (md: string, underline: string): readonly string[] | undefined => {
    for (const ev of readMarkdown(md)) {
      if (ev.kind === 'leaf' && ev.text === underline && ev.paragraph.length > 0)
        return ev.paragraph
    }
    return undefined
  }

  it('carries the WHOLE paragraph, not the last line', () => {
    expect(paragraphAt('Some paragraph\nline two\n---\n', '---')).toEqual([
      'Some paragraph',
      'line two',
    ])
  })

  it('is empty after a blank line, so `---` is a thematic break', () => {
    expect(paragraphAt('Para\n\n---\n', '---')).toBeUndefined()
  })
})

describe('the heading-line predicates the reader exports', () => {
  it('reads an ATX heading and strips its closing hashes', () => {
    expect(atxHeadingText('## Two Words ##')).toBe('Two Words')
    expect(atxHeadingText('#NoSpace')).toBeUndefined()
    expect(atxHeadingText('#')).toBeUndefined()
    expect(atxHeadingText('####### Seven')).toBeUndefined()
  })

  it('reads a setext underline shape', () => {
    expect(isSetextUnderline('---')).toBe(true)
    expect(isSetextUnderline('===  ')).toBe(true)
    expect(isSetextUnderline('| --- | --- |')).toBe(false)
  })
})

describe('HTML_KINDS_RENDERING_ANCHORS', () => {
  /**
   * Which HTML blocks still render an explicit `<a name>`/`<a id>` as a live anchor.
   * Probed one kind at a time on github.com: `<script>`/`<pre>` (kind 1) and `<div>`
   * (kind 6) all serve `name="user-content-…"`; the same anchor inside `<!-- … -->`
   * (kind 2) serves nothing, and kinds 3/4/5 are not rendered either.
   */
  it('covers exactly the rendered kinds', () => {
    expect([...HTML_KINDS_RENDERING_ANCHORS].sort()).toEqual([1, 6, 7])
  })

  it('classifies a comment, a raw-text block and a block tag by kind', () => {
    const kindOf = (md: string): number | undefined => {
      for (const ev of readMarkdown(md)) if (ev.kind === 'html-open') return ev.htmlKind
      return undefined
    }
    expect(kindOf('<!--\nx\n-->\n')).toBe(2)
    expect(kindOf('<pre>\nx\n</pre>\n')).toBe(1)
    expect(kindOf('<div>\nx\n</div>\n')).toBe(6)
    expect(kindOf('<span>\nx\n</span>\n')).toBe(7)
    expect(kindOf('<?php\nx\n?>\n')).toBe(3)
    expect(kindOf('<!DOCTYPE html>\n')).toBe(4)
    expect(kindOf('<![CDATA[\nx\n]]>\n')).toBe(5)
  })
})
