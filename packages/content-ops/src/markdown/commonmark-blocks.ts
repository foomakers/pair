/**
 * CommonMark BLOCK STRUCTURE — the one line reader every gate in this repo shares.
 *
 * Two gates need to know which source lines github.com actually renders as markdown:
 * `apps/website/lib/docs-staleness-check.ts` (which lines can carry a heading anchor)
 * and `packages/knowledge-hub/src/conformance/code-host-routing.test.ts` (which lines
 * are a copy-paste ```markdown surface). They used to implement the grammar twice, at
 * two fidelities, and the cost was measured, not theoretical: the "a ```bash line does
 * not close an open ```markdown block" defect was found and fixed in the conformance
 * helper, then had to be found AGAIN in the production gate — where it was serving two
 * phantom anchors and swallowing two real headings in `framework-patterns/fastify.md`.
 * The round after that added container awareness to the helper only, and the gate kept
 * disagreeing with github.com in BOTH directions (a live
 * `apps/pair-cli/CHANGELOG.md#release-v020---enhanced-cli-distribution--documentation`
 * called dead, a dead `#indiv` inside a `<div>` called live). One module, one grammar,
 * one fix.
 *
 * GROUND TRUTH for every rule below is github.com's own renderer, never a reading of
 * the spec: `jq -Rs '{text:.}' f.md > f.json; gh api -X POST /markdown --input f.json`,
 * read as `id="user-content-…"` / `name="user-content-…"` in document order for
 * anchors and as `highlight-text-md` <pre> blocks for fences. The row tables in
 * `commonmark-blocks.rows.ts` carry that output verbatim and are exercised from BOTH
 * consumers' suites, so deleting a rule here reddens both.
 *
 * WHAT IS MODELLED: fenced code blocks (§ 4.5), HTML blocks (§ 4.6, all 7 types),
 * block quotes (§ 5.1), list items and their content columns (§ 5.2), indented code
 * (§ 4.4), tab stops (§ 2.2), paragraph continuation and laziness (§ 4.8/§ 5.1) —
 * enough to answer "is this line rendered markdown, and at what indentation". Inline
 * parsing is NOT here: what a heading's text MEANS is the caller's business.
 */

const TAB_STOP = 4

/** A fence marker line: 3+ backticks/tildes, its indent and its info string (§ 4.5). */
const FENCE_LINE_RE = /^( *)(`{3,}|~{3,})[ \t]*(.*)$/
const BLOCKQUOTE_MARKER_RE = /^ {0,3}>/
const LIST_MARKER_RE = /^( *)([-*+]|\d{1,9}[.)])([ \t]+)(?=\S)/

/**
 * May this list marker interrupt an OPEN paragraph? A bullet always may; an ORDERED
 * item only when its start number is 1 (CommonMark § 5.3), and the number is read as a
 * NUMBER — `01.` is 1 and interrupts.
 *
 * github.com's own answers, one probe per shape: `Some para` / `2. item` / `---`
 * anchors `some-para2-item` (the marker line stayed paragraph text, and the `---`
 * underlined BOTH lines), while `Some para` / `1. item` / `---` anchors nothing (the
 * item opened and the `---` closed it). Opening the list anyway made the gate report a
 * live `<file>.md#some-para2-item` as `Dead anchor … no heading in that file slugs to
 * it`, and made the `# Not Heading` on such a line a PHANTOM anchor.
 *
 * The rule is per CONTAINER, not per document: it applies to the paragraph open in the
 * containers this line MATCHED. A lazy line is therefore not the refusing case —
 * `> Para` / `2. item` / `> ---` opens the list on github.com, because the blockquote's
 * paragraph is not the matched container (see `continuesParagraph`).
 */
function interruptsParagraph(marker: string): boolean {
  return !/^\d/.test(marker) || parseInt(marker.slice(0, -1), 10) === 1
}

/** `## X`, optional closing `#`s. `#NoSpace`, `#` alone and `####### 7` are NOT headings. */
const ATX_HEADING_RE = /^ {0,3}#{1,6}\s+(.*?)\s*#*\s*$/
/** `===`/`---` alone on a line — a setext underline ONLY over an open paragraph. */
const SETEXT_UNDERLINE_RE = /^ {0,3}(?:=+|-+)[ \t]*$/
const THEMATIC_BREAK_RE = /^ {0,3}(?:(?:\*[ \t]*){3,}|(?:-[ \t]*){3,}|(?:_[ \t]*){3,})$/

/** The heading TEXT a line carries, if it is an ATX heading at all. */
export function atxHeadingText(line: string): string | undefined {
  return ATX_HEADING_RE.exec(line)?.[1]
}

/** Is this line the `===`/`---` UNDERLINE shape? (Whether it heads anything is context.) */
export function isSetextUnderline(line: string): boolean {
  return SETEXT_UNDERLINE_RE.test(line)
}

/** § 4.6 raw-text tags: their content is not markdown, and the block ends at `</tag>`. */
const HTML_RAW_TAGS = 'script|pre|style|textarea'

/**
 * § 4.6 type-6 block tags — the list is the spec's, verbatim. A line opening (or
 * closing) one of these starts an HTML block that runs to the next BLANK line, and
 * everything in it is raw HTML: `<div>\n## InDiv\n</div>` serves NO `#indiv` anchor on
 * github.com, and a citation to one 404s for every reader.
 */
const HTML_BLOCK_TAGS = [
  'address',
  'article',
  'aside',
  'base',
  'basefont',
  'blockquote',
  'body',
  'caption',
  'center',
  'col',
  'colgroup',
  'dd',
  'details',
  'dialog',
  'dir',
  'div',
  'dl',
  'dt',
  'fieldset',
  'figcaption',
  'figure',
  'footer',
  'form',
  'frame',
  'frameset',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'head',
  'header',
  'hr',
  'html',
  'iframe',
  'legend',
  'li',
  'link',
  'main',
  'menu',
  'menuitem',
  'nav',
  'noframes',
  'ol',
  'optgroup',
  'option',
  'p',
  'param',
  'search',
  'section',
  'summary',
  'table',
  'tbody',
  'td',
  'tfoot',
  'th',
  'thead',
  'title',
  'tr',
  'track',
  'ul',
].join('|')

const HTML_ATTR = `[a-zA-Z_:][a-zA-Z0-9_.:-]*(?:[ \\t]*=[ \\t]*(?:[^ \\t"'=<>\`]+|'[^']*'|"[^"]*"))?`
const HTML_OPEN_TAG = `<[a-zA-Z][a-zA-Z0-9-]*(?:[ \\t]+${HTML_ATTR})*[ \\t]*/?>`
const HTML_CLOSE_TAG = `</[a-zA-Z][a-zA-Z0-9-]*[ \\t]*>`

/**
 * The seven § 4.6 HTML block starts, in the spec's precedence order, each with the end
 * condition that closes it (`null` = the next blank line).
 *
 * Type 7 is the only one that CANNOT interrupt an open paragraph — `Some text\n<span>`
 * is one paragraph on github.com, so the `## After Span` under it is still a heading,
 * while a bare `<span>` after a blank line swallows it.
 */
const HTML_STARTS: ReadonlyArray<{ kind: number; open: RegExp; end: RegExp | null }> = [
  {
    kind: 1,
    open: new RegExp(`^ {0,3}<(?:${HTML_RAW_TAGS})(?:[ \\t]|>|$)`, 'i'),
    end: new RegExp(`</(?:${HTML_RAW_TAGS})>`, 'i'),
  },
  { kind: 2, open: /^ {0,3}<!--/, end: /-->/ },
  { kind: 3, open: /^ {0,3}<\?/, end: /\?>/ },
  { kind: 4, open: /^ {0,3}<![A-Za-z]/, end: />/ },
  { kind: 5, open: /^ {0,3}<!\[CDATA\[/, end: /\]\]>/ },
  { kind: 6, open: new RegExp(`^ {0,3}</?(?:${HTML_BLOCK_TAGS})(?:[ \\t]|/?>|$)`, 'i'), end: null },
  { kind: 7, open: new RegExp(`^ {0,3}(?:${HTML_OPEN_TAG}|${HTML_CLOSE_TAG})[ \\t]*$`), end: null },
]

/**
 * The HTML block this line opens, if any. `paragraphOpen` suppresses type 7 only.
 * Note `<a name="x"></a>` is NOT type 7 (an open tag followed by a closing one is not
 * "a complete tag alone on the line"), which is why an explicit anchor written that way
 * stays an ordinary paragraph — and github.com does serve its anchor.
 */
function htmlStartOf(
  line: string,
  paragraphOpen: boolean,
): { kind: number; end: RegExp | null } | undefined {
  for (const start of HTML_STARTS) {
    if (start.kind === 7 && paragraphOpen) continue
    if (start.open.test(line)) return { kind: start.kind, end: start.end }
  }
  return undefined
}

/**
 * HTML block kinds whose content github.com still renders as HTML, so an explicit
 * `<a name>`/`<a id>` inside them IS a live anchor. Probed one by one:
 * `<script>`/`<pre>` (kind 1) and `<div>` (kind 6) all serve
 * `name="user-content-…"`; an anchor inside `<!-- … -->` (kind 2) serves nothing.
 * Kinds 3/4/5 (processing instruction, declaration, CDATA) are not rendered either.
 */
export const HTML_KINDS_RENDERING_ANCHORS: ReadonlySet<number> = new Set([1, 6, 7])

/**
 * The leading whitespace run rewritten as spaces, tabs advancing to the next 4-column
 * stop from `col` (§ 2.2). Only the run: a tab INSIDE the line is content.
 */
function expandLeading(line: string, col: number): string {
  let out = ''
  let c = col
  let i = 0
  for (; i < line.length; i++) {
    const ch = line[i]
    if (ch === ' ') {
      out += ' '
      c += 1
    } else if (ch === '\t') {
      const width = TAB_STOP - (c % TAB_STOP)
      out += ' '.repeat(width)
      c += width
    } else break
  }
  return out + line.slice(i)
}

/** Drop `n` columns of leading whitespace, splitting a tab that straddles the cut. */
function dropColumns(line: string, n: number, col: number): string {
  let c = col
  let i = 0
  while (i < line.length && c < col + n) {
    const ch = line[i]
    if (ch === ' ') {
      c += 1
      i += 1
    } else if (ch === '\t') {
      const next = c + (TAB_STOP - (c % TAB_STOP))
      if (next > col + n) return ' '.repeat(next - (col + n)) + line.slice(i + 1)
      c = next
      i += 1
    } else break
  }
  return line.slice(i)
}

function indentOf(line: string): number {
  return (/^( *)/.exec(line)?.[1] ?? '').length
}

type FenceMarker = { indent: number; run: string; info: string }

/** The fence run + info string a line carries, if it is a fence marker line at all. */
function fenceMarkerOf(line: string): FenceMarker | undefined {
  const m = FENCE_LINE_RE.exec(line)
  return m?.[2] === undefined
    ? undefined
    : { indent: (m[1] ?? '').length, run: m[2], info: m[3] ?? '' }
}

type OpenFence = { char: string; run: number; info: string; dedent: number }

/**
 * Does this marker CLOSE the open fence? Same char, at least as long, NO info string.
 * Reading the run alone gets it wrong in the direction that ships: `` ```bash `` inside
 * an open ```markdown block was read as a closer, so every heading below it entered the
 * anchor set as a slug github.com does not serve.
 */
function closesFence(open: OpenFence, marker: FenceMarker | undefined): boolean {
  return (
    marker !== undefined &&
    marker.indent <= 3 &&
    marker.run[0] === open.char &&
    marker.run.length >= open.run &&
    marker.info.trim() === ''
  )
}

/**
 * The fence this marker OPENS — none for a backtick fence whose info string carries a
 * backtick (the line is ordinary prose), none for a marker indented 4+ past its
 * container's content column (that is an indented code block).
 */
function opensFence(marker: FenceMarker | undefined): OpenFence | undefined {
  if (marker === undefined || marker.indent > 3) return undefined
  const char = marker.run[0] ?? '`'
  if (char === '`' && marker.info.includes('`')) return undefined
  return { char, run: marker.run.length, info: marker.info, dedent: marker.indent }
}

/** An open container: a block quote, or a list item and the COLUMN its content sits at. */
type Container = { kind: 'quote' } | { kind: 'list'; content: number }

/**
 * Where a list item's marker leaves the text: the column the remainder sits at, and the
 * item's CONTENT column — the same number, unless 5+ columns of whitespace follow the
 * marker, which starts an indented code block inside an item whose content is one
 * column past the marker (§ 5.2).
 */
function listColumns(m: RegExpExecArray, col: number): { column: number; content: number } {
  const afterMarker = (m[1] ?? '').length + (m[2] ?? '').length
  let column = afterMarker
  for (const ch of m[3] ?? ' ') column += ch === '\t' ? TAB_STOP - ((col + column) % TAB_STOP) : 1
  return { column, content: column - afterMarker > 4 ? afterMarker + 1 : column }
}

type Peel = { rest: string; col: number; matched: number }

/**
 * Match the ALREADY-OPEN containers against this line, innermost last. Returns how many
 * matched, and where in the line their prefixes end. A container that fails to match is
 * closed by the caller — which is exactly how "a line left of the list content column
 * ends the item, and with it the fence inside it" is enforced.
 *
 * A BLANK line matches a list item (an item may contain blank lines) but not a block
 * quote (a blank line ends the quote, and with it any fence inside it).
 */
function matchContainers(raw: string, stack: readonly Container[]): Peel {
  let rest = raw
  let col = 0
  let i = 0
  for (; i < stack.length; i++) {
    const c = stack[i]
    if (c === undefined) break
    const expanded = expandLeading(rest, col)
    if (c.kind === 'quote') {
      const m = BLOCKQUOTE_MARKER_RE.exec(expanded)
      if (m === null) break
      col += m[0].length
      // ...plus the ONE optional space that may follow the marker; a tab there is worth
      // one column of its width, the rest of it stays as content indentation.
      const after = expandLeading(expanded.slice(m[0].length), col)
      const space = after.startsWith(' ') ? 1 : 0
      rest = after.slice(space)
      col += space
    } else {
      if (expanded.trim() === '') {
        rest = expanded
        continue
      }
      const need = c.content - col
      if (indentOf(expanded) < need) break
      // Dropped from the RAW remainder, not the expanded one, so a tab INSIDE the
      // content survives: `-\ta` + `\t\t# H` keeps the second tab as body.
      rest = dropColumns(rest, need, col)
      col = c.content
    }
  }
  return { rest, col, matched: i }
}

/**
 * Open every container this line STARTS, interleaved: `- > ## Quoted In List` is a list
 * item holding a block quote holding a heading, and peeling only one kind (or peeling
 * quotes before lists, once) misses it. github.com anchors that heading.
 */
function openContainers(peel: Peel, stack: Container[], paragraphOpen: boolean): Peel {
  let { rest, col } = peel
  let opened = false
  // Opening ANY container closes the paragraph that was open outside it, so only the
  // FIRST marker on the line can be the one interrupting a paragraph: `Some para` /
  // `> 2. item` / `> ---` anchors nothing on github.com — the `>` interrupts, and the
  // `2.` then opens its item inside a quote holding no paragraph.
  let paraOpen = paragraphOpen
  for (;;) {
    const expanded = expandLeading(rest, col)
    const qm = BLOCKQUOTE_MARKER_RE.exec(expanded)
    if (qm !== null) {
      col += qm[0].length
      const after = expandLeading(expanded.slice(qm[0].length), col)
      const space = after.startsWith(' ') ? 1 : 0
      rest = after.slice(space)
      col += space
      stack.push({ kind: 'quote' })
      opened = true
      paraOpen = false
      continue
    }
    const lm = LIST_MARKER_RE.exec(expanded)
    if (lm !== null && indentOf(expanded) <= 3 && (!paraOpen || interruptsParagraph(lm[2] ?? ''))) {
      const { column, content } = listColumns(lm, col)
      rest = ' '.repeat(column - content) + expanded.slice(lm[0].length)
      col += content
      stack.push({ kind: 'list', content: col })
      opened = true
      paraOpen = false
      continue
    }
    return { rest, col, matched: opened ? -1 : peel.matched }
  }
}

/**
 * One rendered source line. `text` is the line with every container prefix peeled and
 * its leading tabs expanded — so `- # H`, `> # H` and `# H` all read as `# H`, which is
 * what github.com anchors. Fence bodies keep their own bytes minus the columns the
 * opener was indented by (§ 4.5), tabs included.
 */
export type MarkdownEvent =
  | { kind: 'fence-open'; index: number; raw: string; text: string; info: string }
  | { kind: 'fence-body'; index: number; raw: string; text: string }
  | { kind: 'fence-end'; index: number }
  | { kind: 'html-open'; index: number; raw: string; text: string; htmlKind: number }
  | { kind: 'html-body'; index: number; raw: string; text: string; htmlKind: number }
  | { kind: 'html-end'; index: number }
  | {
      kind: 'leaf'
      index: number
      raw: string
      text: string
      /** The open paragraph's lines BEFORE this one — the setext heading's text. */
      paragraph: readonly string[]
      /** An indented code block (§ 4.4): renders as code, anchors nothing. */
      indentedCode: boolean
      /**
       * Does this line BEGIN a leaf block, rather than continue the one before it?
       *
       * Not derivable from `paragraph.length`: the accumulator is reset AFTER the line
       * that ends the paragraph is emitted, so an ATX heading tight against a paragraph
       * carries a NON-empty `paragraph` on its own line while being a separate block.
       * A consumer that groups leaves by block MUST read this field — grouping by the
       * accumulator merges the two, measured as a silent false green in the docs link
       * gate (ADL 2026-09-04).
       */
      blockStart: boolean
    }

export interface ReadMarkdownOptions {
  /** Skip a leading `---` YAML frontmatter block. Off by default. */
  readonly frontmatter?: boolean
  /**
   * MDX flavour: § 4.6 HTML blocks and § 4.4 indented code blocks DO NOT EXIST.
   *
   * Not a preference — measured on the real renderer. A page built with
   * `pnpm --filter @pair/website build` and read back out of the prerendered
   * `.next/server/app/docs/<page>.html`:
   *
   * | source                                | fumadocs/MDX      | github.com     |
   * | ------------------------------------- | ----------------- | -------------- |
   * | a 4-space-indented URL                | `<a href>` (live) | code, no link  |
   * | a bare URL inside `<div>` / `<pre>`   | `<a href>` (live) | live / no link |
   * | a code span inside `<div>`            | code, no link     | LIVE           |
   * | a ```` ```bash ```` fence inside `<div>` | code, no link  | LIVE           |
   *
   * i.e. MDX parses JSX children as ordinary markdown (so a code span stays a code span
   * and a fence stays a fence inside them) and gives indentation to JSX instead of to
   * code blocks. Reading an `.mdx` page with the CommonMark rules is therefore wrong in
   * BOTH directions at once.
   *
   * Scope: block CLASSIFICATION only. Fences, containers and paragraph laziness are
   * unchanged, and an `<!-- … -->` line becomes ordinary text — a page carrying one
   * cannot build at all ("Unexpected character `!` … use `{/* text *\/}`"), so no
   * consumer can be misled by it.
   */
  readonly mdx?: boolean
}

/**
 * The markdown body, with a leading `---` YAML frontmatter block removed. Exported
 * because it is the input github.com's blob view actually renders (frontmatter is
 * lifted into a table, anchoring nothing) while the `/markdown` REST endpoint has no
 * frontmatter mode — so any oracle probe must strip it the SAME way this reader does,
 * or the two are not being asked the same question.
 */
export function stripFrontmatter(content: string): string {
  const lines = content.split(/\r?\n/)
  return lines.slice(bodyStart(lines)).join('\n')
}

/** Where the markdown body starts: after YAML frontmatter, if the file opens with it. */
function bodyStart(lines: readonly string[]): number {
  if (lines[0]?.trim() !== '---') return 0
  const close = lines.findIndex((l, i) => i > 0 && l.trim() === '---')
  return close > 0 ? close + 1 : 0
}

/**
 * Is this line a plain paragraph continuation? Only such a line may LAZILY omit its
 * container prefix: `> Para` / `line two` / `> ---` is one setext heading on
 * github.com (`#paraline-two`), while `Some para` / `- item` / `---` is none at all,
 * because the list marker starts a block and the `---` then closes the item.
 *
 * ANY list marker disqualifies a lazy line, an ordered one starting at 2 included —
 * `interruptsParagraph` does NOT apply here. github.com renders `> Para` / `2. item` /
 * `> ---` as a quote, then `<ol start="2">`, then a quoted `<hr>`: anchors nothing.
 * The interrupt rule is about the paragraph open in the containers a line MATCHED, and
 * a lazy line matched none.
 */
function continuesParagraph(text: string): boolean {
  return (
    text.trim() !== '' &&
    indentOf(text) < 4 &&
    atxHeadingText(text) === undefined &&
    !SETEXT_UNDERLINE_RE.test(text) &&
    !THEMATIC_BREAK_RE.test(text) &&
    fenceMarkerOf(text) === undefined &&
    BLOCKQUOTE_MARKER_RE.exec(text) === null &&
    LIST_MARKER_RE.exec(text) === null &&
    htmlStartOf(text, true) === undefined
  )
}

/** Everything the line loop carries from one line to the next. */
interface ReaderState {
  stack: Container[]
  fence: OpenFence | undefined
  html: { kind: number; end: RegExp | null } | undefined
  paragraph: string[]
  /** Was the leaf just emitted an indented-code line? Its block spans consecutive ones. */
  indented: boolean
  /** The MDX flavour flag, constant for the whole read — see `ReadMarkdownOptions`. */
  readonly mdx: boolean
}

/**
 * A line whose containers did NOT all match, read as a lazy paragraph continuation.
 * Returns whether it was one — only a plain paragraph line may omit its container
 * prefix, and only while a paragraph is open outside any fence or HTML block.
 */
function* readLazyLine(
  st: ReaderState,
  peel: Peel,
  raw: string,
  index: number,
): Generator<MarkdownEvent, boolean> {
  if (st.fence !== undefined || st.html !== undefined || st.paragraph.length === 0) return false
  const text = expandLeading(peel.rest, peel.col)
  if (!continuesParagraph(text)) return false
  // A lazy line is a paragraph continuation by construction — never a block start.
  yield {
    kind: 'leaf',
    index,
    raw,
    text,
    paragraph: [...st.paragraph],
    indentedCode: false,
    blockStart: false,
  }
  st.indented = false
  st.paragraph.push(text)
  return true
}

/**
 * Close the containers this line left, and with them any fence or HTML block inside
 * them — and the paragraph, which ends where its container does: `Some para` / `- item`
 * / `---` anchors NOTHING on github.com, because the `---` at column 0 closes the item
 * before it can underline `item`.
 */
function* closeContainers(st: ReaderState, peel: Peel, index: number): Generator<MarkdownEvent> {
  st.stack.length = peel.matched
  st.paragraph = []
  if (st.fence !== undefined) {
    yield { kind: 'fence-end', index }
    st.fence = undefined
  }
  if (st.html !== undefined) {
    yield { kind: 'html-end', index }
    st.html = undefined
  }
}

/** One line read from INSIDE an open fence: its closer, or its body (§ 4.5 dedent). */
function* readFenceLine(
  st: ReaderState,
  peel: Peel,
  raw: string,
  index: number,
): Generator<MarkdownEvent> {
  const fence = st.fence
  if (fence === undefined) return
  if (closesFence(fence, fenceMarkerOf(expandLeading(peel.rest, peel.col)))) {
    yield { kind: 'fence-end', index }
    st.fence = undefined
    return
  }
  yield { kind: 'fence-body', index, raw, text: dropColumns(peel.rest, fence.dedent, peel.col) }
}

/**
 * One line read from INSIDE an open HTML block. Returns whether the block consumed it:
 * a type-6/7 block ends at a BLANK line which is NOT part of it, so that line is handed
 * back and read outside.
 */
function* readHtmlLine(
  st: ReaderState,
  peel: Peel,
  raw: string,
  index: number,
): Generator<MarkdownEvent, boolean> {
  const html = st.html
  if (html === undefined) return false
  const text = expandLeading(peel.rest, peel.col)
  if (html.end === null && text.trim() === '') {
    yield { kind: 'html-end', index }
    st.html = undefined
    return false
  }
  yield { kind: 'html-body', index, raw, text, htmlKind: html.kind }
  if (html.end !== null && html.end.test(text)) {
    yield { kind: 'html-end', index }
    st.html = undefined
  }
  return true
}

/**
 * Does this line begin a new leaf block? Asked BEFORE the line is emitted, which is the
 * whole point: `advanceParagraph` runs after, so on an interrupting line the accumulator
 * still holds the paragraph that line ends.
 */
function startsLeafBlock(st: ReaderState, text: string): boolean {
  if (st.paragraph.length === 0) return true
  // A setext underline is the LAST line of the heading it underlines, not a new block.
  if (SETEXT_UNDERLINE_RE.test(text)) return false
  // Everything else that does not continue the paragraph interrupts it: a blank line, an
  // ATX heading, a thematic break. The heading is the only one that can carry a URL.
  return !continuesParagraph(text)
}

/** How the leaf line just emitted leaves the paragraph for the next one. */
function advanceParagraph(st: ReaderState, text: string): void {
  if (text.trim() === '' || atxHeadingText(text) !== undefined) st.paragraph = []
  else if (SETEXT_UNDERLINE_RE.test(text) || THEMATIC_BREAK_RE.test(text)) st.paragraph = []
  else st.paragraph.push(text)
}

/**
 * An indented code block (§ 4.4). Absent in the mdx flavour: MDX gives indentation to
 * JSX, so a 4-space-indented line there is ordinary content — a URL on one is LIVE.
 */
function isIndentedCode(st: ReaderState, text: string): boolean {
  return !st.mdx && text.trim() !== '' && indentOf(text) >= 4 && st.paragraph.length === 0
}

/**
 * Open the fence or HTML block this line starts, if it starts one. Returns whether it
 * did — the caller then emits nothing further for this line.
 */
function* openBlock(
  st: ReaderState,
  text: string,
  raw: string,
  index: number,
): Generator<MarkdownEvent, boolean> {
  if (text.trim() === '') return false
  const opened = opensFence(fenceMarkerOf(text))
  if (opened !== undefined) {
    st.fence = opened
    st.paragraph = []
    yield { kind: 'fence-open', index, raw, text, info: opened.info }
    return true
  }
  const htmlStart = st.mdx ? undefined : htmlStartOf(text, st.paragraph.length > 0)
  if (htmlStart === undefined) return false
  st.paragraph = []
  yield { kind: 'html-open', index, raw, text, htmlKind: htmlStart.kind }
  if (htmlStart.end !== null && htmlStart.end.test(text)) yield { kind: 'html-end', index }
  else st.html = htmlStart
  return true
}

/** One line read from OUTSIDE any fence or HTML block: it may open either, or neither. */
function* readOutsideLine(
  st: ReaderState,
  peeled: Peel,
  raw: string,
  index: number,
): Generator<MarkdownEvent> {
  const peel = openContainers(peeled, st.stack, st.paragraph.length > 0)
  if (peel.matched === -1) st.paragraph = []
  const text = expandLeading(peel.rest, peel.col)

  if (isIndentedCode(st, text)) {
    yield {
      kind: 'leaf',
      index,
      raw,
      text,
      paragraph: [],
      indentedCode: true,
      blockStart: !st.indented,
    }
    st.indented = true
    return
  }
  const blockStart = startsLeafBlock(st, text)
  if (yield* openBlock(st, text, raw, index)) {
    st.indented = false
    return
  }

  yield {
    kind: 'leaf',
    index,
    raw,
    text,
    paragraph: [...st.paragraph],
    indentedCode: false,
    blockStart,
  }
  st.indented = false
  advanceParagraph(st, text)
}

/** One source line, through the three-state machine. */
function* readLine(st: ReaderState, raw: string, index: number): Generator<MarkdownEvent> {
  const peel = matchContainers(raw, st.stack)
  if (peel.matched < st.stack.length) {
    if (yield* readLazyLine(st, peel, raw, index)) return
    yield* closeContainers(st, peel, index)
  }
  if (st.fence !== undefined) {
    yield* readFenceLine(st, peel, raw, index)
    return
  }
  if (st.html !== undefined && (yield* readHtmlLine(st, peel, raw, index))) return
  yield* readOutsideLine(st, peel, raw, index)
}

/**
 * Read `content` as CommonMark BLOCKS, one event per source line.
 *
 * A three-state machine — inside a fence, inside an HTML block, or outside both —
 * wrapped in the container matcher, because every one of those states can sit inside a
 * block quote or a list item and must end where its container does.
 */
export function* readMarkdown(
  content: string,
  options: ReadMarkdownOptions = {},
): Generator<MarkdownEvent> {
  const lines = content.split(/\r?\n/)
  if (lines[lines.length - 1] === '') lines.pop()
  const start = options.frontmatter === true ? bodyStart(lines) : 0
  const st: ReaderState = {
    stack: [],
    fence: undefined,
    html: undefined,
    paragraph: [],
    indented: false,
    mdx: options.mdx === true,
  }

  for (let index = start; index < lines.length; index++) {
    yield* readLine(st, lines[index] ?? '', index)
  }

  // EOF terminates an unclosed fence or HTML block, exactly as its container would.
  if (st.fence !== undefined) yield { kind: 'fence-end', index: lines.length }
  if (st.html !== undefined) yield { kind: 'html-end', index: lines.length }
}

/** A fenced code block: its info string and its body, dedented per § 4.5. */
export interface FencedBlock {
  readonly info: string
  readonly body: string
}

/**
 * Every fenced code block in `content` — the copy-paste surface itself. An unclosed
 * fence still counts (EOF terminates it), which is the half that matters: a real
 * snippet MISSED is the silent direction for the conformance sweep that consumes this.
 */
export function fencedBlocks(content: string, options: ReadMarkdownOptions = {}): FencedBlock[] {
  const blocks: FencedBlock[] = []
  let info: string | undefined
  let body: string[] = []
  for (const ev of readMarkdown(content, options)) {
    if (ev.kind === 'fence-open') {
      info = ev.info
      body = []
    } else if (ev.kind === 'fence-body') {
      body.push(ev.text)
    } else if (ev.kind === 'fence-end' && info !== undefined) {
      blocks.push({ info, body: body.map(l => `${l}\n`).join('') })
      info = undefined
      body = []
    }
  }
  return blocks
}
