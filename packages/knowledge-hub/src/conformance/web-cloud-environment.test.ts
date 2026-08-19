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
import { existsSync, readFileSync } from 'fs'
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

const read = (p: string): string => readFileSync(p, 'utf-8')

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

  it('is written as MT-CP10xx cases, not as prose', () => {
    const cases = read(CP10).match(/^## MT-CP10\d{2}:/gm) ?? []
    // One case per acceptance criterion the path has to observe: preconditions, skills,
    // story end-to-end, the dev-server limit, degraded/partial runs.
    expect(cases.length).toBeGreaterThanOrEqual(5)
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

  it('states the skills case: skills visible, executable, and a write that takes effect', () => {
    const c = read(CP10).toLowerCase()
    expect(c).toMatch(/skills/)
    expect(c).toMatch(/write/)
  })

  it('states the end-to-end case: branch, commit and a PR visible on GitHub', () => {
    const c = read(CP10).toLowerCase()
    expect(c).toMatch(/\bbranch\b/)
    expect(c).toMatch(/\bcommit\b/)
    expect(c).toMatch(/pull request|\bpr\b/)
  })

  it('records the dev-server limit as an expected result, never as a failure', () => {
    const c = read(CP10)
    expect(c).toMatch(/R9\.4/)
    // The absence of a live preview is the expected observation, and the case says so in
    // those terms so an executor cannot log it as a red.
    expect(c.toLowerCase()).toMatch(/expected result, not a failure|not a failure/)
    expect(c.toLowerCase()).toMatch(/live preview/)
  })

  it('asks the executor to VERIFY the mitigation in that environment, not assume it', () => {
    const c = read(CP10).toLowerCase()
    expect(c).toMatch(/playwright/)
    expect(c).toMatch(/headless/)
    // A mitigation that only works on a dev machine is not a mitigation for this environment.
    expect(c).toMatch(/verif/)
  })

  it('covers the degraded paths instead of leaving the executor to improvise', () => {
    const c = read(CP10).toLowerCase()
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

  it('is covered by the website e2e page sweeps', () => {
    const c = read(E2E)
    // Both lists: the integrations smoke sweep and the prev/next integrity sweep.
    expect(c.split(DOCS_URL).length - 1).toBeGreaterThanOrEqual(2)
  })
})
