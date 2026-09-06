import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  readMarkdown,
  isSetextUnderline,
  stripFrontmatter,
} from '@pair/content-ops/markdown/commonmark-blocks'
import { isBlockStructureSensitive } from './anchor-oracle-selection'
import { collectHeadingSlugs } from './docs-staleness-check'

const REPO_ROOT = resolve(__dirname, '../../..')

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
    // FENCE STATE. An anchor set can depend on nothing but fence parity — a
    // heading-shaped line inside a fence is code, outside it is an anchor — and the
    // four signals above see none of it, so the corpus sweep that exists to catch a
    // fence-rule regression against github.com never receives the file. CommonMark
    // § 4.5: an opener is 3+ backticks or 3+ tildes, indented at most 3 spaces.
    ['a fenced code block with no HTML or underline', '# Doc\n\n```bash\nls -la\n```\n'],
    ['a backtick fence with no info string', '# Doc\n\n```\nls -la\n```\n'],
    ['a tilde fence', '# Doc\n\n~~~\nls -la\n~~~\n'],
    ['a fence of MORE than three backticks', '# Doc\n\n````text\n```\n````\n'],
    ['a 3-space-indented fence opener (still a fence)', '# Doc\n\n   ```bash\n   ls\n   ```\n'],
    ['a fence holding a heading-shaped line', '# Doc\n\n```md\n## Not A Heading\n```\n'],
  ]

  for (const [why, body] of SELECTED) {
    it(`selects ${why}`, () => {
      expect(isBlockStructureSensitive(body), why).toBe(true)
    })
  }

  const SKIPPED: ReadonlyArray<readonly [string, string]> = [
    ['a plain ATX-only file', '# Doc\n\n## Real\n\ntext\n'],
    // The boundary partners of a fence opener — each one byte or one space away from
    // a row above, and none of them a fence under § 4.5.
    ['a run of TWO backticks at line start (an inline span, not a fence)', '# Doc\n\n``x`` y\n'],
    ['a run of TWO tildes at line start (strikethrough, not a fence)', '# Doc\n\n~~x~~ y\n'],
    ['a 4-space-indented backtick run (indented code, not a fence opener)', '# Doc\n\n    ```\n'],
    ['a backtick run that does not start its line', '# Doc\n\nsee ```x``` here\n'],
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

  /**
   * THE FILE THE WIDENING WAS FOR, and it is still outside the sweep.
   *
   * `fastify.md` is the file ADR-024's own Context names as having served two phantom
   * anchors — `#request-lifecycle-management` and `#validation-and-schema-design` — and
   * swallowed two real headings, in BOTH knowledge-base roots, because an info-string
   * bearing ```` ```typescript ```` line was read as CLOSING an open fence. Its anchor
   * set therefore depends on nothing but FENCE state, and it scores false on all four
   * signals, so it is absent from `github-anchor-oracle.json` and the corpus sweep — the
   * mechanism that exists to catch exactly this against github.com — cannot see it.
   *
   * MEASURED at HEAD 965a60f2:
   *   isBlockStructureSensitive(body)                          -> false (all 4 signals false)
   *   Object.keys(oracle.files).length                         -> 398, fastify.md NOT a key
   *   grep -cE '^#{1,6} ' fastify.md                           -> 38 ATX-shaped lines
   *   gh api -X POST /markdown, (id|name)="user-content-…"     -> 30 anchors
   * The 38-vs-30 gap IS the fence dependence: lines 95 (`## Request Lifecycle
   * Management`) and 97 (`### Validation and Schema Design`) sit inside the fence opened
   * at line 93, and github serves neither slug.
   */
  const FENCE_SENSITIVE_FILE =
    '.pair/knowledge/guidelines/code-design/framework-patterns/fastify.md'

  it('selects the fence-sensitive file ADR-024 was written about', () => {
    const src = readFileSync(resolve(REPO_ROOT, FENCE_SENSITIVE_FILE), 'utf-8')
    const body = stripFrontmatter(src)
    // Its anchor set really does turn on fence state: more ATX-shaped lines than the
    // anchors github serves, and the difference is what the fences swallow.
    const atxShaped = body.split('\n').filter(l => /^#{1,6} /.test(l)).length
    expect(collectHeadingSlugs(src).size, 'anchors vs ATX-shaped lines').toBeLessThan(atxShaped)
    expect(isBlockStructureSensitive(body), FENCE_SENSITIVE_FILE).toBe(true)
  })
})
