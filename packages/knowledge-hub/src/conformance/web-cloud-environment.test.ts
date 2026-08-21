/**
 * Conformance guard for the web/cloud-environment deliverables of story #225.
 *
 * pair had a feasibility assessment for Claude Code Web and nothing durable: a one-shot
 * verification would have said whether web support held on the day it ran and nothing about
 * the next release. The durable artifact is therefore a critical path in the
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
 * - The dev-server limit is recorded as an EXPECTED result, cited by LINK to its adoption
 *   record (`decision-log/2026-08-20-no-public-dev-server-preview-from-cloud-sessions.md`) and
 *   never as the bare identifier `R9.4`, which resolves to no file here. A path that marked the
 *   limit failed would report a red for a decision.
 * - No credential, token or secret appears in either artifact. The preconditions describe how
 *   to CHECK that auth is present, never how to embed it.
 * - The docs page is registered in the sidebar, swept by CP5, covered by the website e2e
 *   page lists, and does not promise a live preview it cannot deliver.
 *
 * The repo-wide invariant this story also introduced — CP5's URL list must equal every `.mdx` on
 * disk — lives in `docs-page-coverage.test.ts`, NOT here: an author adding an unrelated docs page
 * must not read a red from a suite named after Claude Code Web.
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

const DOCS_CONTENT = join(ROOT, 'apps/website/content/docs')
const DOCS_INDEX = join(DOCS_CONTENT, 'integrations/index.mdx')

const read = (p: string): string => readFileSync(p, 'utf-8')

/**
 * The record of the exclusion this story documents. Both artifacts cite it by link; neither
 * carries the bare identifiers `R9.4` / `D16` (epic #213's requirements triage), which resolve to
 * no file under `.pair/` — see the ADL's own identifier note and the precedent it cites.
 */
const ADL_SLUG = '2026-08-20-no-public-dev-server-preview-from-cloud-sessions.md'
const ADL_LINK = `../../.pair/adoption/decision-log/${ADL_SLUG}`

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
    // NOT a leading `\b`: `_` is a word character, so `\bTOKEN` cannot match after the underscore
    // in `GITHUB_TOKEN=` — i.e. the most common spelling of the thing this shape exists to catch
    // would have slipped through. The name is instead allowed an underscore-separated prefix,
    // anchored on a non-alphanumeric so `COMPAT=` is not read as `…PAT=`.
    /(?:^|[^A-Za-z0-9])(?:[A-Za-z0-9]+_)*(?:TOKEN|SECRET|API_KEY|PAT)\s*=\s*["']?[A-Za-z0-9_-]{12,}/,
  ],
]

/**
 * The credential guard guards nothing unless it matches the spellings people actually write, so
 * the shapes are exercised against samples before they are trusted against the artifacts. Every
 * sample is assembled at runtime from fragments: a literal `ghp_…` in this file would be a
 * committed secret shape and gitleaks (the repo's deterministic scan) would fail the PR on the
 * test that exists to prevent exactly that.
 */
const shape = (label: string): RegExp => CREDENTIAL_SHAPES.find(([l]) => l === label)![1]

describe('the credential shapes match what people actually write', () => {
  const A36 = 'a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8'

  it.each([
    ['GitHub token literal', 'gh' + 'p_' + A36],
    ['GitHub token literal', 'GH_TOKEN is set from gh' + 'o_' + A36],
    ['GitHub fine-grained token literal', 'github' + '_pat_' + A36],
    ['Anthropic key literal', 'sk-' + 'ant-' + 'api03-' + A36],
    ['token variable assigned a value', 'TOKEN=' + A36],
    // The env-var spellings the guard exists for. Each carries a VALUE — no `ghp_`/`sk-ant-`
    // prefix, so the three literal shapes above do not see them; this shape is their only net.
    ['token variable assigned a value', 'export GITHUB_TOKEN=aBcD1234efGH5678ijKL'],
    ['token variable assigned a value', 'export GH_TOKEN="aBcD1234efGH5678ijKL"'],
    ['token variable assigned a value', 'AZURE_PAT=aBcD1234efGH5678ijKL'],
    ['token variable assigned a value', 'ANTHROPIC_API_KEY=aBcD1234efGH5678ijKL'],
    ['token variable assigned a value', 'MY_SECRET = aBcD1234efGH5678ijKL'],
  ])('%s matches %s', (label, sample) => {
    expect(shape(label).test(sample)).toBe(true)
  })

  it.each([
    // Checks, not secrets: CP10 and the docs page are full of these and must stay green.
    'gh auth status',
    'echo $GITHUB_TOKEN',
    'gh pr create --token=$GITHUB_TOKEN',
    'git config user.email',
    '| GitHub CLI auth | `gh auth status` | Exit code 0 |',
    'PATH=/usr/local/bin:/usr/bin',
    'COMPAT=aBcD1234efGH5678ijKL',
    'TOKEN=short',
  ])('leaves %s alone', sample => {
    for (const [, re] of CREDENTIAL_SHAPES) expect(re.test(sample)).toBe(false)
  })
})

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
    // The evidence is a PATH check. The case names `/pair-capability-checkpoint $mode=write`,
    // which writes under `.pair/working/` — gitignored (`git check-ignore -v
    // .pair/working/checkpoints/x.md` -> `.gitignore:35 .pair/working`). An executor told to
    // confirm the write "appears in git status" sees an empty `git status --short` on a
    // SUCCESSFUL write and records the story's AC1 evidence as a red.
    expect(c).toMatch(/ls -l/)
    expect(c).toMatch(/read it back|reads back/)
  })

  it('warns MT-CP1002 that the gitignored working area makes git status the wrong check', () => {
    const c = caseBody('MT-CP1002').toLowerCase()
    expect(c).toMatch(/gitignored/)
    // Stated as a trap, not as a step: whoever re-reads the case must learn WHY an empty
    // `git status` is not a failure, or the removed check comes back on the next edit.
    expect(c).toMatch(/do not use `git status` as the evidence/)
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
    // The exclusion is cited by LINK to its record, never as the bare identifier `R9.4`: that
    // identifier comes from epic #213's requirements triage and resolves to no file under
    // `.pair/`, so an executor asked to re-check the exclusion has nothing to open. Same
    // precedent as the marketplace ADL's identifier note for `D23`/`R9.3`.
    expect(c).toContain(ADL_LINK)
    expect(c).not.toMatch(/R9\.4/)
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
    // Prose + a followable link, never `R9.4` — a public page whose central claim rests on an
    // identifier that resolves nowhere is an unverifiable claim to its reader.
    expect(c).toContain(ADL_SLUG)
    expect(c).not.toMatch(/R9\.4/)
    expect(c.toLowerCase()).toMatch(/does not tunnel around it/)
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

  it('marks the "What works" table as verified by a real run, not a bare claim', () => {
    const c = read(DOCS_PAGE)
    const table = c.slice(c.indexOf('## What works'), c.indexOf('## What does not work'))
    // CP10 HAS run (2026-08-20/21: story #414 carried end to end to merged PR #454, from inside
    // a real Claude Code Web session). A flat `Works` column is no longer an overclaim — but it
    // must point at the evidence that makes it true, not just assert it. `D16` is dropped for the
    // same reason it is dropped everywhere else in this file: it resolves to no file under
    // `.pair/`, so a reader who tries to open it finds nothing.
    expect(table.toLowerCase()).toMatch(/assess/)
    expect(table.toLowerCase()).toMatch(/verified/)
    expect(table).not.toMatch(/\bD16\b/)
    expect(table).toMatch(/#454|Execution Log/)
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

  it('is covered by the website e2e page sweeps', () => {
    const c = read(E2E)
    // Both lists: the integrations smoke sweep and the prev/next integrity sweep.
    expect(c.split(DOCS_URL).length - 1).toBeGreaterThanOrEqual(2)
  })
})
