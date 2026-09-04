/**
 * WHICH files the github-anchor oracle records — the selection predicate for
 * `lib/github-anchor-oracle.json`, kept in `lib/` (not in the script that runs it) so
 * it is unit-tested production logic and the corpus test can assert against the SAME
 * predicate the generator used.
 *
 * It is deliberately SYNTACTIC — it never calls `readMarkdown`. Computing the selection
 * with the reader under test is the `#indiv` defect re-armed one layer up: a file is
 * admitted only if the reader already recognises the structure the sweep exists to
 * verify, so a type-6/7 tag shape `HTML_STARTS` happens to miss emits no `html-open`,
 * the file is EXCLUDED, and the phantom anchor inside that block ships PASS while
 * 404-ing for every reader. The blind spot would decide which files can expose it.
 *
 * Over-inclusive on purpose. Over-selection costs one `gh api` call per extra file at
 * regeneration time; under-selection costs a silent hole.
 */

/** An ATX heading inside a list item — the shape five CHANGELOGs in this repo ship. */
const LIST_ITEM_HEADING = /^ *(?:[-*+]|\d{1,9}[.)]) +#{1,6} /m
/** An ATX heading inside a block quote. */
const BLOCKQUOTE_HEADING = /^ *> *#{1,6} /m
/** ANY line that could open a raw-HTML block (§ 4.6) — not only the ones we parse. */
const CANDIDATE_HTML_LINE = /^ {0,3}</m
/** ANY setext underline shape, whether or not a paragraph is open above it. */
const CANDIDATE_SETEXT_UNDERLINE = /^ {0,3}(?:=+|-+)[ \t]*$/m

export const ORACLE_SELECTION_SIGNALS: ReadonlyArray<{
  readonly name: string
  readonly re: RegExp
}> = [
  { name: 'list-item heading', re: LIST_ITEM_HEADING },
  { name: 'blockquote heading', re: BLOCKQUOTE_HEADING },
  { name: 'candidate raw-HTML line', re: CANDIDATE_HTML_LINE },
  { name: 'candidate setext underline', re: CANDIDATE_SETEXT_UNDERLINE },
]

/**
 * Does this file BODY (frontmatter already stripped) carry a shape whose anchors depend
 * on block structure? One of the four signals above is enough.
 */
export function isBlockStructureSensitive(body: string): boolean {
  return ORACLE_SELECTION_SIGNALS.some(s => s.re.test(body))
}
