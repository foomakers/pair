import { describe, it, expect } from 'vitest'
import { readMarkdown, isSetextUnderline } from '@pair/content-ops/markdown/commonmark-blocks'
import { isBlockStructureSensitive } from './anchor-oracle-selection'

/**
 * The oracle's SELECTION predicate. Its whole contract is that it decides WITHOUT the
 * reader: a predicate computed with the reader under test admits a file only if the
 * reader already recognises the structure the sweep exists to verify, so a shape the
 * reader mis-parses is excluded — and the phantom anchor inside it ships PASS.
 */
describe('isBlockStructureSensitive', () => {
  const SELECTED: ReadonlyArray<readonly [string, string]> = [
    ['an ATX heading in a list item', '- # In List\n'],
    ['an ATX heading in an ordered list item', '1. # In List\n'],
    ['an ATX heading in a block quote', '> # Quoted\n'],
    ['an HTML block', '# Doc\n\n<div>\n## InDiv\n</div>\n'],
    ['an HTML comment', '<!-- x -->\n'],
    ['a multi-line setext heading', 'a\nb\n---\n'],
    ['a single-line setext heading', 'Para\n===\n'],
    ['an indented raw-HTML line', '   <div>\n'],
  ]

  for (const [why, body] of SELECTED) {
    it(`selects ${why}`, () => {
      expect(isBlockStructureSensitive(body), why).toBe(true)
    })
  }

  const SKIPPED: ReadonlyArray<readonly [string, string]> = [
    ['a plain ATX-only file', '# Doc\n\n## Real\n\ntext\n'],
    ['a fenced code block with no HTML or underline', '# Doc\n\n```bash\nls -la\n```\n'],
    ['a table (its separator is not a setext underline)', '# Doc\n\n| a | b |\n| --- | --- |\n'],
    ['a 4-space-indented raw-HTML line (indented code)', '# Doc\n\n    <div>\n'],
  ]

  for (const [why, body] of SKIPPED) {
    it(`skips ${why}`, () => {
      expect(isBlockStructureSensitive(body), why).toBe(false)
    })
  }

  /**
   * The rows that PROVE reader-independence: each is selected, and each is a shape the
   * previous reader-computed predicate returned false for. Both halves are asserted —
   * the second half through the real reader, so the row cannot rot into a tautology.
   */
  it('selects a raw-HTML line the reader opens NO html block for', () => {
    const body = '# Doc\n\n<a href="x">y</a>\n\n## Real\n'
    expect([...readMarkdown(body)].some(ev => ev.kind === 'html-open')).toBe(false)
    expect(isBlockStructureSensitive(body)).toBe(true)
  })

  it('selects a SINGLE-line setext heading, which the reader reports as paragraph 1', () => {
    const body = 'Para\n---\n'
    const multiLine = [...readMarkdown(body)].some(
      ev => ev.kind === 'leaf' && ev.paragraph.length > 1 && isSetextUnderline(ev.text),
    )
    expect(multiLine).toBe(false)
    expect(isBlockStructureSensitive(body)).toBe(true)
  })
})
