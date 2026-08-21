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
import { sectionBetween } from './test-utils'

const ROOT = join(__dirname, '../../../..')
const CP5 = join(ROOT, 'qa/release-validation/CP5-website-docs-completeness.md')
const DOCS_CONTENT = join(ROOT, 'apps/website/content/docs')
const E2E = join(ROOT, 'apps/website/e2e/docs.e2e.test.ts')

const read = (p: string): string => readFileSync(p, 'utf-8')

/**
 * Every routable docs URL, derived from the filesystem: `index.mdx` maps to its directory.
 *
 * Treats EVERY `.mdx` under `content/docs` as routable — `apps/website/lib/source.ts`'s
 * `loader()` call has no exclude/filter option configured, so that is the real current behavior,
 * not an assumption. If a non-page convention (a shared include, a leading-underscore file) is
 * ever adopted, it must be excluded from BOTH the loader config and this function, or this guard
 * starts asserting CP5 lists a URL that never resolves.
 */
const docsUrlsOnDisk = (): string[] =>
  readdirSync(DOCS_CONTENT, { recursive: true, encoding: 'utf-8' })
    .filter(f => f.endsWith('.mdx'))
    .map(f => `/docs/${f.replace(/\.mdx$/, '').replace(/(^|\/)index$/, '')}`.replace(/\/$/, ''))
    .sort()

describe('CP5 sweeps every docs page that exists', () => {
  it('lists exactly the routable pages on disk — no page unswept, no URL that 404s', () => {
    // Scoped to MT-CP501 specifically — the ADL's own Decision §1 and this file's header both
    // state the equality is against MT-CP501's bullets, not the whole CP5 file. A page-list bullet
    // ever added under MT-CP502/503 (unlikely by their subject, but not impossible) must not be
    // pulled into a filesystem-equality check that has nothing to do with those cases.
    const c = read(CP5)
    const mt501 = sectionBetween(c, '## MT-CP501', '## MT-CP502')
    const listed = [...mt501.matchAll(/^- `\$BASE_URL(\/docs[^`]*)`$/gm)].map(m => m[1]).sort()
    expect(listed).toEqual(docsUrlsOnDisk())
  })

  it('keeps CP5 self-consistent — every stated count matches what is listed', () => {
    const c = read(CP5)
    const mt501 = sectionBetween(c, '## MT-CP501', '## MT-CP502')

    // Per-section: `**Integrations** (7 pages):` must match the bullets under it.
    // A blank line between the header and its list is `\n\n?`, not `\n`: markdownlint's MD032
    // (blanks-around-lists) requires one, and `pnpm format` inserts it — the regex must accept
    // the formatter's own output, not assume the un-formatted shape that predates this fix.
    const sections = [...mt501.matchAll(/\*\*(.+?)\*\* \((\d+) pages?\):\n\n?((?:- `.+`\n)+)/g)]
    expect(sections.length).toBeGreaterThan(0)
    let listed = 0
    for (const [, name, declared, bullets] of sections) {
      const urls = bullets.trim().split('\n').length
      expect(urls, `${name} declares ${declared} pages but lists ${urls}`).toBe(Number(declared))
      listed += urls
    }

    // And the totals quoted in the expected result + notes must equal the sum. Each floored at
    // exactly 1 match — without it, rewording either quoted sentence in CP5 silently retires
    // this half of the check with no red, the same way the per-section floor above already
    // guards against rewording a section header out of existence.
    const httpTotals = [...mt501.matchAll(/All (\d+) URLs return HTTP 200/g)]
    expect(httpTotals.length, 'expected exactly one "All N URLs return HTTP 200" statement').toBe(1)
    for (const quoted of httpTotals) expect(Number(quoted[1])).toBe(listed)

    const pageTotals = [...mt501.matchAll(/Total: (\d+) pages/g)]
    expect(pageTotals.length, 'expected exactly one "Total: N pages" statement').toBe(1)
    for (const quoted of pageTotals) expect(Number(quoted[1])).toBe(listed)
  })
})

describe('the e2e circular-nav sweep is not a narrower, silently-drifting copy of the same set', () => {
  // The ADL's Consequences call this sweep "a separate, narrower sweep" left deliberately
  // unguarded. It was never narrower than CP5/the filesystem — it happened to be exactly
  // co-extensive with it — so this assertion makes that claim either true by construction or
  // caught the next time either set moves, instead of trusting a description that was already
  // stale by the time it was written.
  it('allPages equals the same filesystem-derived set CP5 is asserted against', () => {
    const c = read(E2E)
    const start = c.indexOf('const allPages = [')
    expect(start, 'allPages array not found in docs.e2e.test.ts').toBeGreaterThan(-1)
    const end = c.indexOf('\n  ]', start)
    expect(end, 'closing bracket for allPages not found').toBeGreaterThan(start)
    const block = c.slice(start, end)
    const listed = [...block.matchAll(/'(\/docs[^']*)'/g)].map(m => m[1]).sort()
    expect(listed).toEqual(docsUrlsOnDisk())
  })
})
