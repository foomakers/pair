/**
 * Conformance guard for CP5 (`qa/release-validation/CP5-website-docs-completeness.md`) — the
 * release-validation path that sweeps every docs URL for HTTP 200.
 *
 * This is a REPO-WIDE docs invariant, not a story deliverable: the set of URLs CP5 lists must
 * equal the set of routable pages on disk. It lives in its own file for that reason — it was
 * introduced alongside story #225's Claude Code Web guard, and an author who adds
 * `docs/reference/new-thing.mdx` must not read a red from a suite named after Claude Code Web.
 * Story #225's own assertions (CP10, the web/cloud docs page) stay in
 * `web-cloud-environment.test.ts`.
 *
 * Why the equality is a test at all: CP5's list was maintained by hand and drifted to 62 URLs
 * against 80 pages on disk — 18 live pages that a release sweep never checked, so a 404 on any of
 * them passed sign-off. The self-consistency assertion below cannot see that: it only fires when
 * an author edits CP5 *partially*, while an author who never touches CP5 leaves every count
 * matching at 62 == 62. See ADL
 * `.pair/adoption/decision-log/2026-08-20-cp5-page-list-is-asserted-against-the-filesystem.md`.
 *
 * Enforcement reach: `@pair/knowledge-hub#test` declares explicit turbo `inputs` for the
 * out-of-package paths this file reads, so a docs-only change invalidates the cache and this
 * assertion actually runs locally as well as in CI (which is always cold).
 */
import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync } from 'fs'
import { join } from 'path'

const ROOT = join(__dirname, '../../../..')
const CP5 = join(ROOT, 'qa/release-validation/CP5-website-docs-completeness.md')
const DOCS_CONTENT = join(ROOT, 'apps/website/content/docs')

const read = (p: string): string => readFileSync(p, 'utf-8')

/** Every routable docs URL, derived from the filesystem: `index.mdx` maps to its directory. */
const docsUrlsOnDisk = (): string[] =>
  readdirSync(DOCS_CONTENT, { recursive: true, encoding: 'utf-8' })
    .filter(f => f.endsWith('.mdx'))
    .map(f => `/docs/${f.replace(/\.mdx$/, '').replace(/(^|\/)index$/, '')}`.replace(/\/$/, ''))
    .sort()

describe('CP5 sweeps every docs page that exists', () => {
  it('lists exactly the routable pages on disk — no page unswept, no URL that 404s', () => {
    const listed = [...read(CP5).matchAll(/^- `\$BASE_URL(\/docs[^`]*)`$/gm)].map(m => m[1]).sort()
    expect(listed).toEqual(docsUrlsOnDisk())
  })

  it('keeps CP5 self-consistent — every stated count matches what is listed', () => {
    const c = read(CP5)
    const mt501 = c.slice(c.indexOf('## MT-CP501'), c.indexOf('## MT-CP502'))

    // Per-section: `**Integrations** (7 pages):` must match the bullets under it.
    const sections = [...mt501.matchAll(/\*\*(.+?)\*\* \((\d+) pages?\):\n((?:- `.+`\n)+)/g)]
    expect(sections.length).toBeGreaterThan(0)
    let listed = 0
    for (const [, name, declared, bullets] of sections) {
      const urls = bullets.trim().split('\n').length
      expect(urls, `${name} declares ${declared} pages but lists ${urls}`).toBe(Number(declared))
      listed += urls
    }

    // And the totals quoted in the expected result + notes must equal the sum.
    for (const quoted of [...mt501.matchAll(/All (\d+) URLs return HTTP 200/g)])
      expect(Number(quoted[1])).toBe(listed)
    for (const quoted of [...mt501.matchAll(/Total: (\d+) pages/g)])
      expect(Number(quoted[1])).toBe(listed)
  })
})
