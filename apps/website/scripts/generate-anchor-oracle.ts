/**
 * Regenerates `lib/github-anchor-oracle.json` — the committed answers of the ONLY
 * authority for a heading anchor: github.com's own renderer.
 *
 * For every git-tracked `*.md`/`*.mdx` carrying a shape this gate's block reader has to
 * get right — the SYNTACTIC signals in `lib/anchor-oracle-selection.ts`, which never
 * consult the reader, because a predicate computed WITH the reader can only admit files
 * whose structure the reader already recognises — it posts the file BODY — frontmatter stripped, exactly as
 * `collectHeadingSlugs` reads it, because the `/markdown` endpoint has no frontmatter
 * mode — and records every `id="user-content-…"` / `name="user-content-…"` it gets back,
 * in document order. Both attributes: github rewrites an explicit `<a name="x">` that
 * way too, and a browser still resolves `#x` to it.
 *
 * Run: `pnpm docs:anchor-oracle` from the repo root (needs `gh` authenticated). The root
 * script goes through turbo, which builds `@pair/content-ops` first — the package-scoped
 * form does not, and dies with ERR_MODULE_NOT_FOUND on a clean checkout.
 * ~1 call per file; the fixture is keyed by content hash, so re-running after a docs
 * edit only refreshes the rows that moved. Follow it with `pnpm format`: this writes
 * plain `JSON.stringify(…, 2)`, which prettier then collapses short arrays in.
 */
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { stripFrontmatter } from '@pair/content-ops/markdown/commonmark-blocks'
import { isBlockStructureSensitive } from '../lib/anchor-oracle-selection'

const REPO_ROOT = resolve(import.meta.dirname, '../../..')
const OUT = resolve(import.meta.dirname, '../lib/github-anchor-oracle.json')

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
        "github.com's own anchors, per file body (frontmatter stripped). Regenerate with `pnpm docs:anchor-oracle` (repo root). Keyed by sha1 of that body: an edited file drops out of the assertion instead of failing on a stale expectation.",
      files: out,
    },
    null,
    2,
  )}\n`,
)
process.stderr.write(`\n${Object.keys(out).length} files recorded -> ${OUT}\n`)
