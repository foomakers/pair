/**
 * Regenerates `lib/github-anchor-oracle.json` — the committed answers of the ONLY
 * authority for a heading anchor: github.com's own renderer.
 *
 * For every git-tracked `*.md`/`*.mdx` carrying a shape this gate's block reader has to
 * get right (a heading inside a list item or a blockquote, an HTML block, a setext
 * underline), it posts the file BODY — frontmatter stripped, exactly as
 * `collectHeadingSlugs` reads it, because the `/markdown` endpoint has no frontmatter
 * mode — and records every `id="user-content-…"` / `name="user-content-…"` it gets back,
 * in document order. Both attributes: github rewrites an explicit `<a name="x">` that
 * way too, and a browser still resolves `#x` to it.
 *
 * Run: `pnpm --filter @pair/website docs:anchor-oracle` (needs `gh` authenticated).
 * ~1 call per file; the fixture is keyed by content hash, so re-running after a docs
 * edit only refreshes the rows that moved.
 */
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  readMarkdown,
  isSetextUnderline,
  stripFrontmatter,
} from '@pair/content-ops/markdown/commonmark-blocks'

const REPO_ROOT = resolve(import.meta.dirname, '../../..')
const OUT = resolve(import.meta.dirname, '../lib/github-anchor-oracle.json')

const LIST_ITEM_HEADING = /^ *(?:[-*+]|\d{1,9}[.)]) +#{1,6} /m
const BLOCKQUOTE_HEADING = /^ *> *#{1,6} /m

/**
 * Does this file's anchor set actually DEPEND on the rules a document-level-only reader
 * lacks? Recording every markdown file would make the fixture mostly noise; recording
 * these keeps it to the files that can regress. Three shapes qualify: a heading inside a
 * list item or a blockquote, an HTML block (which anchors nothing it contains), and a
 * MULTI-LINE setext heading (whose text is the whole paragraph, not the last line).
 */
function isBlockStructureSensitive(body: string): boolean {
  if (LIST_ITEM_HEADING.test(body) || BLOCKQUOTE_HEADING.test(body)) return true
  for (const ev of readMarkdown(body)) {
    if (ev.kind === 'html-open') return true
    if (ev.kind === 'leaf' && ev.paragraph.length > 1 && isSetextUnderline(ev.text)) return true
  }
  return false
}

function anchorsOf(body: string): string[] {
  const html = execFileSync('gh', ['api', '-X', 'POST', '/markdown', '--input', '-'], {
    input: JSON.stringify({ text: body }),
    encoding: 'utf-8',
    maxBuffer: 64 * 1024 * 1024,
  })
  return [...html.matchAll(/(?:id|name)="user-content-([^"]*)"/g)].map(m => m[1] ?? '')
}

const files = execFileSync('git', ['ls-files', '*.md', '*.mdx'], {
  cwd: REPO_ROOT,
  encoding: 'utf-8',
  maxBuffer: 32 * 1024 * 1024,
})
  .split('\n')
  .filter(Boolean)

const out: Record<string, { sha1: string; anchors: string[] }> = {}
for (const file of files) {
  const body = stripFrontmatter(readFileSync(resolve(REPO_ROOT, file), 'utf-8'))
  if (!isBlockStructureSensitive(body)) continue
  out[file] = {
    sha1: createHash('sha1').update(body).digest('hex'),
    anchors: anchorsOf(body),
  }
  process.stderr.write('.')
}
writeFileSync(
  OUT,
  `${JSON.stringify(
    {
      $comment:
        "github.com's own anchors, per file body (frontmatter stripped). Regenerate with `pnpm --filter @pair/website docs:anchor-oracle`. Keyed by sha1 of that body: an edited file drops out of the assertion instead of failing on a stale expectation.",
      files: out,
    },
    null,
    2,
  )}\n`,
)
process.stderr.write(`\n${Object.keys(out).length} files recorded -> ${OUT}\n`)
