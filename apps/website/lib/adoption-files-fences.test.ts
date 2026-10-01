import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import remarkGfm from 'remark-gfm'
import remarkParse from 'remark-parse'
import { unified } from 'unified'
import { toString as mdastToString } from 'mdast-util-to-string'
import type { Code, Heading, Root, RootContent } from 'mdast'

// PR #525 analysis §6: the `## Autonomy` example was inserted INSIDE the open ```text fence of the
// `## Stop Predicate` example, so the page renders the Autonomy example as text holding a literal
// ```markdown, turns `## Stop Predicate` into a real page heading, and swallows the Max Parallelism
// example into an unlabelled block. Parsed with the same remark-parse + remark-gfm the docs gate uses.

const PAGE = resolve(__dirname, '../content/docs/concepts/adoption-files.mdx')
const FRONTMATTER_RE = /^---\n[\s\S]*?\n---\n/
const FENCE_LINE = /^ {0,3}(`{3,}|~{3,})(.*)$/

// The automation.md sections the page documents with a fenced example, each opening with its heading.
const AUTOMATION_SECTIONS = [
  'Eligibility',
  'Auto-Advance',
  'Autonomy',
  'Stop Predicate',
  'Max Parallelism',
  'Audit Location',
  'Workflows',
]

const source = readFileSync(PAGE, 'utf8')
const body = source.replace(FRONTMATTER_RE, '')
const lines = body.split('\n')
const tree = unified().use(remarkParse).use(remarkGfm).parse(body) as Root

function walk(node: Root | RootContent, out: RootContent[] = []): RootContent[] {
  if (node.type !== 'root') out.push(node)
  if ('children' in node) for (const c of node.children) walk(c as RootContent, out)
  return out
}
const nodes = walk(tree)
const codes = nodes.filter((n): n is Code => n.type === 'code')
const headings = nodes.filter((n): n is Heading => n.type === 'heading')
const firstLine = (c: Code) => c.value.split('\n')[0]?.trim() ?? ''

describe('adoption-files.mdx — every fenced example opens and closes', () => {
  const lineAt = (n: number | undefined) => lines[(n ?? 1) - 1] ?? ''
  const isClosed = (c: Code) => {
    const marker = FENCE_LINE.exec(lineAt(c.position?.start.line))?.[1] ?? '```'
    const closer = new RegExp(`^ {0,3}${marker[0]}{${marker.length},}\\s*$`)
    return (
      c.position?.start.line !== c.position?.end.line && closer.test(lineAt(c.position?.end.line))
    )
  }

  it('F-1: every fenced code block is closed by its own fence (none runs to the end of the page)', () => {
    const unclosed = codes
      .filter(c => FENCE_LINE.test(lineAt(c.position?.start.line)))
      .filter(c => !isClosed(c))
      .map(c => `L${c.position?.start.line}`)
    expect(unclosed).toEqual([])
  })

  it('F-2: no fenced block contains another fence opener (no example nested inside another)', () => {
    const nested = codes
      .filter(c => c.value.split('\n').some(l => FENCE_LINE.test(l)))
      .map(c => `L${c.position?.start.line}: ${firstLine(c)}`)
    expect(nested).toEqual([])
  })

  it('F-3: every fence line on the page is consumed by a code block, and the openers pair up with closers', () => {
    const fenceLines = lines.map((l, i) => (FENCE_LINE.test(l) ? i + 1 : 0)).filter(Boolean)
    const consumed = new Set(codes.flatMap(c => [c.position?.start.line, c.position?.end.line]))
    expect(fenceLines.filter(n => !consumed.has(n))).toEqual([])
    expect(fenceLines.length).toBe(codes.length * 2)
  })

  it('F-4: every fenced example on the page carries a language (an unlabelled block is a swallowed example)', () => {
    expect(
      codes.filter(c => !c.lang).map(c => `L${c.position?.start.line}: ${firstLine(c)}`),
    ).toEqual([])
  })
})

describe('adoption-files.mdx — the automation.md examples render as code', () => {
  it.each(AUTOMATION_SECTIONS)(
    'E: the `## %s` example sits in its own fenced block, starting with the heading',
    name => {
      const blocks = codes.filter(c => firstLine(c) === `## ${name}`)
      expect(blocks.map(c => c.value.split('\n').filter(l => /^##\s/.test(l)))).toEqual([
        [`## ${name}`],
      ])
    },
  )

  it.each(AUTOMATION_SECTIONS)('H: `## %s` never leaks out as a page heading', name => {
    expect(
      headings
        .filter(h => mdastToString(h).trim() === name)
        .map(h => `h${h.depth} L${h.position?.start.line}`),
    ).toEqual([])
  })

  it('C: control — the page headings around the examples are still the expected ones', () => {
    const h3 = headings.filter(h => h.depth === 3).map(h => mdastToString(h))
    expect(h3).toEqual(expect.arrayContaining(['context-map.md', 'automation.md']))
  })
})
