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
import { sectionBetween } from './test-utils'

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
const ADL_PATH = join(ROOT, '.pair/adoption/decision-log', ADL_SLUG)

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

// Same scoping idea as `caseBody`, applied to the e2e file: a whole-file `String#includes`
// degrades silently the moment a THIRD mention of a URL appears anywhere in the file (a
// comment, an unrelated array) — the count stays >= 2 even after the URL is deleted from one
// of the two sweeps it actually needs to be in. Scoping to each test's own source text is what
// makes a real regression (dropped from one sweep) fail red instead of reading as "still covered".
const e2eTestBody = (name: string): string => {
  const c = read(E2E)
  // Indentation-tolerant on BOTH ends, not just anchored to column 0: today every `test(` in
  // this file sits at column 0 with no `describe()` wrapper, but nothing enforces that, and a
  // routine `describe('docs', () => { ... })` refactor would make a column-0-only `^test\(`
  // terminator match nothing, WIDEN the body to end-of-file (the exact fail-open shape this
  // suite has closed eight times over), and silently pick up "coverage" from an unrelated test
  // further down the file instead of failing red on a real regression.
  const startMatch = new RegExp(
    `^[ \\t]*test\\('${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}'`,
    'm',
  ).exec(c)
  if (!startMatch) return ''
  const start = startMatch.index
  const rest = c.slice(start)
  // Skip past the WHOLE matched start (indentation + `test('name'`), not just 1 character. A
  // fixed `slice(1)` only ever strips the marker's first character — fine when the marker starts
  // at column 0, but when it is itself indented, `rest.slice(1)` still begins with leading
  // whitespace, so `^[ \t]*test\(` matches AT INDEX 0 (the indented `test(` re-matching itself)
  // instead of skipping to the real next test. That is not fail-open (the near-empty result goes
  // red), but it is not the "indentation-tolerant" fix its own earlier comment claimed either —
  // it points a future reader at the wrong file for a regression that does not exist there.
  const nextTest = rest.slice(startMatch[0].length).search(/^[ \t]*test\(/m)
  return nextTest === -1 ? rest : rest.slice(0, nextTest + startMatch[0].length)
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

  it('states MT-CP1001: every precondition check produces a recorded observation', () => {
    // Previously unguarded (AC4's only prior defense was the exact-id list, same gap MT-CP1006
    // had): a case gutted to its three structural headings stayed green. Checks the two
    // load-bearing facts this case's Expected Result names — the gh-or-MCP branch, and
    // repository visibility recorded as evidence.
    const c = caseBody('MT-CP1001').toLowerCase()
    expect(c).toMatch(/gh auth status/)
    expect(c).toMatch(/mcp/)
    expect(c).toMatch(/private.*public|public.*private/)
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

  it('the ADL both artifacts link to actually exists on disk, not just as link text', () => {
    // Both assertions above only check that ADL_LINK/ADL_SLUG appear as TEXT in the artifacts —
    // neither proves the file resolves. A rename or move of the ADL would leave both a dead
    // link on the public docs page and a dead citation in CP10 while every text-match assertion
    // stayed green — the exact decay class this file exists to close for R9.4/D16.
    expect(existsSync(ADL_PATH)).toBe(true)
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

  it("the Execution Log actually carries AC2's primary evidence, not just the heading", () => {
    // Previously only the heading was asserted — the log could be trimmed to empty and 64/64
    // would stay green, losing AC2's whole reason for existing: $STORY and $PR named as real,
    // checkable evidence rather than a claim.
    const log = sectionBetween(read(CP10), '## Execution Log', '## Changelog')
    expect(log).toMatch(/#414/)
    expect(log).toMatch(/#454/)
  })

  it('states MT-CP1006: the real observed result stands, and the executor never files a card', () => {
    // AC7's only prior guard was membership in CP10_CASES — a case gutted to its three
    // structural headings (Priority/Steps/Expected Result) with empty bodies stayed green. This
    // asserts the two rules the story actually names: evidence isn't smoothed over, and filing a
    // backlog card is the maintainer's call, not the executor's.
    const c = caseBody('MT-CP1006').toLowerCase()
    expect(c).toMatch(/real observed result/)
    expect(c).toMatch(/not\*{0,2} file a backlog card/)
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
    const prerequisites = sectionBetween(c, '## Prerequisites', '## Variables')
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
    const table = sectionBetween(c, '## What works', '## What does not work')
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

/** Slugifies a heading the same way fumadocs/GitHub do, to check in-page anchor links resolve. */
const slugify = (heading: string): string =>
  heading
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')

describe('AC8 — "Using pair on Claude Code Web" is a real section, not just a heading', () => {
  // Deleting this whole section left every other assertion in this file green before this
  // describe block existed — the exact "the assertions are the deliverable's only defense"
  // principle this file states in its own header comment, applied to the one AC that had no
  // guard of its own.
  it('carries the exact section title AC8 requires', () => {
    expect(read(DOCS_PAGE)).toMatch(/^## Using pair on Claude Code Web$/m)
  })

  it('states the load-bearing facts a session-setup guide needs, not just a title', () => {
    const c = read(DOCS_PAGE)
    const section = sectionBetween(
      c,
      '## Using pair on Claude Code Web',
      '### What still does not work here',
    )
    expect(section.toLowerCase()).toMatch(/reload/) // the provisioning-stepper workaround
    expect(section).toMatch(/\$story=/) // the $story requirement for write-mode skills
    expect(section).toMatch(/merge-base/) // the branch-collision check
  })

  it('carries an explicit "what still does not work" list, not left implicit', () => {
    const c = read(DOCS_PAGE)
    const start = c.indexOf('### What still does not work here')
    expect(start).toBeGreaterThan(-1)
    const rest = c.slice(start)
    // `### ` is 4 characters — slicing off only 1 (as `caseBody()` does for its own `## `
    // headings) would leave `### What still…` at position 0, matching the terminator against
    // ITSELF. Slice off the full `###` prefix before searching. And the terminator must stop at
    // an h2 OR an h3 (`#{2,3} `) — stopping only at `## ` let a sibling h3 appended right after
    // this section (e.g. "### Known workarounds") get swallowed into `section`, so the real list
    // could be emptied down to nothing and the following h3's own bullets/text would satisfy
    // every assertion below instead. Mutation-proven: emptying the real list and adding such a
    // sibling h3 with 4 placeholder bullets passed this test before this fix.
    const end = rest.slice(3).search(/^#{2,3} /m)
    const section = end === -1 ? rest : rest.slice(0, end + 3)
    const bullets = [...section.matchAll(/^- \*\*/gm)]
    expect(bullets.length).toBeGreaterThanOrEqual(4)
    expect(section).toMatch(/gh.*is not installed/)
    expect(section).toMatch(/playwright install.*403/)
    expect(section).toMatch(/node_modules/)
  })

  it('every in-page anchor link resolves to a real heading', () => {
    const c = read(DOCS_PAGE)
    const headings = [...c.matchAll(/^#{2,3} (.+)$/gm)].map(m => slugify(m[1]))
    const anchors = [...c.matchAll(/\]\(#([a-z0-9-]+)\)/g)].map(m => m[1])
    expect(anchors.length).toBeGreaterThan(0)
    for (const a of anchors) expect(headings, `#${a} has no matching heading`).toContain(a)
  })
})

describe('the new page is swept by the existing coverage, not left unwatched', () => {
  it('is listed in CP5 (docs completeness)', () => {
    expect(read(CP5)).toContain(DOCS_URL)
  })

  it('is covered by the website e2e page sweeps', () => {
    // Membership in each of the two sweeps that actually matter, not a whole-file occurrence
    // count — a page can vanish from one sweep while a stray comment mention keeps the count
    // green.
    const smoke = e2eTestBody('smoke: all integrations + pm-tools pages return 200')
    const circular = e2eTestBody('no circular prev/next footer links on any docs page')
    expect(smoke, 'missing from the integrations+pm-tools smoke sweep').toContain(DOCS_URL)
    expect(circular, 'missing from the circular-nav allPages sweep').toContain(DOCS_URL)
  })
})

describe("turbo.json keeps each package's #test / #test:coverage inputs in sync", () => {
  // turbo.json has no anchor/extends mechanism, so this story's own fix for the repo-wide-read
  // false-green (this file's own header note) left @pair/knowledge-hub#test and #test:coverage
  // with byte-identical `inputs` arrays, kept equal only by a comment asking humans to edit both.
  // That is exactly the hand-maintained-invariant class this same story's CP5 ADL argues should
  // be a test, applied here to the fix this story shipped for a different repo-wide read.
  //
  // This used to be hand-rolled indexOf/slice string surgery (keyStart/braceOpen/brace-matching)
  // — three rounds of independent review found it fail-open six times over: an unanchored
  // `indexOf('"key"')` matches the SAME key quoted inside another task's explanatory comment
  // (turbo.json quotes `"@pair/knowledge-hub#test"` in the #test:coverage block's own comment,
  // a few lines above the real key), landing brace-matching on the WRONG task's object and
  // making both calls return the SAME array — passing a guard whose only job is to catch that.
  // turbo.json's only non-standard-JSON feature is `//` line comments (JSONC); stripping those
  // and parsing for real removes every one of those failure modes at once: no substring search,
  // no comment capture, no brace-matching over string contents, keys accessed by exact property
  // name.
  const TURBO = join(ROOT, 'turbo.json')

  const readTurboTasks = (): Record<string, { inputs?: unknown; dependsOn?: unknown }> => {
    const stripped = read(TURBO).replace(/^[ \t]*\/\/.*$/gm, '')
    const parsed: unknown = JSON.parse(stripped)
    const tasks = (parsed as { tasks?: unknown }).tasks
    expect(tasks, 'turbo.json has no top-level "tasks" object').toBeTypeOf('object')
    return tasks as Record<string, { inputs?: unknown; dependsOn?: unknown }>
  }

  // The actual repo-wide reads each package's tests depend on turbo invalidating on — not just
  // "the arrays are equal to EACH OTHER" (which `[]` vs `[]`, or two arrays each missing the
  // same real entry, also satisfies). `$TURBO_DEFAULT$` is required in every entry: without it,
  // turbo drops the PACKAGE'S OWN files from the cache key — verified empirically in a scratch
  // workspace: a task with inputs = ["$TURBO_ROOT$/x/**"] and no $TURBO_DEFAULT$ hashes only
  // that root path, not the package's own source.
  //
  // Covers BOTH #test(:coverage) pairs this story's own fix rounds added turbo.json overrides
  // for — @pair/knowledge-hub's (round 5-7, the CP5/docs-page/CP10 repo-wide reads) and
  // @pair/dev-tools's (round 8, run-format.test.ts's execFileSync of the real
  // scripts/format-lib/run-format.sh). Asserting only the first pair left the second an
  // unguarded hand-maintained duplicate — the exact class this describe block exists to close,
  // reintroduced by its own follow-up fix one round later.
  //
  // `requiredDependsOn` covers the reads a path list CANNOT: a test that EXECUTES another
  // package's built output depends on that package's whole source closure, and a task
  // dependency is the only entry that follows the closure when it grows.
  const TASK_PAIRS: Array<{ pkg: string; requiredInputs: string[]; requiredDependsOn: string[] }> =
    [
      {
        pkg: '@pair/knowledge-hub',
        requiredDependsOn: ['build'],
        // The FULL 11-entry list this PR ships, not a subset — a round-9 review found the guard
        // only checking 6 of them (missing `.claude/**`, `.claude-plugin/marketplace.json`,
        // `apps/pair-cli/config.json`, `.github/workflows/**`, `scripts/**`), and mutation-proved
        // that deleting `.claude/**` from BOTH arrays — read by 20+ conformance files in this
        // package — stayed green. A partial floor is exactly the "we asserted the ONE entry that
        // matters least" mistake this describe block's own history keeps making one level down.
        requiredInputs: [
          '$TURBO_DEFAULT$',
          '$TURBO_ROOT$/.claude/**',
          '$TURBO_ROOT$/.claude-plugin/marketplace.json',
          '$TURBO_ROOT$/.pair/**',
          '$TURBO_ROOT$/apps/pair-cli/config.json',
          // #419: mirror-realignment.test.ts asserts MIRROR_REGENERATE_COMMAND names a script
          // the ROOT package.json actually defines. Renaming that script touches no file in
          // this package, so without this entry the guard replays a cached PASS over dead advice.
          '$TURBO_ROOT$/package.json',
          '$TURBO_ROOT$/apps/website/content/docs/**',
          '$TURBO_ROOT$/apps/website/e2e/docs.e2e.test.ts',
          '$TURBO_ROOT$/qa/**',
          '$TURBO_ROOT$/.github/workflows/**',
          '$TURBO_ROOT$/scripts/**',
          '$TURBO_ROOT$/turbo.json',
        ],
      },
      {
        pkg: '@pair/dev-tools',
        // #419 widened `scripts/format-lib/**` to `scripts/**`: regenerate-mirrors.test.ts
        // execFileSyncs scripts/regenerate-mirrors.sh the same way run-format.test.ts does its
        // script, and a per-script list degrades SILENTLY (a stale PASS) the next time one is
        // added without it. `package.json` is required because pre-push-gate-composition.test.ts
        // runs checkRootGate against the REAL root manifest.
        requiredInputs: ['$TURBO_DEFAULT$', '$TURBO_ROOT$/scripts/**', '$TURBO_ROOT$/package.json'],
        // #419 round 2: regenerate-mirrors.test.ts AC1/AC2 run the real
        // scripts/regenerate-mirrors.sh, whose TOOLCHAIN_ROOT is this repo — so they BUILD and
        // RUN apps/pair-cli and assert the output of the real `pair update --source` transform.
        // @pair/dev-tools declares no dependency on @pair/pair-cli, so neither `inputs` above
        // nor `^build` reached apps/pair-cli/**, packages/content-ops/** or
        // packages/knowledge-hub/**. MEASURED at 0a6712e3, clean worktree: appending a comment
        // to apps/pair-cli/src/registry/skill-refs.ts (the skill-reference rewriter those tests
        // exercise) and re-running `turbo run test --filter @pair/dev-tools` replayed
        // `1 cached, 125ms >>> FULL TURBO`. With this dependency: `2 cached, 12.7s` — and the
        // same probe on packages/content-ops/src/index.ts gives `0 cached`.
        requiredDependsOn: ['build', '@pair/pair-cli#build'],
      },
    ]

  it.each(TASK_PAIRS)(
    '$pkg has identical, non-empty inputs for #test and #test:coverage, covering the real repo-wide reads',
    ({ pkg, requiredInputs }) => {
      const tasks = readTurboTasks()
      const testInputs = tasks[`${pkg}#test`]?.inputs
      const coverageInputs = tasks[`${pkg}#test:coverage`]?.inputs
      expect(Array.isArray(testInputs), `${pkg}#test has no inputs array`).toBe(true)
      expect(Array.isArray(coverageInputs), `${pkg}#test:coverage has no inputs array`).toBe(true)
      for (const path of requiredInputs) {
        expect(testInputs, `${pkg}#test is missing ${path}`).toContain(path)
      }
      expect(coverageInputs).toEqual(testInputs)
    },
  )

  it.each(TASK_PAIRS)(
    '$pkg declares the same dependsOn for #test and #test:coverage, covering the packages its tests EXECUTE',
    ({ pkg, requiredDependsOn }) => {
      const tasks = readTurboTasks()
      const testDeps = tasks[`${pkg}#test`]?.dependsOn
      const coverageDeps = tasks[`${pkg}#test:coverage`]?.dependsOn
      expect(Array.isArray(testDeps), `${pkg}#test has no dependsOn array`).toBe(true)
      expect(Array.isArray(coverageDeps), `${pkg}#test:coverage has no dependsOn array`).toBe(true)
      for (const dep of requiredDependsOn) {
        expect(testDeps, `${pkg}#test is missing dependsOn ${dep}`).toContain(dep)
      }
      // The coverage variant is a hand-maintained duplicate with no anchor mechanism in
      // turbo.json: drifting only one of the two is how a stale cache comes back on the half
      // nobody re-ran.
      expect(coverageDeps).toEqual(testDeps)
    },
  )
})
