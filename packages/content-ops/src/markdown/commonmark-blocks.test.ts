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

/**
 * `blockStart` — the reader's own answer to "does this line begin a new leaf block?".
 *
 * A consumer cannot derive this from `paragraph.length`: the accumulator is reset AFTER
 * the line that ends the paragraph is emitted, so an ATX heading tight against a
 * paragraph carries a NON-empty accumulator on its own line while being a separate
 * block. Grouping by the accumulator therefore merges the two — measured as a silent
 * false green in the docs link gate (ADL 2026-09-04).
 */
describe('readMarkdown — blockStart marks a leaf block boundary', () => {
  const starts = (md: string, opts = {}): boolean[] =>
    [...readMarkdown(md, opts)].filter(ev => ev.kind === 'leaf').map(ev => ev.blockStart)

  it('marks a TIGHT ATX heading as a new block, where paragraph.length cannot', () => {
    const leaves = [...readMarkdown('Para line.\n## Heading\n')].filter(ev => ev.kind === 'leaf')
    expect(leaves.map(ev => ev.text)).toEqual(['Para line.', '## Heading'])
    // The accumulator is the trap this field exists to avoid: NOT empty on the heading.
    expect(leaves[1]?.paragraph).toEqual(['Para line.'])
    expect(leaves.map(ev => ev.blockStart)).toEqual([true, true])
  })

  it('does NOT mark a paragraph continuation', () => {
    expect(starts('One line.\nStill the same paragraph.\n')).toEqual([true, false])
  })

  it('does NOT mark a setext underline — it ends the heading it underlines', () => {
    expect(starts('Heading text\n===\nAfter.\n')).toEqual([true, false, true])
  })

  it('marks a tight thematic break and the line after it', () => {
    expect(starts('Para.\n***\nAfter.\n')).toEqual([true, true, true])
  })

  it('marks the first line after a blank line', () => {
    expect(starts('A.\n\nB.\n')).toEqual([true, true, true])
  })

  it('keeps consecutive indented-code lines in ONE block', () => {
    expect(starts('\n    code one\n    code two\n')).toEqual([true, true, false])
  })

  it('marks a lazy continuation as a continuation, not a start', () => {
    expect(starts('> Quoted line.\nlazy continuation.\n')).toEqual([true, false])
  })

  it('marks the first leaf of a document', () => {
    expect(starts('Only line.\n')).toEqual([true])
  })

  // --- THE STATE OWNER, ENUMERATED ------------------------------------------
  //
  // `blockStart` reports on the PARAGRAPH state, and that state has exactly three
  // owners: `advanceParagraph` — the line is PUSHED onto the accumulator (it CONTINUES
  // the open paragraph) or the accumulator is RESET (the line ENDED it); `openContainers`
  // — a container that really opens resets it, and it deliberately REFUSES to open a list
  // whose marker cannot interrupt a paragraph, leaving that line as paragraph text; and
  // `closeContainers` — a container that ends resets it.
  //
  // The laziness predicate `continuesParagraph` is NOT that owner. It answers the
  // strictly stronger question "may this line omit its container prefix?", and it says
  // `false` for lines the paragraph state still APPENDS: a 4-space-indented line, an
  // ordered marker that cannot interrupt, an HTML-shaped line under the `mdx` flavour.
  // Deriving `blockStart` from it splits paragraphs the renderer keeps whole.
  //
  // Every row is a MEASURED renderer, never a spec reading. The `mdx` rows are the DOCS
  // SITE (`pnpm --filter @pair/website build`, `<a href>` counted in the prerendered
  // `.next/server/app/docs/<probe>.html`) for the same line shape carrying a stray
  // backtick either side of a URL: 1 `<a href>` means the backticks did NOT pair, i.e.
  // two inline scopes, i.e. a real block boundary; 0 means one scope and no boundary.
  // The CommonMark rows are github.com's own renderer (`gh api -X POST /markdown`).
  const secondLeafStart = (line: string, mdx: boolean): boolean => {
    const leaves = [...readMarkdown(`Some para\n${line}\n`, { mdx })].filter(
      ev => ev.kind === 'leaf',
    )
    const second = leaves[1]
    if (second === undefined || second.kind !== 'leaf') throw new Error(`no second leaf: ${line}`)
    return second.blockStart
  }

  const AGAINST_OPEN_PARAGRAPH: ReadonlyArray<{
    shape: string
    line: string
    mdx: boolean
    startsBlock: boolean
    oracle: string
  }> = [
    // --- the mdx flavour: the docs site is the oracle -------------------------
    { shape: 'a blank line', line: '', mdx: true, startsBlock: true, oracle: 'site: 1 <a href>' },
    {
      shape: 'a tight ATX heading',
      line: '## Heading',
      mdx: true,
      startsBlock: true,
      oracle: 'site: 1 <a href>',
    },
    {
      shape: 'a `===` setext underline',
      line: '===',
      mdx: true,
      startsBlock: false,
      oracle: 'site: 0 <a href> — the underline is the last line of the heading it heads',
    },
    {
      shape: 'a `---` setext underline',
      line: '---',
      mdx: true,
      startsBlock: false,
      oracle: 'site: 0 <a href>',
    },
    {
      shape: 'a `***` thematic break',
      line: '***',
      mdx: true,
      startsBlock: true,
      oracle: 'site: 1 <a href>',
    },
    {
      shape: 'plain prose',
      line: 'more prose',
      mdx: true,
      startsBlock: false,
      oracle: 'site: 0 <a href>',
    },
    {
      // advanceParagraph PUSHES this line: `isIndentedCode` needs an EMPTY accumulator,
      // so with a paragraph open the indented line is ordinary continuation text.
      shape: 'a 4-space-indented continuation',
      line: '    indented cont',
      mdx: true,
      startsBlock: false,
      oracle: 'site: 0 <a href> — the backticks paired across it',
    },
    {
      shape: 'a bullet list marker',
      line: '- item',
      mdx: true,
      startsBlock: true,
      oracle: 'site: 1 <a href> — openContainers opened the item',
    },
    {
      shape: 'an ordered marker starting at 1',
      line: '1. item',
      mdx: true,
      startsBlock: true,
      oracle: 'site: 1 <a href> — openContainers opened the item',
    },
    {
      // openContainers REFUSES to open this list (`interruptsParagraph`), so the line
      // stays paragraph text and advanceParagraph pushes it.
      shape: 'an ordered marker that cannot interrupt (`2.`)',
      line: '2. item',
      mdx: true,
      startsBlock: false,
      oracle: 'site: 0 <a href> — the backticks paired across it',
    },
    {
      shape: 'an ordered paren marker that cannot interrupt (`2)`)',
      line: '2) item',
      mdx: true,
      startsBlock: false,
      oracle: 'site: 0 <a href>',
    },
    {
      shape: 'a block quote marker',
      line: '> quoted',
      mdx: true,
      startsBlock: true,
      oracle: 'site: 1 <a href> — openContainers opened the quote',
    },
    {
      shape: 'a <div> line (JSX flow)',
      line: '<div>',
      mdx: true,
      startsBlock: true,
      oracle: 'site: 1 <a href> — the JSX element ends the paragraph',
    },
    {
      // NOT a github fact: § 4.6 type 7 cannot interrupt a paragraph there, and the
      // reader is right to say so WITHOUT the flag (row below). MDX has no type-7 rule.
      shape: 'a <span> line (JSX flow)',
      line: '<span>',
      mdx: true,
      startsBlock: true,
      oracle: 'site: 1 <a href> — the JSX element ends the paragraph',
    },
    {
      shape: 'a JSX component line',
      line: '<Callout>',
      mdx: true,
      startsBlock: true,
      oracle: 'site: 1 <a href> — the JSX element ends the paragraph',
    },
    // --- the CommonMark flavour: github.com is the oracle ---------------------
    {
      shape: 'a tight ATX heading',
      line: '## Heading',
      mdx: false,
      startsBlock: true,
      oracle: 'github: <p>Some para</p><h2>',
    },
    {
      shape: 'a `===` setext underline',
      line: '===',
      mdx: false,
      startsBlock: false,
      oracle: 'github: <h1>Some para</h1>',
    },
    {
      shape: 'a `***` thematic break',
      line: '***',
      mdx: false,
      startsBlock: true,
      oracle: 'github: <p>Some para</p><hr>',
    },
    {
      // github: `<p>Some para\nindented cont</p>` — § 4.4 code cannot interrupt a
      // paragraph, which is exactly what `isIndentedCode`'s empty-accumulator guard says.
      shape: 'a 4-space-indented continuation',
      line: '    indented cont',
      mdx: false,
      startsBlock: false,
      oracle: 'github: ONE <p>, both lines in it',
    },
    {
      shape: 'an ordered marker that cannot interrupt (`2.`)',
      line: '2. item',
      mdx: false,
      startsBlock: false,
      oracle: 'github: <p>Some para\n2. item</p>',
    },
    {
      // The number is read as a NUMBER: `01.` is 1, so it interrupts and opens.
      shape: 'an ordered marker `01.` (reads as 1)',
      line: '01. item',
      mdx: false,
      startsBlock: true,
      oracle: 'github: <p>Some para</p><ol><li>item</li></ol>',
    },
    {
      shape: 'a complete <span> tag alone (§ 4.6 type 7)',
      line: '<span>x</span>',
      mdx: false,
      startsBlock: false,
      oracle: 'github: ONE <p>, both lines in it — type 7 cannot interrupt',
    },
  ]

  for (const { shape, line, mdx, startsBlock, oracle } of AGAINST_OPEN_PARAGRAPH) {
    it(`${startsBlock ? 'marks' : 'does NOT mark'} ${shape} against an open paragraph${
      mdx ? ' (mdx)' : ''
    }`, () => {
      expect(secondLeafStart(line, mdx), oracle).toBe(startsBlock)
    })
  }

  /**
   * A GFM table interrupts an open paragraph on BOTH renderers — measured, because the
   * reader models no table at all and a consumer must not have to guess. Site: the
   * paragraph's stray backtick does not pair with one in the first table row (1
   * `<a href>`). github: `<p>Cost is 5 wide.</p><table>…`.
   */
  it('marks a GFM table header that interrupts a paragraph', () => {
    const md = 'Cost is 5 wide.\n| A | B |\n| --- | --- |\n| c | d |\n'
    expect(starts(md, { mdx: true }).slice(0, 2), 'site: 1 <a href>').toEqual([true, true])
    expect(starts(md).slice(0, 2), 'github: <p> then <table>').toEqual([true, true])
  })

  /**
   * The mdx flavour has no § 4.4 indented code, so two consecutive indented lines are
   * ONE paragraph — measured on the site: 0 `<a href>`, the backticks paired across the
   * two lines. `advanceParagraph` says the same (the second line is pushed onto the
   * first); `continuesParagraph` is the only thing that calls them two blocks.
   */
  it('keeps two 4-space-indented lines in ONE paragraph under mdx', () => {
    expect(starts('    Cost is 5 wide.\n    See it end\n', { mdx: true })).toEqual([true, false])
  })

  /** The same under CommonMark, where they are one INDENTED CODE block (github: one <pre>). */
  it('keeps two 4-space-indented lines in ONE indented-code block without mdx', () => {
    expect(starts('    code one\n    code two\n')).toEqual([true, false])
  })

  /**
   * An indented line in the MIDDLE of a paragraph does not break it in half either —
   * site: 0 `<a href>`, one inline scope across all three lines.
   */
  it('keeps a paragraph whole across an indented middle line (mdx)', () => {
    expect(starts('Cost is 5 wide.\n    mid line\nSee it end\n', { mdx: true })).toEqual([
      true,
      false,
      false,
    ])
  })

  /**
   * `st.indented` is per INDENTED-CODE BLOCK, and a container that closes ends that
   * block: `>     code1` / `    code2` is an indented code block inside a block quote and
   * then a SEPARATE one at document level. github renders exactly two <pre> blocks, so
   * the second line begins a block. `closeContainers` owns that reset.
   */
  it('starts a new indented-code block when a container closes between two of them', () => {
    expect(starts('>     code1\n    code2\n'), 'github: TWO <pre> blocks').toEqual([true, true])
  })

  /** The partner direction: inside the SAME quote they are one block (github: one <pre>). */
  it('keeps two indented lines in one block while the container holds', () => {
    expect(starts('>     code1\n>     code2\n'), 'github: ONE <pre>').toEqual([true, false])
  })

  /** ...and a blank line between them ends the quote and its code block alike. */
  it('starts a new indented-code block after a blank line closes the quote', () => {
    expect(starts('>     code1\n\n    code2\n')).toEqual([true, true, true])
  })

  /**
   * Did the paragraph state ABSORB line `a`? Observable from the public events alone:
   * the next leaf's accumulator is `a`'s plus `a`'s own text, which is exactly what
   * `advanceParagraph`'s push arm does.
   */
  const absorbedByParagraph = (
    a: Extract<MarkdownEvent, { kind: 'leaf' }>,
    b: Extract<MarkdownEvent, { kind: 'leaf' }>,
  ): boolean =>
    a.paragraph.length > 0 &&
    b.paragraph.length === a.paragraph.length + 1 &&
    b.paragraph[b.paragraph.length - 1] === a.text &&
    b.paragraph.slice(0, -1).join('\n') === a.paragraph.join('\n')

  const absorbedBlockStarts = (md: string, mdx: boolean): string[] => {
    const leaves = [...readMarkdown(md, { mdx })].filter(ev => ev.kind === 'leaf')
    const out: string[] = []
    for (let i = 0; i + 1 < leaves.length; i++) {
      const a = leaves[i]
      const b = leaves[i + 1]
      if (a === undefined || b === undefined) continue
      if (absorbedByParagraph(a, b) && a.blockStart)
        out.push(`mdx=${mdx} line ${a.index} ${JSON.stringify(a.text)}`)
    }
    return out
  }

  /**
   * The self-consistency the field exists for, stated over the state owner rather than
   * over any one example: if `advanceParagraph` APPENDED a line to an open paragraph —
   * observable as the next leaf's accumulator being this one's plus this line's text —
   * then that line CONTINUED a leaf block and cannot also have begun one.
   *
   * The converse is deliberately NOT asserted: a line that ENDS a paragraph may still
   * belong to it (a setext underline) or start a new block (an ATX heading), and only
   * the renderer can say which — that is what the row table above is for.
   */
  it('never reports a line the paragraph state APPENDED as a block start', () => {
    const corpus: ReadonlyArray<string> = [
      'Some para\n    indented cont\nstill the same\n',
      'Some para\n2. item\nstill the same\n',
      'Some para\n2) item\nstill the same\n',
      'Some para\n10. item\nstill the same\n',
      'Some para\nmore prose\nstill the same\n',
      '> Quoted line.\nlazy continuation.\nstill the same\n',
      'Para.\n## Heading\nAfter.\n',
      'Para.\n***\nAfter.\n',
      'Heading text\n===\nAfter.\n',
      'A.\n\nB.\n',
      '    code one\n    code two\nafter\n',
      '- item\n  continued\nlazy\n',
      ...COMMONMARK_BLOCK_ROWS.map(row => row.content),
    ]
    const offenders = corpus.flatMap(md => [
      ...absorbedBlockStarts(md, false),
      ...absorbedBlockStarts(md, true),
    ])
    expect(offenders, 'lines reported as a block start while the paragraph absorbed them').toEqual(
      [],
    )
  })

  /**
   * The JSX half of the same invariant, from the other side: the site ends the paragraph
   * at a `<div>` line (1 `<a href>`, the backticks did not pair), so the accumulator must
   * not go on carrying that paragraph — whatever the reader does to `blockStart`, the two
   * answers have to agree.
   */
  it('does not absorb a <div> line into the paragraph it ends (mdx)', () => {
    const leaves = [...readMarkdown('Some para\n<div>\nSee it\n</div>\n', { mdx: true })].filter(
      ev => ev.kind === 'leaf',
    )
    const third = leaves[2]
    expect(third?.kind === 'leaf' ? third.blockStart : undefined).toBeDefined()
    expect(
      third?.kind === 'leaf' ? third.paragraph : [],
      'the <div> line ended the paragraph on the site; it cannot be inside it here',
    ).not.toContain('<div>')
  })
})

/**
 * A GFM TABLE is one reader block but N INLINE-PARSING SCOPES on the renderer: each cell
 * is parsed on its own, so a backtick in one cell cannot pair with a backtick in another.
 * Measured on the docs site (`pnpm --filter @pair/website build`, `<a href>` counted in
 * the prerendered `.next/server/app/docs/<probe>.html`), one probe row each:
 *
 * | bytes                                              | site | reader today            |
 * | -------------------------------------------------- | ---- | ----------------------- |
 * | url between backticks in two cells of ONE row       | 1    | one scope — URL blanked |
 * | url between backticks in cells of DIFFERENT rows    | 1    | one scope — URL blanked |
 *
 * That is the SILENT direction — the docs link gate reports PASS on a citation the site
 * serves as a live link (see the surface rows in
 * `apps/website/lib/docs-staleness-check.test.ts`) — so the boundary has to come from the
 * reader, not from a second grammar in the consumer (ADR-024).
 *
 * WHICH channel carries it is the reader's choice, so this suite reads whatever the
 * reader declares: a leaf's `text` when it declares no finer split, an own property
 * holding the line's parts (as strings, or as objects with a `text`), or one leaf event
 * per part at the same source index. It asserts only that the parts of a table row are
 * not presented as ONE inline scope — and, in the other direction, that ordinary
 * paragraph lines still are.
 */
describe('readMarkdown — a GFM table is more than one inline scope', () => {
  const finerParts = (leaf: Extract<MarkdownEvent, { kind: 'leaf' }>): string[] | undefined => {
    for (const [key, value] of Object.entries(leaf)) {
      // `paragraph` is the accumulator of PREVIOUS lines, not a split of this one.
      if (key === 'paragraph' || !Array.isArray(value) || value.length < 2) continue
      if (value.every(v => typeof v === 'string')) return value as string[]
      if (
        value.every(
          v =>
            typeof v === 'object' &&
            v !== null &&
            typeof (v as { text?: unknown }).text === 'string',
        )
      )
        return value.map(v => (v as { text: string }).text)
    }
    return undefined
  }

  /** Every inline scope the reader DECLARES for a document, finest first. */
  const declaredScopes = (md: string): string[] => {
    const scopes: string[] = []
    let group: string[] = []
    let lastIndex = -1
    const flush = (): void => {
      if (group.length > 0) scopes.push(group.join('\n'))
      group = []
    }
    for (const ev of readMarkdown(md, { mdx: true })) {
      if (ev.kind !== 'leaf') continue
      if (ev.blockStart || ev.index === lastIndex) flush()
      lastIndex = ev.index
      const parts = finerParts(ev)
      if (parts === undefined) group.push(ev.text)
      else {
        flush()
        scopes.push(...parts)
      }
    }
    flush()
    return scopes
  }

  const sharesAScope = (md: string, a: string, b: string): boolean =>
    declaredScopes(md).some(scope => scope.includes(a) && scope.includes(b))

  it('does not put two cells of the SAME row in one inline scope', () => {
    const md = '| A | B |\n| --- | --- |\n| CELLA ` x | ` CELLB |\n'
    expect(
      sharesAScope(md, 'CELLA', 'CELLB'),
      'site: 1 <a href> — the backticks did not pair',
    ).toBe(false)
  })

  it('does not put cells of DIFFERENT rows in one inline scope', () => {
    const md = '| CELLA ` | B |\n| --- | --- |\n| CELLB | ` y |\n'
    expect(
      sharesAScope(md, 'CELLA', 'CELLB'),
      'site: 1 <a href> — the backticks did not pair',
    ).toBe(false)
  })

  it('still puts two lines of ONE paragraph in one inline scope', () => {
    const md = 'Cost is CELLA ` wide.\nSee CELLB ` end\n'
    expect(sharesAScope(md, 'CELLA', 'CELLB'), 'site: 0 <a href> — the backticks paired').toBe(true)
  })

  it('still puts a lazy continuation in its block quote paragraph scope', () => {
    const md = '> Cost is CELLA ` wide.\nSee CELLB ` end\n'
    expect(sharesAScope(md, 'CELLA', 'CELLB'), 'site: 0 <a href> — the backticks paired').toBe(true)
  })
})
