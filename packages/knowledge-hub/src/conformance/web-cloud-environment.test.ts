/**
 * Conformance guard for the web/cloud-environment deliverables of story #225.
 *
 * pair had a feasibility assessment for Claude Code Web (D16) and nothing durable: a
 * one-shot verification would have said whether web support held on the day it ran and
 * nothing about the next release. The durable artifact is therefore a critical path in the
 * release-validation suite (CP10) plus a docs page, and this guard asserts the two exist in
 * the shape the suite and the site expect — registered, executable, and honest about the
 * limit they document.
 *
 * What is guarded, and why each assertion is here rather than left to a reader:
 *
 * - CP10 follows the suite's `MT-CPxxxx` shape. A path written as prose cannot be executed
 *   by whoever runs release validation and decays into a report (CP9 is the precedent for a
 *   process-level path, and it is written in that shape).
 * - CP10 is registered in the README table, and the README's blanket "no special auth scopes
 *   needed" prerequisite is qualified where CP10 is registered. CP10 is the first path that
 *   needs an authenticated environment, so leaving that sentence unconditional would have the
 *   suite index contradict one of its own paths.
 * - The dev-server limit is recorded as an EXPECTED result. R9.4 excludes public dev-server
 *   exposure by design; a path that marked it failed would report a red for a decision.
 * - No credential, token or secret appears in either artifact. The preconditions describe how
 *   to CHECK that auth is present, never how to embed it.
 * - The docs page is registered in the sidebar, swept by CP5, covered by the website e2e
 *   page lists, and does not promise a live preview it cannot deliver.
 *
 * The execution itself is deliberately NOT guarded here: it is human and manual, performed
 * inside a Claude Code Web session because that environment is the subject under test. What
 * this file guards is that the executor has something re-runnable to execute, and a place to
 * record what they observed.
 */
import { describe, expect, it } from 'vitest'
import { existsSync, readdirSync, readFileSync } from 'fs'
import { join } from 'path'

const ROOT = join(__dirname, '../../../..')
const CP10 = join(ROOT, 'qa/release-validation/CP10-web-cloud-environment.md')
const CP5 = join(ROOT, 'qa/release-validation/CP5-website-docs-completeness.md')
const SUITE_README = join(ROOT, 'qa/release-validation/README.md')
const DOCS_PAGE = join(ROOT, 'apps/website/content/docs/integrations/web-cloud-environments.mdx')
const DOCS_META = join(ROOT, 'apps/website/content/docs/integrations/meta.json')
const E2E = join(ROOT, 'apps/website/e2e/docs.e2e.test.ts')

const DOCS_SLUG = 'web-cloud-environments'
const DOCS_URL = `/docs/integrations/${DOCS_SLUG}`

const DOCS_CONTENT = join(ROOT, 'apps/website/content/docs')
const DOCS_INDEX = join(DOCS_CONTENT, 'integrations/index.mdx')

const read = (p: string): string => readFileSync(p, 'utf-8')

/**
 * Every case CP10 must carry. Asserting the LIST (not a count) is what makes the deletion of a
 * single case fail: a `length >= 5` guard on a 6-case file cannot see one case disappear, which
 * is exactly how the story's evidence would decay while CI stayed green. A new case is a
 * deliberate edit here too — the guard must know what it is guarding.
 */
const CP10_CASES = [
  'MT-CP1001',
  'MT-CP1002',
  'MT-CP1003',
  'MT-CP1004',
  'MT-CP1005',
  'MT-CP1006',
] as const

/**
 * The body of one case — heading to the next `## ` heading. Keyword assertions run against THIS,
 * never the whole file: `skills` and `write` also occur in the Scope line and in MT-CP1005, so a
 * whole-file grep proves nothing about the case that is supposed to state them.
 */
const caseBody = (id: string): string => {
  const c = read(CP10)
  const start = c.search(new RegExp(`^## ${id}:`, 'm'))
  if (start === -1) return ''
  const rest = c.slice(start)
  const nextHeading = rest.slice(1).search(/^## /m)
  return nextHeading === -1 ? rest : rest.slice(0, nextHeading + 1)
}

/** Every routable docs URL, derived from the filesystem: `index.mdx` maps to its directory. */
const docsUrlsOnDisk = (): string[] =>
  readdirSync(DOCS_CONTENT, { recursive: true, encoding: 'utf-8' })
    .filter(f => f.endsWith('.mdx'))
    .map(f => `/docs/${f.replace(/\.mdx$/, '').replace(/(^|\/)index$/, '')}`.replace(/\/$/, ''))
    .sort()

// Credential shapes that must never appear in a checked-in test artifact: GitHub tokens
// (every documented prefix), Anthropic keys, and an assignment that puts a VALUE on a
// token-named variable. `gh auth status` and `$GITHUB_TOKEN` are checks, not secrets, so a
// bare variable reference is intentionally not matched.
const CREDENTIAL_SHAPES: Array<[string, RegExp]> = [
  ['GitHub token literal', /\bgh[pousr]_[A-Za-z0-9]{16,}/],
  ['GitHub fine-grained token literal', /\bgithub_pat_[A-Za-z0-9_]{20,}/],
  ['Anthropic key literal', /\bsk-ant-[A-Za-z0-9-]{16,}/],
  [
    'token variable assigned a value',
    /\b(?:TOKEN|SECRET|API_KEY|PAT)\s*=\s*["']?[A-Za-z0-9_-]{12,}/,
  ],
]

describe('CP10 — the web/cloud verification is a re-runnable critical path', () => {
  it('exists in the release-validation suite', () => {
    expect(existsSync(CP10)).toBe(true)
  })

  it('carries the suite header fields — priority, scope, preconditions', () => {
    const c = read(CP10)
    expect(c).toMatch(/^\*\*Priority\*\*:\s*P1$/m)
    expect(c).toMatch(/^\*\*Scope\*\*:/m)
    expect(c).toMatch(/^\*\*Preconditions\*\*:/m)
  })

  it('is written as MT-CP10xx cases, not as prose — and carries exactly the registered ones', () => {
    const found = (read(CP10).match(/^## (MT-CP10\d{2}):/gm) ?? []).map(h =>
      h.replace(/^## /, '').replace(/:$/, ''),
    )
    // One case per acceptance criterion the path has to observe: preconditions, skills,
    // story end-to-end, the dev-server limit, degraded/partial runs, defect reporting.
    expect(found).toEqual([...CP10_CASES])
  })

  it('gives every case the suite structure — steps and an expected result', () => {
    const c = read(CP10)
    const cases = c.split(/^## MT-CP10\d{2}:/gm).slice(1)
    for (const body of cases) {
      expect(body).toMatch(/^\*\*Priority\*\*:/m)
      expect(body).toMatch(/^### Steps$/m)
      expect(body).toMatch(/^### Expected Result$/m)
    }
  })

  it('states MT-CP1002: skills visible, executable, and a write that takes effect', () => {
    const c = caseBody('MT-CP1002').toLowerCase()
    expect(c).toMatch(/\.claude\/skills\//)
    expect(c).toMatch(/\/pair-next/)
    // The write is the case's point: a skill that only *runs* proves nothing about the sandbox.
    expect(c).toMatch(/writes? a file|write-mode/)
    expect(c).toMatch(/git status/)
  })

  it('states MT-CP1003: branch, commit and a PR visible on GitHub', () => {
    const c = caseBody('MT-CP1003').toLowerCase()
    expect(c).toMatch(/\bbranch\b/)
    expect(c).toMatch(/\bcommit\b/)
    expect(c).toMatch(/pull request/)
    expect(c).toMatch(/gh pr view/)
  })

  it('records MT-CP1004: the dev-server limit as an expected result, never as a failure', () => {
    const c = caseBody('MT-CP1004')
    expect(c).toMatch(/R9\.4/)
    // The absence of a live preview is the expected observation, and the case says so in
    // those terms so an executor cannot log it as a red.
    expect(c.toLowerCase()).toMatch(/expected result, not a failure/)
    expect(c.toLowerCase()).toMatch(/live preview/)
  })

  it('asks MT-CP1004 to VERIFY the mitigation in that environment, not assume it', () => {
    const c = caseBody('MT-CP1004').toLowerCase()
    expect(c).toMatch(/playwright/)
    expect(c).toMatch(/headless/)
    // A mitigation that only works on a dev machine is not a mitigation for this environment.
    expect(c).toMatch(/as observed here, not as assumed/)
  })

  it('covers the degraded paths in MT-CP1005 instead of leaving the executor to improvise', () => {
    const c = caseBody('MT-CP1005').toLowerCase()
    expect(c).toMatch(/gh auth status/)
    expect(c).toMatch(/mcp/)
    expect(c).toMatch(/partial/)
    expect(c).toMatch(/private|public/)
  })

  it('gives the observed run a home, so evidence is recorded rather than remembered', () => {
    expect(read(CP10)).toMatch(/^## Execution Log$/m)
  })

  it.each(CREDENTIAL_SHAPES)('embeds no %s', (_label, shape) => {
    expect(read(CP10)).not.toMatch(shape)
  })
})

describe('CP10 is registered in the suite index', () => {
  it('appears in the Critical Paths table with its file, priority and description', () => {
    const row = read(SUITE_README)
      .split('\n')
      .find(l => l.startsWith('| CP10 '))
    expect(row, 'CP10 must have a row in the Critical Paths table').toBeDefined()
    expect(row).toContain('CP10-web-cloud-environment.md')
    expect(row).toContain('P1')
  })

  it('qualifies the blanket "no special auth scopes needed" prerequisite', () => {
    const c = read(SUITE_README)
    const prerequisites = c.slice(c.indexOf('## Prerequisites'), c.indexOf('## Variables'))
    // CP10 is the first path that needs an authenticated environment. The promise above it
    // has to name the exception, or the next executor trusts a prerequisite that no longer holds.
    expect(prerequisites).toMatch(/CP10/)
    expect(prerequisites.toLowerCase()).toMatch(/authenticat/)
  })
})

describe('the docs page tells the reader what holds on web/cloud and what does not', () => {
  it('exists on the docs site', () => {
    expect(existsSync(DOCS_PAGE)).toBe(true)
  })

  it('carries the frontmatter the site needs', () => {
    const c = read(DOCS_PAGE)
    expect(c).toMatch(/^---\n(?:.*\n)*?title:\s*\S/m)
    expect(c).toMatch(/^description:\s*\S/m)
  })

  it('states what works — skills, and branch/commit/PR', () => {
    const c = read(DOCS_PAGE).toLowerCase()
    expect(c).toMatch(/skills/)
    expect(c).toMatch(/\bbranch\b/)
    expect(c).toMatch(/\bcommit\b/)
    expect(c).toMatch(/pull request/)
  })

  it('states what does not work, without promising a live preview', () => {
    const c = read(DOCS_PAGE)
    expect(c).toMatch(/R9\.4/)
    expect(c.toLowerCase()).toMatch(/live preview/)
    // The failure mode this guards is a docs page that sells the workaround as the
    // feature. Any sentence claiming a live preview is available fails here.
    expect(c).not.toMatch(/live preview (?:is|are|will be) (?:available|supported|exposed)/i)
    expect(c).not.toMatch(/(?:can|you can) (?:get|share|expose) a (?:public )?live preview/i)
  })

  it('documents the mitigation as something to verify, not as a promise', () => {
    const c = read(DOCS_PAGE).toLowerCase()
    expect(c).toMatch(/playwright/)
    expect(c).toMatch(/headless/)
    expect(c).toMatch(/screenshot/)
  })

  it('marks the "What works" table as assessed, not yet observed', () => {
    const c = read(DOCS_PAGE)
    const table = c.slice(c.indexOf('## What works'), c.indexOf('## What does not work'))
    // CP10 has never run. A flat `Works` column presented as established fact lets a reader
    // plan a sprint of cloud work on an assessment — the page must say which it is, in the
    // same terms CP10 uses ("assessed, not verified").
    expect(table.toLowerCase()).toMatch(/assess/)
    expect(table).toMatch(/D16/)
    expect(table).toMatch(/CP10/)
  })

  it('keeps the workaround example out of the repository working tree', () => {
    const c = read(DOCS_PAGE)
    const screenshots = [...c.matchAll(/playwright screenshot \S+ (\S+)/g)].map(m => m[1])
    expect(screenshots.length).toBeGreaterThan(0)
    // A relative output path resolves to the package cwd, so a reader following this page
    // inside a cloud session drops a binary PNG into the repo — which the session's next
    // `git add -A` sweeps into their PR. CP10 already writes to /tmp; the page must too.
    for (const out of screenshots) expect(out.startsWith('/tmp/')).toBe(true)
  })

  it('points at CP10, so the claim is re-verified rather than trusted forever', () => {
    expect(read(DOCS_PAGE)).toMatch(/CP10/)
  })

  it.each(CREDENTIAL_SHAPES)('embeds no %s', (_label, shape) => {
    expect(read(DOCS_PAGE)).not.toMatch(shape)
  })

  it('is registered in the Integrations sidebar', () => {
    const meta = JSON.parse(read(DOCS_META)) as { pages: string[] }
    expect(meta.pages).toContain(DOCS_SLUG)
  })

  it('keeps the Integrations sidebar alphabetical — meta.json order IS the rendered order', () => {
    const meta = JSON.parse(read(DOCS_META)) as { pages: string[] }
    expect(meta.pages).toEqual([...meta.pages].sort())
  })

  it('is reachable from the Integrations hub, not only from the sidebar', () => {
    // /docs/integrations is the section's entry point. A reader who lands there, reads the
    // Supported Tools table and picks a tool never learns the live-preview limit exists.
    expect(read(DOCS_INDEX)).toContain(DOCS_URL)
  })
})

describe('the new page is swept by the existing coverage, not left unwatched', () => {
  it('is listed in CP5 (docs completeness)', () => {
    expect(read(CP5)).toContain(DOCS_URL)
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

  it('sweeps every page that actually exists — CP5 vs the filesystem', () => {
    const listed = [...read(CP5).matchAll(/^- `\$BASE_URL(\/docs[^`]*)`$/gm)].map(m => m[1]).sort()
    const onDisk = docsUrlsOnDisk()
    // Self-consistency (below) only catches an author who edits CP5 *partially*. An author who
    // adds a page and never touches CP5 keeps every count matching while CP5 under-sweeps, and
    // a 404 on the unlisted page passes release sign-off.
    expect(listed).toEqual(onDisk)
  })

  it('is covered by the website e2e page sweeps', () => {
    const c = read(E2E)
    // Both lists: the integrations smoke sweep and the prev/next integrity sweep.
    expect(c.split(DOCS_URL).length - 1).toBeGreaterThanOrEqual(2)
  })
})
