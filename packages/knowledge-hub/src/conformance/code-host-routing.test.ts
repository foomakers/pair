import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync, readdirSync } from 'fs'
import { join, relative } from 'path'

// Story #236 — code host separate from PM tool (WoW override), GitHub + Linear
// reference case. Four invariants, all content invariants on the source-of-record
// dataset artifacts (the same way the rest of the KB/skill corpus is tested):
//
//   AC1  `code-host` is OPTIONAL — omitted ⇒ code host = PM tool, byte-identical
//        single-tool behavior (convention over configuration, D21).
//   AC2+ the routing rule lives in ONE place (the way-of-working/PM-tool +
//        code-host resolution convention), not re-derived per skill.
//   AC3  the cross-link is text-convention based: `Refs: <issue-id>` in the PR
//        body + the PR URL posted back on the PM item.
//   AC4  grep-verifiable audit: no skill assumes PM tool and code host coincide —
//        issue/state operations read `pm-tool`, PR/review operations read `code-host`.
//   AC5  a Linear PM guideline exists at parity with the other supported tools.
//
// Mirrors are asserted for the routing convention + the patched skills, because
// the root `.pair/` and `.claude/skills/` copies are what an installed project
// actually reads (the per-skill SKILL.md pair is separately guarded by #352's
// mirror-equality test; here we only assert the invariant survived the copy).

const DATASET = join(__dirname, '../../dataset')
const REPO_ROOT = join(__dirname, '../../../..')

const SKILL_CONVENTIONS =
  '.pair/knowledge/guidelines/technical-standards/ai-development/skill-conventions'
const PM_TOOL_KB = '.pair/knowledge/guidelines/collaboration/project-management-tool'

const ROUTING_CONVENTION = `${SKILL_CONVENTIONS}/way-of-working-pm-resolution.md`
const LINEAR_GUIDELINE = `${PM_TOOL_KB}/linear-implementation.md`
const WOW_TEMPLATE = '.pair/adoption/tech/way-of-working.md'

const read = (root: string, rel: string): string => readFileSync(join(root, rel), 'utf-8')
const dataset = (rel: string): string => read(DATASET, rel)
const datasetSkill = (rel: string): string => dataset(`.skills/${rel}`)

/** Every markdown file of every skill in the dataset, as `.skills/`-relative paths. */
const allSkillDocs = (): string[] => {
  const root = join(DATASET, '.skills')
  const walk = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
      const abs = join(dir, entry.name)
      if (entry.isDirectory()) return walk(abs)
      return entry.isFile() && entry.name.endsWith('.md') ? [relative(root, abs)] : []
    })
  return walk(root).sort()
}

/** Every `.mdx` page of the docs site, recursively, as repo-root-relative paths. */
const DOCS_ROOT = 'apps/website/content/docs'
const allDocsPages = (): string[] => {
  const root = join(REPO_ROOT, DOCS_ROOT)
  const walk = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
      const abs = join(dir, entry.name)
      if (entry.isDirectory()) return walk(abs)
      return entry.isFile() && entry.name.endsWith('.mdx') ? [relative(REPO_ROOT, abs)] : []
    })
  return walk(root).sort()
}

describe('code-host / PM-tool split — WoW schema (#236, AC1)', () => {
  const wow = dataset(WOW_TEMPLATE)

  it('declares a Git Workflow section carrying code-host + base-branch', () => {
    expect(wow).toMatch(/^##\s+Git Workflow\s*$/m)
    expect(wow).toContain('`code-host`')
    expect(wow).toContain('`base-branch`')
  })

  it('AC1 — code-host is optional and omitted ⇒ code host = PM tool (zero-config default)', () => {
    const section = wow.slice(wow.indexOf('## Git Workflow'))
    expect(section).toMatch(/optional/i)
    // The resolution rule is stated, not implied.
    expect(section).toMatch(/omitted[^\n]*⇒[^\n]*(PM tool|pm-tool)/i)
    expect(section).toMatch(/single-tool/i)
  })

  it('edge case — the same tool in both fields is treated exactly as omitted (no dual-write)', () => {
    const section = wow.slice(wow.indexOf('## Git Workflow'))
    expect(section).toMatch(/same tool[\s\S]{0,160}(as omitted|no dual-write)/i)
  })

  it('documents the split example (Linear PM + GitHub code host) in the schema itself', () => {
    const section = wow.slice(wow.indexOf('## Git Workflow'))
    expect(section).toMatch(/linear/i)
    expect(section).toMatch(/github/i)
  })

  it('points at the single routing convention rather than restating the rule', () => {
    const section = wow.slice(wow.indexOf('## Git Workflow'))
    expect(section).toContain('way-of-working-pm-resolution.md')
  })
})

describe('code-host / PM-tool split — routing convention lives in ONE place (#236, AC2/AC4)', () => {
  const convention = dataset(ROUTING_CONVENTION)

  it('resolves the code host: read code-host, absent ⇒ PM tool', () => {
    expect(convention).toMatch(/^##\s+Code-host resolution\s*$/m)
    expect(convention).toContain('`code-host`')
    expect(convention).toMatch(/absent[^\n]*⇒[^\n]*PM tool|omitted[^\n]*⇒[^\n]*PM tool/i)
  })

  it('carries the routing table: issue/state ops → PM tool, PR/review ops → code host', () => {
    expect(convention).toMatch(/^##\s+Routing table/m)
    // Both directions of the rule are spelled out in the table.
    expect(convention).toMatch(/issue[^\n|]*\|[^\n]*pm-tool|issue[^\n|]*\|[^\n]*PM tool/i)
    expect(convention).toMatch(/(pull request|PR)[^\n|]*\|[^\n]*code-host/i)
  })

  it('states the state-transition invariant: transitions always happen on the PM tool', () => {
    expect(convention).toMatch(/state transitions? always[\s\S]{0,80}PM tool/i)
  })

  it('AC3 — cross-link is text-convention based: Refs: <issue-id> + PR URL back on the item', () => {
    expect(convention).toMatch(/^##\s+Cross-linking convention/m)
    expect(convention).toContain('Refs: <issue-id>')
    expect(convention).toMatch(/PR URL[\s\S]{0,160}(comment|link field)/i)
    // No native integration is assumed (business rule).
    expect(convention).toMatch(/no native integration|native[^\n]*not assumed/i)
  })

  it('edge case — code host declared but unreachable/unauthenticated ⇒ HALT, PM side not rolled back', () => {
    expect(convention).toMatch(/unreachable|unauthenticated/i)
    expect(convention).toContain('HALT')
    expect(convention).toMatch(/not rolled back|no rollback/i)
  })

  it('edge case — issue id not found when linking back ⇒ PR still created, warning + manual link', () => {
    expect(convention).toMatch(/not found[\s\S]{0,200}(warn|manual)/i)
  })

  it('is mirrored to the root install (what an installed project actually reads)', () => {
    const mirrored = read(REPO_ROOT, ROUTING_CONVENTION)
    expect(mirrored).toMatch(/^##\s+Code-host resolution\s*$/m)
    expect(mirrored).toMatch(/^##\s+Routing table/m)
    expect(mirrored).toMatch(/^##\s+Cross-linking convention/m)
  })

  it('is registered in the skill-conventions index', () => {
    const index = dataset(`${SKILL_CONVENTIONS}/README.md`)
    expect(index).toMatch(/code[- ]host/i)
  })
})

describe('code-host / PM-tool split — no skill assumes the two coincide (#236, AC4 audit)', () => {
  // Skills whose PR/review operations must route to the code host, with the
  // grep-verifiable evidence each one carries. Data-driven so a new skill added
  // to this list needs no new test body.
  const PR_SIDE: ReadonlyArray<readonly [string, string]> = [
    ['capability/publish-pr/SKILL.md', 'pair-capability-publish-pr'],
    ['process/review/SKILL.md', 'pair-process-review'],
    ['process/review/merge-and-cascade.md', 'pair-process-review'],
    ['capability/verify-quality/SKILL.md', 'pair-capability-verify-quality'],
    ['capability/classify/SKILL.md', 'pair-capability-classify'],
    ['capability/verify-done/SKILL.md', 'pair-capability-verify-done'],
    ['process/implement/SKILL.md', 'pair-process-implement'],
    ['next/SKILL.md', 'pair-next'],
    // Named in the routing table's "required checks (CI gate)" row, so it is audited
    // like every other consumer the table cites.
    ['capability/setup-gates/SKILL.md', 'pair-capability-setup-gates'],
  ]

  // The conflation the audit exists to kill: treating a PR as something the PM tool
  // owns. Two shapes, because the sentence can run either way:
  //   PR-first    — "read the PR body from/on/to/in/using the PM tool"
  //   PM-first    — "the PM tool's PR", "the PM tool's pull requests"
  // `PR`/`PRs` is matched CASE-SENSITIVELY and word-bounded on purpose: a /i flag makes
  // the `PR` alternative hit the letters "pr" inside ordinary words (provided, prepend,
  // approved, process), which turned the audit into a distance-from-a-random-word
  // check — one that happened to pass by a single character. Only the spelled-out
  // "pull request" is case-insensitive (sentence-initial "Pull request").
  // The gap between the two halves is TEMPERED against `code host`: a contrastive
  // sentence that routes both sides explicitly ("the PR on the code host, the state on
  // the PM tool") is correct, and widening the verb set to `on`/`in` would otherwise
  // flag it. Only an unrouted gap counts as a conflation.
  const PR_TOKEN = String.raw`\b(PRs?|[Pp]ull [Rr]equests?)\b`
  const PR_FROM_PM_TOOL = new RegExp(
    `${PR_TOKEN}(?:(?!code[- ]host)[^.\\n]){0,60}\\b(from|on|to|in|using) the PM tool`,
  )
  // The possessive half is deliberately TIGHT — the PR token must be the head of the
  // possessive phrase ("the PM tool's PR", "the PM tool's own pull requests"), with at
  // most a couple of adjectives and no punctuation in between. A loose gap here matches
  // legitimate contrastive prose ("issues are the PM tool's side, unlike the PR reads").
  const PM_TOOL_OWNS_PR = new RegExp(String.raw`the PM tool'?s(?: [a-z-]+){0,2} ${PR_TOKEN}`)
  const conflates = (content: string): boolean =>
    PR_FROM_PM_TOOL.test(content) || PM_TOOL_OWNS_PR.test(content)

  for (const [rel] of PR_SIDE) {
    it(`${rel} routes PR/review operations to the code host (never "the PM tool")`, () => {
      const content = datasetSkill(rel)
      expect(content).toMatch(/code host|code-host/i)
      expect(conflates(content), rel).toBe(false)
    })
  }

  // AC4 reads "given the FULL skill catalog, no skill assumes the two coincide" — so the
  // negative half runs over every skill doc in the dataset, not only the hand-maintained
  // PR_SIDE list above (which stays as the *positive* evidence set). A skill added
  // tomorrow is audited without touching this file.
  it('AC4 — no skill doc in the catalog conflates a PR with the PM tool (full-catalog grep)', () => {
    const docs = allSkillDocs()
    expect(docs.length).toBeGreaterThan(40) // sanity: the walk actually found the corpus
    const offenders = docs.filter(rel => conflates(datasetSkill(rel)))
    expect(offenders).toEqual([])
  })

  it('the negative audit pattern is not satisfied by "pr" inside ordinary words', () => {
    // Regression guard for the pattern itself: the old /i version matched these.
    expect('is provided, prepend story-specific criteria from the PM tool').not.toMatch(
      PR_FROM_PM_TOOL,
    )
    expect('the process reads the labels from the PM tool').not.toMatch(PR_FROM_PM_TOOL)
    // ...while the real conflation still fails the audit, in every shape it takes.
    expect(conflates('read the PR body from the PM tool')).toBe(true)
    expect(conflates('Pull request labels are read on the PM tool')).toBe(true)
    expect(conflates('list open PRs from the PM tool')).toBe(true)
    expect(conflates('the pull request is created in the PM tool')).toBe(true)
    expect(conflates("approve the PM tool's PR")).toBe(true)
    expect(conflates("the PM tool's pull requests carry the tier")).toBe(true)
    // ...and correctly routed / merely contrastive sentences still pass.
    expect(conflates('create the PR on the code host; write the state on the PM tool')).toBe(false)
    expect(conflates("issues are the PM tool's side, unlike the PR reads in Step 3")).toBe(false)
    expect(
      conflates('$id: <issue-id> (the PM tool\'s own item id) and $comment: "PR: <url>"'),
    ).toBe(false)
  })

  it('publish-pr reads the Git Workflow adoption section (not a "#236 is pending" note)', () => {
    const content = datasetSkill('capability/publish-pr/SKILL.md')
    expect(content).toContain('## Git Workflow')
    expect(content).not.toMatch(/#236's job|is #236's/i)
  })

  it('publish-pr posts the PR URL back on the PM item, completing the bidirectional link (AC3)', () => {
    const content = datasetSkill('capability/publish-pr/SKILL.md')
    expect(content).toContain('Refs: <issue-id>')
    expect(content).toMatch(/PR URL[\s\S]{0,240}(PM|issue|item)/i)
    expect(content).toMatch(/back[- ]?link|post[^\n]*back/i)
  })

  it('write-issue is PM-tool-only — explicitly never the code host', () => {
    const content = datasetSkill('capability/write-issue/SKILL.md')
    expect(content).toMatch(/never[^\n]*code host|not the code host|PM tool only/i)
  })

  it('classify names the side per target: card ⇒ PM tool, PR ⇒ code host', () => {
    const content = datasetSkill('capability/classify/SKILL.md')
    // Tag/label writes are routed by target, not assumed to be the PM tool's.
    expect(content).toMatch(/PR[^\n]*⇒[^\n]*code host|card[^\n]*⇒[^\n]*PM tool/i)
    // The old conflation: a label-API failure attributed to the PM tool only.
    expect(content).not.toMatch(/PM tool lacks label-API access/i)
  })

  it('classify routes its READ side too: the refinement floor is a PM-tool read, id from Refs:', () => {
    const content = datasetSkill('capability/classify/SKILL.md')
    const step = content.slice(content.indexOf('3. **Act** (review only, never-lower)'))
    const point = step.slice(0, step.indexOf('\n4.'))
    // The never-lower floor comes from the ITEM — the opposite side from the Step 4 PR write.
    expect(point).toMatch(/item read[^\n]*⇒[^\n]*`?pm-tool`?|story body[\s\S]{0,120}pm-tool/i)
    // ...and on a split project the id is resolved from the PR's cross-link, so the
    // standalone `$target: <PR>` entry point can still reach the story (D17).
    expect(point).toContain('Refs:')
    expect(point).toMatch(/split|differ/i)
  })

  it('verify-done marks its PR reads (tier + approvals) as code-host reads', () => {
    const content = datasetSkill('capability/verify-done/SKILL.md')
    expect(content).toMatch(/code host/i)
    expect(content).toMatch(/(approval|tier)[\s\S]{0,200}code host/i)
  })

  it('implement cuts the branch from the ADOPTED base branch (snippet parametrised, not hardcoded main)', () => {
    const content = datasetSkill('process/implement/SKILL.md')
    expect(content).toContain('git checkout <base-branch>')
    expect(content).not.toMatch(/git checkout main && git pull origin main/)
  })

  it('review submits its verdict on the code host only — no status mirroring on the PM tool', () => {
    const content = datasetSkill('process/review/SKILL.md')
    expect(content).toMatch(/code host/i)
    expect(content).toMatch(/no (status )?mirroring|never mirrored|not mirrored/i)
  })

  it('merge-and-cascade splits the two writes: PR merged on the code host, issue closed on the PM tool', () => {
    const content = datasetSkill('process/review/merge-and-cascade.md')
    expect(content).toMatch(/merge[\s\S]{0,120}code host/i)
    expect(content).toMatch(/close[\s\S]{0,160}PM tool/i)
  })

  it('every PR-side skill points at the single routing convention (no re-derived rule)', () => {
    for (const [rel] of PR_SIDE) {
      expect(datasetSkill(rel), rel).toContain('way-of-working-pm-resolution.md')
    }
  })

  it('the invariant survives the copy to the installed mirror', () => {
    for (const [rel, installedDir] of PR_SIDE) {
      const file = rel.slice(rel.lastIndexOf('/') + 1)
      const mirrorPath = join(REPO_ROOT, '.claude/skills', installedDir, file)
      expect(existsSync(mirrorPath), mirrorPath).toBe(true)
      expect(readFileSync(mirrorPath, 'utf-8'), mirrorPath).toMatch(/code host|code-host/i)
    }
  })
})

describe('code-host / PM-tool split — the back-link is executable, not destructive (#236, AC3)', () => {
  const writeIssue = datasetSkill('capability/write-issue/SKILL.md')

  it('write-issue exposes a comment mode — a non-destructive path that never renders the body', () => {
    expect(writeIssue).toContain('`$mode`')
    expect(writeIssue).toContain('`$comment`')
    expect(writeIssue).toMatch(
      /comment mode[\s\S]{0,400}(no body|body is (never )?(touched|rewritten)|non-destructive)/i,
    )
  })

  it('comment mode is exempt from the body-overwrite contract AND from the not-found HALT', () => {
    // The full-body-overwrite rule must be scoped to write mode explicitly.
    expect(writeIssue).toMatch(/full-body overwrite[\s\S]{0,400}(write mode|`\$mode: write`)/i)
    // Back-link failures warn — they never HALT, because the PR is already valid work.
    expect(writeIssue).toMatch(
      /comment mode[\s\S]{0,300}(warn[^\n]*not HALT|never HALT|warn, don't HALT)/i,
    )
  })

  it('write-issue carries a /publish-pr Composition Interface entry for the back-link', () => {
    const composition = writeIssue.slice(writeIssue.indexOf('## Composition Interface'))
    expect(composition).toMatch(/publish-pr/)
    expect(composition).toMatch(/comment/i)
  })

  it('publish-pr composes the back-link through the comment mode (explicit arguments)', () => {
    const content = datasetSkill('capability/publish-pr/SKILL.md')
    expect(content).toMatch(/\$mode:\s*comment/)
    expect(content).toMatch(/\$comment:/)
  })

  it('the back-link step is idempotent: publish-pr checks for an existing comment before posting', () => {
    const content = datasetSkill('capability/publish-pr/SKILL.md')
    const step = content.slice(content.indexOf('5. **Check — does a back-link apply'))
    // Check→Skip, like every other step in the phase — not Act-only.
    expect(step).toMatch(/^5\.\s+\*\*Check/)
    expect(step.slice(0, 2400)).toMatch(/\*\*Skip\*\*[\s\S]{0,200}(already|not post again)/i)
    // And the reason it has to live here rather than in write-issue.
    expect(step.slice(0, 2400)).toMatch(/cannot dedupe|no id|has no id/i)
  })

  it('AC1 — the single-tool skip is hoisted ABOVE the PM-item comment read (no new read by default)', () => {
    const content = datasetSkill('capability/publish-pr/SKILL.md')
    const step = content
      .slice(content.indexOf('5. **Check — does a back-link apply'))
      .slice(0, 2400)
    const skipAt = step.search(/skip this entire step/i)
    const readAt = step.search(/Read the PM item's existing comments/)
    expect(skipAt).toBeGreaterThanOrEqual(0)
    expect(readAt).toBeGreaterThan(skipAt)
  })

  it('write-issue scopes its idempotency claim to write mode (a comment has no id to dedupe on)', () => {
    expect(writeIssue).toMatch(/\*\*Idempotent in write mode\*\*/)
    expect(writeIssue).toMatch(/comment mode[\s\S]{0,300}(not self-deduplicating|append-only)/i)
    // The duplicate-check responsibility is named, not left implicit.
    expect(writeIssue).toMatch(/(caller|`\/publish-pr`)[^\n]{0,200}(Check|duplicate-check)/i)
  })

  it('every supported PM guide documents the comment mechanism write-issue routes to', () => {
    const guides: ReadonlyArray<readonly [string, RegExp]> = [
      ['linear-implementation.md', /commentCreate/],
      ['github-implementation.md', /gh issue comment/],
      ['azure-devops-implementation.md', /workItems\/<id>\/comments/],
      ['filesystem-implementation.md', /##\s+Activity Log/],
    ]
    for (const [guide, mechanism] of guides) {
      const content = dataset(`${PM_TOOL_KB}/${guide}`)
      expect(content, guide).toMatch(mechanism)
      // Each one is reachable as its own section (write-issue Step 7c links the anchor).
      expect(content, guide).toMatch(/^##+\s+Comment/m)
    }
  })

  it('pr-template carries a conditional Refs: slot so the read-back is a deterministic slot', () => {
    for (const root of [DATASET, REPO_ROOT]) {
      const template = read(
        root,
        '.pair/knowledge/guidelines/collaboration/templates/pr-template.md',
      )
      expect(template).toContain('Refs:')
      expect(template).toMatch(/Refs:[\s\S]{0,300}(code host ≠ PM tool|differs from the PM tool)/i)
      // The token the read-back is specified against must appear VERBATIM: plain,
      // at line start. A decorated `**Refs:**` never matches an anchored read-back.
      expect(template).toMatch(/^Refs: /m)
      expect(template).not.toMatch(/\*\*Refs:?\*\*/)
    }
  })
})

describe('code-host / PM-tool split — a PM tool that hosts no code needs code-host (#236, AC1 edge)', () => {
  it('the resolution rule names filesystem alongside Linear/Jira as hosting no code', () => {
    const convention = dataset(ROUTING_CONVENTION)
    const section = convention.slice(convention.indexOf('## Code-host resolution'))
    expect(section).toMatch(/filesystem/i)
    expect(section).toMatch(/linear/i)
    // Absent code-host on a PM tool that hosts no code is NOT a silent resolution.
    expect(section).toMatch(/hosts? no (code|repositor)/i)
  })

  it('defines identifier equality by PRODUCT (github ≡ github-projects), not by spelling', () => {
    const convention = dataset(ROUTING_CONVENTION)
    const section = convention.slice(convention.indexOf('## Code-host resolution'))
    // The schema spells the same product two ways; the alias list is what stops a
    // single-tool repo from resolving as a split (and dual-writing).
    expect(section).toMatch(/alias/i)
    expect(section).toMatch(/`github`[^\n]*`github-projects`|`github-projects`[^\n]*`github`/)
    expect(section).toMatch(/azure-repos|azure-boards/)
  })

  it('flags the one-time upgrade step for an adoption that predates the field', () => {
    const convention = dataset(ROUTING_CONVENTION)
    const section = convention.slice(convention.indexOf('## Code-host resolution'))
    expect(section).toMatch(/(once|one-time)[\s\S]{0,240}(setup-pm|backfill)/i)
    // ...and the same line reaches the user-facing failure-mode table.
    const page = read(REPO_ROOT, 'apps/website/content/docs/concepts/code-host.mdx')
    expect(page).toMatch(/(once|one-time)[\s\S]{0,240}(setup-pm|backfill)/i)
  })

  it('setup-pm prompts for code-host on filesystem adoption too', () => {
    const content = datasetSkill('capability/setup-pm/SKILL.md')
    expect(content).toMatch(/hosts? no code[^\n]*filesystem|filesystem[^\n]*hosts? no code/i)
  })

  it('the concept page states the claim itself: filesystem hosts no code', () => {
    const page = read(REPO_ROOT, 'apps/website/content/docs/concepts/code-host.mdx')
    // Not a bare mention — the actual claim, so a page saying the opposite fails.
    expect(page).toMatch(/filesystem[^.]{0,120}(hosts? no code|own no repositories)/i)
    // ...and an omitted code-host there HALTs rather than resolving to filesystem.
    expect(page).toMatch(/filesystem[^\n]*\|[\s\S]{0,80}HALT/i)
  })

  /**
   * The COPY-PASTE surface, not the prose. `/pair-capability-setup-pm` applies the
   * tool's implementation guide, so the fenced `way-of-working.md` snippet in that
   * guide is what actually lands in an adopter's adoption file. A hosts-no-code
   * guide whose snippet omits `## Git Workflow` therefore ships a configuration
   * that HALTs on the project's first `/pair-capability-publish-pr` — the guide is
   * correct in prose and wrong in the block the reader copies.
   *
   * Both roots are asserted, because the installed `.pair/knowledge` copy is what
   * an adopting project reads (the dataset one is only what pair ships).
   */
  const WOW_SNIPPET_GUIDES: ReadonlyArray<{ guide: string; hostsCode: boolean }> = [
    { guide: 'filesystem-implementation.md', hostsCode: false },
    { guide: 'linear-implementation.md', hostsCode: false },
    { guide: 'azure-devops-implementation.md', hostsCode: true },
    // github-implementation.md carries no way-of-working snippet at all, so there is
    // no copy-paste surface to assert on; the reverse sweep below pins that fact.
  ]

  /**
   * A fenced markdown block per CommonMark: 3+ backticks or tildes, `markdown` or `md`
   * as the info string's language (any case, trailing attributes allowed), LF or CRLF,
   * closed by the same fence characters (`\1`: a four-backtick fence is not closed by
   * a three-backtick run inside it). Pinned to the literal ```markdown\n, the sweep
   * was fence-language-dependent: a guide fencing its snippet ```md shipped green.
   */
  const MARKDOWN_FENCE_RE = /(`{3,}|~{3,})(?:markdown|md)\b[^\n]*\r?\n([\s\S]*?)\1/gi

  /** Every fenced markdown block of `content` that configures way-of-working.md. */
  const wowSnippets = (content: string): string[] =>
    markdownFences(content).filter(block => /adopted for project management/i.test(block))

  /** Every fenced markdown block, whatever it says — the copy-paste surface itself. */
  const markdownFences = (content: string): string[] =>
    [...content.matchAll(MARKDOWN_FENCE_RE)].map(m => m[2] ?? '')

  /**
   * Does a snippet DECLARE a code host? The `code-host:` key line, nothing else.
   *
   * NOT the `## Git Workflow` heading: `way-of-working-pm-resolution.md` § Section
   * ownership gives that heading BOTH `code-host` and `base-branch`, and its
   * `base-branch` resolution names `## Git Workflow` → `base-branch` as *the current
   * placement*. A hosts-code guide documenting a non-default base branch therefore
   * ships the heading with no code host in it — legal, and the recommended placement.
   * Keying on the heading accused exactly that guide of declaring a code host.
   *
   * Step 4 of the resolution rule also PERMITS a `code-host` naming the same tool as
   * `pm-tool` ("treat it exactly as if it were omitted") — still a declaration, so
   * still off the zero-configuration path a hosts-code guide must show; and a prose
   * mention of the word inside the block is not a declaration at all.
   */
  const declaresCodeHost = (snippet: string): boolean =>
    /^\s*[-*]?\s*`?code-host`?\s*:/m.test(snippet)

  for (const { guide, hostsCode } of WOW_SNIPPET_GUIDES) {
    for (const [rootLabel, root] of [
      ['dataset', DATASET],
      ['installed', REPO_ROOT],
    ] as const) {
      it(`${guide} (${rootLabel}) — the way-of-working snippet ${
        hostsCode
          ? 'ships no `code-host` declaration (it shows the zero-config path)'
          : 'declares code-host (or the first PR HALTs)'
      }`, () => {
        const snippets = wowSnippets(read(root, `${PM_TOOL_KB}/${guide}`))
        expect(snippets.length, `${guide} has no way-of-working snippet`).toBeGreaterThan(0)
        const snippet = snippets.join('\n')
        if (hostsCode) {
          // ADR-018: the tool IS the code host, so the SHIPPED snippet must show the
          // zero-configuration path. Asserted on the declaration, not on the substring:
          // the explicit-but-equal form is legal per the resolution rule's step 4, and
          // a prose mention inside the block is not a declaration either.
          expect(declaresCodeHost(snippet), `${guide}: snippet declares a code host`).toBe(false)
        } else {
          expect(snippet, guide).toMatch(/^##\s+Git Workflow\s*$/m)
          expect(snippet, guide).toContain('`code-host`')
          expect(snippet, guide).toContain('`base-branch`')
        }
      })
    }
  }

  for (const { guide } of WOW_SNIPPET_GUIDES.filter(g => !g.hostsCode)) {
    it(`${guide} says WHY the field is not optional there (HALT, not preference)`, () => {
      for (const [rootLabel, root] of [
        ['dataset', DATASET],
        ['installed', REPO_ROOT],
      ] as const) {
        const content = read(root, `${PM_TOOL_KB}/${guide}`)
        expect(content, `${guide}/${rootLabel}`).toMatch(/hosts? no code|owns? no repositor/i)
        expect(content, `${guide}/${rootLabel}`).toContain('HALT')
      }
    })
  }

  /**
   * Closes the door WOW_SNIPPET_GUIDES leaves open: it is a hand-written list, so a
   * NEW tracker guide (`jira-implementation.md`, …) shipping a HALTing snippet would
   * be silently unasserted. Read the directory instead of naming files: anything not
   * classified above must prove it has no copy-paste surface at all. Subsumes the
   * github-implementation.md reverse case, which is unclassified by design.
   *
   * The unclassified branch asserts NO ```markdown fence at all, not "no fence whose
   * wording `wowSnippets` recognises". `wowSnippets` keys on the phrase `adopted for
   * project management`, a convention no gate enforces — a new guide worded `Jira is
   * the project management tool for this project.` would be invisible to it and ship
   * an unasserted HALTing snippet. Phrasing-independence is free here:
   * github-implementation.md carries zero ```markdown fences today.
   */
  it('every *-implementation.md guide is classified or ships NO markdown fence at all (no unasserted door)', () => {
    const classified = new Set(WOW_SNIPPET_GUIDES.map(g => g.guide))
    for (const [rootLabel, root] of [
      ['dataset', DATASET],
      ['installed', REPO_ROOT],
    ] as const) {
      const guides = readdirSync(join(root, PM_TOOL_KB))
        .filter(name => name.endsWith('-implementation.md'))
        .sort()
      expect(guides.length, `${rootLabel}: no PM implementation guides found`).toBeGreaterThan(0)
      expect(guides, `${rootLabel}`).toEqual(expect.arrayContaining([...classified]))
      for (const guide of guides.filter(g => !classified.has(g))) {
        expect(
          markdownFences(read(root, `${PM_TOOL_KB}/${guide}`)),
          `${guide} (${rootLabel}) ships a fenced \`\`\`markdown block but is not classified in WOW_SNIPPET_GUIDES — classify it with its hostsCode value`,
        ).toEqual([])
      }
    }
  })

  /**
   * The two predicates the sweep above rests on, executed against realistic guide
   * text rather than trusted by inspection.
   */
  describe('the sweep predicates', () => {
    const JIRA_SNIPPET_OFF_PHRASE = [
      '# A guide worded off the `adopted for project management` convention.',
      '',
      '```markdown',
      '# Way of Working',
      '',
      '- Jira is the project management tool for this project.',
      '```',
    ].join('\n')

    it('markdownFences sees a copy-paste surface that wowSnippets is blind to', () => {
      expect(wowSnippets(JIRA_SNIPPET_OFF_PHRASE)).toEqual([])
      expect(markdownFences(JIRA_SNIPPET_OFF_PHRASE)).toHaveLength(1)
    })

    /**
     * The fence grammar the two predicates parse (CommonMark § fenced code blocks):
     * a run of 3+ backticks or tildes, an info string whose first word is the
     * language, then the block. Every row is a fence a guide author could really
     * write; the predicate must read `md` and `markdown` alike, ignore the info
     * string's case and trailing attributes, accept CRLF, and stay blind to other
     * languages and to a bare fence (github-implementation.md ships 18 ```bash
     * fences, all legitimately unclassified).
     */
    const FENCE_ROWS: ReadonlyArray<{
      open: string
      close: string
      eol: string
      fences: number
      why: string
    }> = [
      {
        open: '```markdown',
        close: '```',
        eol: '\n',
        fences: 1,
        why: 'the form every guide uses today',
      },
      { open: '```md', close: '```', eol: '\n', fences: 1, why: 'short language id' },
      { open: '```Markdown', close: '```', eol: '\n', fences: 1, why: 'capitalised language id' },
      {
        open: '```markdown title="way-of-working.md"',
        close: '```',
        eol: '\n',
        fences: 1,
        why: 'trailing info-string attributes',
      },
      { open: '```markdown', close: '```', eol: '\r\n', fences: 1, why: 'CRLF line endings' },
      { open: '~~~markdown', close: '~~~', eol: '\n', fences: 1, why: 'tilde fence' },
      { open: '````markdown', close: '````', eol: '\n', fences: 1, why: 'four-backtick fence' },
      {
        open: '```mdx',
        close: '```',
        eol: '\n',
        fences: 0,
        why: 'a different language that merely starts with md',
      },
      { open: '```bash', close: '```', eol: '\n', fences: 0, why: 'another language' },
      { open: '```', close: '```', eol: '\n', fences: 0, why: 'bare fence, no language' },
    ]
    const fenced = (row: { open: string; close: string; eol: string }) =>
      [
        '# A guide.',
        '',
        row.open,
        '# Way of Working',
        '',
        '- Jira is adopted for project management.',
        row.close,
        '',
        'Prose after the block.',
      ].join(row.eol)

    for (const row of FENCE_ROWS) {
      it(`fence grammar — ${row.why}: ${JSON.stringify(row.open)} → ${row.fences} fence(s)`, () => {
        const content = fenced(row)
        expect(markdownFences(content), 'markdownFences').toHaveLength(row.fences)
        expect(wowSnippets(content), 'wowSnippets').toHaveLength(row.fences)
        for (const block of markdownFences(content)) {
          expect(block).toContain('# Way of Working')
          expect(block).not.toContain('Prose after the block.')
        }
      })
    }

    it('a fence opened with four backticks is closed by four, not by a three-backtick run inside it', () => {
      const content = ['````markdown', '# Outer', '```bash', 'echo hi', '```', '````', ''].join(
        '\n',
      )
      expect(markdownFences(content)).toHaveLength(1)
      expect(markdownFences(content)[0]).toContain('echo hi')
    })

    it('declaresCodeHost is true for a declaration, false for a prose mention', () => {
      expect(
        declaresCodeHost('# Way of Working\n\n## Git Workflow\n\n- `code-host`: `github`.'),
      ).toBe(true)
      // The explicit-but-equal form the resolution rule permits (step 4) — still a
      // declaration, so still off the zero-config path a hosts-code guide must show.
      expect(declaresCodeHost('- `code-host`: `azure-devops`.')).toBe(true)
      // ...but a mention is not a declaration: this must NOT redden a hosts-code guide.
      expect(
        declaresCodeHost(
          '- Azure DevOps is adopted for project management.\n  It hosts code, so no `code-host` line is needed.',
        ),
      ).toBe(false)
    })

    // `## Git Workflow` owns base-branch too, and that is its CURRENT placement per the
    // resolution rule — so a hosts-code guide documenting `develop` ships the heading
    // with no code host under it. Keying the predicate on the heading called that guide
    // a code-host declaration and reddened the gate on legal, recommended content.
    it('declaresCodeHost is false for a Git Workflow section that only sets base-branch', () => {
      expect(
        declaresCodeHost(
          [
            '- Azure DevOps is adopted for project management.',
            '  Organization: <org>. Project: <project>.',
            '',
            '## Git Workflow',
            '',
            '- `base-branch`: `develop`.',
          ].join('\n'),
        ),
      ).toBe(false)
    })
  })

  /**
   * The Key Benefits a reader reaches BEFORE Step 1 must not sell away the field
   * Step 1 makes mandatory: a bullet promising "no external dependencies" invites an
   * agent applying the guide to treat `## Git Workflow` as inapplicable offline, copy
   * the snippet without it, and HALT on the project's first PR operation.
   */
  const NO_DEP_CLAIM = /(no|zero)\s+external\s+dependenc/i

  it('no hosts-no-code PM surface sells an unqualified "no external dependencies" benefit', () => {
    const surfaces = [
      ...WOW_SNIPPET_GUIDES.filter(g => !g.hostsCode).map(g => `${PM_TOOL_KB}/${g.guide}`),
      `${PM_TOOL_KB}/README.md`,
    ]
    for (const [rootLabel, root] of [
      ['dataset', DATASET],
      ['installed', REPO_ROOT],
    ] as const) {
      for (const rel of surfaces) {
        const offending = read(root, rel)
          .split('\n')
          .filter(line => NO_DEP_CLAIM.test(line))
        expect(
          offending,
          `${rel} (${rootLabel}) claims no external dependencies — a code-host is still required (ADR-018)`,
        ).toEqual([])
      }
    }
  })
})

describe('code-host / PM-tool split — the machine-read slots are actually machine-readable (#236, AC3)', () => {
  const PR_TEMPLATE = '.pair/knowledge/guidelines/collaboration/templates/pr-template.md'

  it('the Refs: line carries no trailing whitespace (a hard-break would be captured as part of the id)', () => {
    for (const root of [DATASET, REPO_ROOT]) {
      const template = read(root, PR_TEMPLATE)
      const line = template.split('\n').find(l => l.startsWith('Refs:'))
      expect(line, root).toBeDefined()
      expect(line, root).toBe(line?.trimEnd())
    }
  })

  it('the convention specifies the anchored extraction rule (trim), so "verbatim" is unambiguous', () => {
    for (const root of [DATASET, REPO_ROOT]) {
      const convention = read(root, ROUTING_CONVENTION)
      expect(convention, root).toMatch(/\^Refs:/)
      expect(convention, root).toMatch(/trim/i)
    }
  })

  it('base-branch resolution order (incl. the legacy placement) is single-sourced in the convention', () => {
    const convention = dataset(ROUTING_CONVENTION)
    // `base-branch` is code-formatted in the prose, so the backticks sit between
    // the key and the word — match across them rather than forcing the doc to
    // drop the code span.
    expect(convention).toMatch(/`?base-branch`? resolution/i)
    expect(convention).toMatch(/legacy/i)
    expect(convention).toMatch(/## Merge Strategy[\s\S]{0,200}default `main`|`main`/)
  })

  it('both base-branch readers point at that single source instead of resolving on their own', () => {
    for (const rel of ['capability/publish-pr/SKILL.md', 'process/implement/SKILL.md']) {
      const content = datasetSkill(rel)
      expect(content, rel).toMatch(/base-branch[\s\S]{0,600}(resolution order|legacy)/i)
      expect(content, rel).toContain('way-of-working-pm-resolution.md')
    }
  })

  it('a declared code host with no KB implementation guide degrades (warn + best effort), never a HALT', () => {
    const convention = dataset(ROUTING_CONVENTION)
    expect(convention).toMatch(/no (KB )?implementation guide|undocumented/i)
    expect(convention).toMatch(/(warn|best[- ]effort)/i)
  })

  it('publish-pr cross-references the board-state step by its actual number', () => {
    const content = datasetSkill('capability/publish-pr/SKILL.md')
    expect(content).toMatch(/board state \(step 7\)/)
    expect(content).not.toMatch(/board state \(step 6\)/)
  })

  it('classify renders the unreadable refinement floor instead of inventing a rendering', () => {
    const content = datasetSkill('capability/classify/SKILL.md')
    const output = content.slice(content.indexOf('## Output Format'))
    expect(output.slice(0, output.indexOf('## Worked Examples'))).toMatch(/floor unreadable/i)
  })

  it('verify-quality distinguishes an unreachable PM tool from a genuinely untagged item', () => {
    const content = datasetSkill('capability/verify-quality/SKILL.md')
    expect(content).toMatch(/PM tool[^\n]*(unreachable|not reachable)/i)
  })

  it('the branching guideline is parametrised on base-branch, not hardcoded on main', () => {
    const rel = '.pair/knowledge/guidelines/technical-standards/git-workflow/development-process.md'
    for (const root of [DATASET, REPO_ROOT]) {
      const guideline = read(root, rel)
      expect(guideline, root).toContain('<base-branch>')
      expect(guideline, root).not.toMatch(/git checkout main\b/)
    }
  })

  it('the PM-tool selection page discloses that a hosts-no-code tracker needs code-host', () => {
    const page = read(REPO_ROOT, 'apps/website/content/docs/pm-tools/index.mdx')
    expect(page).toMatch(/code-host/)
    // "host **no code**" — the claim is emphasised in the prose, so allow the
    // bold markers between the verb and the phrase.
    expect(page).toMatch(/(Filesystem|Linear)[\s\S]{0,400}hosts? \*{0,2}no code/i)
  })

  /**
   * The Supported Options comparison table answers "does this option make me sign up
   * for anything?" in one scannable column. A hosts-no-code tracker still requires a
   * code-host account, so a BARE `No` in External Service is the same unqualified
   * claim the prose surfaces dropped (ADR-018) — in the highest-traffic form.
   */
  it('no hosts-no-code row in the Supported Options table sells a bare "External Service: No"', () => {
    const page = read(REPO_ROOT, 'apps/website/content/docs/pm-tools/index.mdx')
    const rows = page
      .split('\n')
      .filter(line => /^\|\s*\[/.test(line))
      .map(line =>
        line
          .split('|')
          .slice(1, -1)
          .map(cell => cell.trim()),
      )
    expect(rows.length, 'Supported Options table not found — has the shape moved?').toBeGreaterThan(
      0,
    )
    const hostsNoCode = rows.filter(cells => /^No\b/i.test(cells[3] ?? ''))
    expect(hostsNoCode.length, 'no hosts-no-code row found in the table').toBeGreaterThan(0)
    for (const cells of hostsNoCode) {
      expect(
        cells[2],
        `${cells[0]}: unqualified External Service cell — a code-host account is still required (ADR-018)`,
      ).not.toMatch(/^No\.?$/i)
    }
  })

  /**
   * ADR-018 scopes the no-mirroring rule to "PR states (draft / ready / approved /
   * merged)" and says in the same breath that macrostate transitions ALWAYS happen on
   * the PM tool. A docs page that drops the parenthetical reads as "the board is never
   * written on a PR event", which its own Status Transitions table contradicts one
   * screen down (`Create PR | … status → "In Review"`). Every board-level claim on the
   * docs surface must therefore carry the enumeration.
   *
   * The detector matches `never mirrored onto <anything>`, not the literal noun "the
   * board": a page naturally names its own tracker (`never mirrored onto Linear`,
   * `never mirrored onto Boards`) and pinning the noun let exactly that phrasing ship
   * unscoped. Row-scoped mentions with no `onto` (linear.mdx's Review table cell,
   * `review state is never mirrored`) stay out of scope — the row names the event.
   *
   * The surface is the WHOLE docs tree, walked, not `pm-tools/` plus a hand-appended
   * page: the claim's natural home also includes `concepts/pr-state-flow.mdx` (where
   * `reference/guidelines-catalog.mdx` routes readers for exactly this topic), and any
   * page named rather than walked is a door the sweep does not watch.
   */
  it('every "never mirrored onto X" claim on the docs site is scoped to PR states', () => {
    const pages = allDocsPages()
    let claims = 0
    for (const rel of pages) {
      for (const line of read(REPO_ROOT, rel).split('\n')) {
        if (!/never mirrored onto/i.test(line)) continue
        claims++
        expect(
          line,
          `${rel}: unscoped no-mirroring claim — name the PR states (draft / ready / approved / merged) it covers`,
        ).toMatch(/draft/i)
      }
    }
    expect(claims, 'no no-mirroring claim found at all — has the wording moved?').toBeGreaterThan(0)
  })

  /**
   * The `In Review` transition is CONDITIONAL: `linear-implementation.md` § State
   * Mapping says a team without an `In Review` state has none mapped to `Review`, and
   * skills report the gap instead of guessing. A page that promises the transition flat
   * ("moves the issue to In Review when the PR opens") tells a reader on a stock Linear
   * team — Backlog / Todo / In Progress / Done — to expect something that will never
   * happen, and contradicts the very table it points at.
   *
   * Detector: a TRANSITION to the state (`→ In Review`, `moves … to "In Review"`), not
   * the bare words — a state-mapping table row or a glossary mention asserts nothing.
   * The qualifier must sit on the CLAIM's own line: the defect this closes is precisely
   * a flat promise followed a line later by its negation, which a window would accept.
   *
   * The verb alternation covers the SYNONYMS that express the same transition, not the
   * two phrasings that happen to be on the site today. Pinning it to `move` reproduced,
   * on the wording axis, the unwatched door the sweep above closed on the path axis: a
   * page worded `pair transitions the issue to In Review` shipped an unconditional
   * promise past a green gate. The gap is capped at 40 non-pipe characters and the
   * preposition must sit immediately before the state, which is what keeps bare
   * state-mapping rows (`| In Review | Review |`) and glossary mentions out.
   *
   * The alternation is also VOICE-independent: verbs carry an inflection suffix rather
   * than a hard-coded `s`, so `is moved to`, `gets marked as`, `is updated to` and the
   * bare infinitive after a modal (`will switch … to`) count as the same promise as the
   * present tense. Passive is arguably the MORE natural voice for docs prose describing
   * what the tool does to the card, so a present-tense-only list left the sweep's own
   * headline case — `The issue is moved to In Review when the PR opens.` — unwatched.
   * Accepted trade-off: a purely descriptive past-participle line (`issues moved to In
   * Review by hand are left untouched`) owes no qualifier yet trips the detector. A
   * false positive costs one qualifier on a docs line; the false negative it replaces
   * shipped an unconditional promise to every reader on a stock Linear team.
   */
  /**
   * Every inflection of every transition verb, written out rather than derived by a
   * suffix rule: `move` + `ing` is not `moveing`, `set` has no `-ed`, `flip` doubles
   * its consonant. The table IS the decision table the meta-test below walks.
   */
  const TRANSITION_VERB_FORMS: ReadonlyArray<readonly string[]> = [
    ['move', 'moves', 'moved', 'moving'],
    ['transition', 'transitions', 'transitioned', 'transitioning'],
    ['advance', 'advances', 'advanced', 'advancing'],
    ['promote', 'promotes', 'promoted', 'promoting'],
    ['set', 'sets', 'setting'],
    ['put', 'puts', 'putting'],
    ['switch', 'switches', 'switched', 'switching'],
    ['flip', 'flips', 'flipped', 'flipping'],
    ['shift', 'shifts', 'shifted', 'shifting'],
    ['update', 'updates', 'updated', 'updating'],
    ['change', 'changes', 'changed', 'changing'],
    ['mark', 'marks', 'marked', 'marking'],
  ]
  const TRANSITION_VERBS = TRANSITION_VERB_FORMS.flat().join('|')
  // The state may be bare, bold, quoted or in backticks — azure-devops.mdx:81 already
  // house-styles it as `In Review`, so the backtick form is the likeliest next phrasing.
  const promisesInReview = (line: string): boolean =>
    new RegExp(
      `(→|->|\\b(?:${TRANSITION_VERBS})\\b[^|\\n]{0,40}\\b(?:to|into|as))\\s*[*"\\x60]*In Review`,
      'i',
    ).test(line)

  /**
   * Is the promise scoped to teams that actually have the state? The qualifier must
   * CONDITION the transition. `default teams` alone does not: it is a bare noun phrase
   * that reads the same in a sentence asserting the opposite (`Linear's default teams
   * move the issue to In Review`), so keying on it excused the exact claim this sweep
   * exists to catch.
   */
  const scopesInReviewToTeamsThatHaveIt = (line: string): boolean =>
    /only if|if the team|where the team|teams? (that|which) have/i.test(line)

  it('every "→ In Review" promise on the docs site says the state is not guaranteed', () => {
    let claims = 0
    const unconditional: string[] = []
    for (const rel of allDocsPages()) {
      const lines = read(REPO_ROOT, rel).split('\n')
      for (const [i, line] of lines.entries()) {
        if (!promisesInReview(line)) continue
        claims++
        if (!scopesInReviewToTeamsThatHaveIt(line)) unconditional.push(`${rel}:${i + 1}`)
      }
    }
    expect(
      unconditional,
      'unconditional "In Review" promise — Linear\'s default teams ship no such state (see the Status Transitions table)',
    ).toEqual([])
    expect(claims, 'no In Review transition found at all — has the wording moved?').toBeGreaterThan(
      0,
    )
  })

  /**
   * The two predicates above, executed against realistic page text rather than trusted
   * by inspection — including the phrasings that slipped the `move`-only detector.
   */
  describe('the In Review sweep predicates', () => {
    it('promisesInReview sees the transition however the sentence words its verb', () => {
      for (const line of [
        'When the PR opens, pair transitions the issue to In Review.',
        'Opening the PR moves the issue to "In Review".',
        'The skill advances the item to **In Review** on PR creation.',
        'pair sets the status to "In Review" when the PR opens.',
        'The adapter updates the work item to In Review.',
        'It marks the issue as In Review as soon as the PR is ready.',
        'PR URL commented on ENG-412; ENG-412 → In Review',
        // Passive / past participle — the more natural voice for docs prose about
        // what the tool does to the card, and the form a present-tense-only
        // alternation lets through.
        'The issue is moved to In Review when the PR opens.',
        'The issue is transitioned to In Review when the PR opens.',
        'The card gets marked as In Review as soon as the PR is ready.',
        'The status is updated to In Review.',
        'The item is flipped to "In Review" by the publish step.',
        'Once the PR is ready the card is switched to In Review.',
        // Bare infinitive after a modal / imperative — same door, other end.
        'Opening a PR will switch the issue to In Review.',
        'The skill can advance the item to **In Review** on PR creation.',
        // Backtick-delimited state — the house style azure-devops.mdx:81 already uses
        // for `In Review`, so the most likely next phrasing of the promise.
        'pair moves the item to `In Review` when the PR opens.',
        'the state → `In Review` on PR open',
        'The issue is moved to `In Review`.',
        // Progressive aspect — a third voice the base/-s/-ed alternation let through.
        'pair is marking the card as In Review on PR creation.',
        'pair is moving the issue to In Review while the PR is opened.',
        'The adapter is setting the status to "In Review".',
        'Opening the PR is flipping the card to In Review.',
      ]) {
        expect(promisesInReview(line), line).toBe(true)
      }
    })

    it('promisesInReview sees every inflection in the verb table, in every delimiter style', () => {
      for (const forms of TRANSITION_VERB_FORMS) {
        for (const form of forms) {
          for (const state of ['In Review', '"In Review"', '**In Review**', '`In Review`']) {
            const line = `pair ${form} the issue to ${state} when the PR opens.`
            expect(promisesInReview(line), line).toBe(true)
          }
        }
      }
    })

    it('promisesInReview ignores a state-mapping row and a glossary mention', () => {
      for (const line of [
        '| In Review    | Review      |',
        'pair skills never reason in board labels like "Todo" or "In Review".',
        'Map `Review` to whatever your board actually has; `az boards work-item update --state "In Review"` fails on a stock Scrum project.',
        'Linear\'s default teams ship no "In Review" state; a skill reports the gap.',
      ]) {
        expect(promisesInReview(line), line).toBe(false)
      }
    })

    it('a bare "default teams" does not scope a promise it is the subject of', () => {
      const inverted = "Linear's default teams move the issue to In Review."
      expect(promisesInReview(inverted)).toBe(true)
      expect(scopesInReviewToTeamsThatHaveIt(inverted)).toBe(false)
      // ...while the real conditional forms on the site still count as scoped.
      expect(
        scopesInReviewToTeamsThatHaveIt('ENG-412 → In Review (only if the team has that state)'),
      ).toBe(true)
      expect(
        scopesInReviewToTeamsThatHaveIt(
          'the table moves the issue to "In Review", on teams that have that state',
        ),
      ).toBe(true)
    })
  })

  it('the Linear guide says who provisions the chromatic risk:/cost: labels', () => {
    const guide = dataset(LINEAR_GUIDELINE)
    expect(guide).toMatch(/`risk:/)
    expect(guide).toMatch(/`risk:[\s\S]{0,600}(issueLabelCreate|reports the gap|created once)/i)
  })
})

describe('code-host / PM-tool split — the design decision is recorded (#236)', () => {
  it('an ADR records the optional code-host override, the cross-link and the review-check placement', () => {
    const adr = read(
      REPO_ROOT,
      '.pair/adoption/tech/adr/adr-018-code-host-optional-wow-override.md',
    )
    expect(adr).toMatch(/^#\s+ADR-018/m)
    expect(adr).toMatch(/code-host/)
    expect(adr).toMatch(/Refs:/)
    expect(adr).toMatch(/mirror/i)
  })
})

describe('code-host / PM-tool split — Linear PM guideline at parity (#236, AC5)', () => {
  it('exists in the KB dataset and in the root mirror', () => {
    expect(existsSync(join(DATASET, LINEAR_GUIDELINE))).toBe(true)
    expect(existsSync(join(REPO_ROOT, LINEAR_GUIDELINE))).toBe(true)
  })

  it('covers the sections the other implementation guides cover (parity, not a stub)', () => {
    const guide = dataset(LINEAR_GUIDELINE)
    for (const heading of [
      /^##\s+Quick Setup/m,
      /^###\s+Prerequisites/m,
      /^###?\s+.*Detection and HALT/m,
      /^###?\s+Adoption Configuration/m,
      /^##\s+Work Item Hierarchy Mapping/m,
      /^##\s+State Mapping/m,
      /^##\s+Working with Issues/m,
      /^##\s+Code Review & PR Management/m,
      /^##\s+Troubleshooting/m,
      /^##\s+Related Resources/m,
    ]) {
      expect(guide, String(heading)).toMatch(heading)
    }
  })

  it('documents BOTH access paths (MCP and the GraphQL API), so adoption can pick', () => {
    const guide = dataset(LINEAR_GUIDELINE)
    expect(guide).toMatch(/MCP/)
    expect(guide).toMatch(/GraphQL/i)
  })

  it('documents estimates and the canonical state mapping for Linear workflow states', () => {
    const guide = dataset(LINEAR_GUIDELINE)
    expect(guide).toMatch(/estimate/i)
    expect(guide).toMatch(/Backlog/)
    expect(guide).toMatch(/In Progress/)
  })

  it('is the reference split case: Linear has no PRs, so PR/review work goes to the code host', () => {
    const guide = dataset(LINEAR_GUIDELINE)
    expect(guide).toMatch(/code[- ]host/i)
    expect(guide).toContain('Refs: <issue-id>')
  })

  it('is listed in the PM-tool framework index and in llms.txt', () => {
    expect(dataset(`${PM_TOOL_KB}/README.md`)).toContain('linear-implementation.md')
    expect(read(REPO_ROOT, '.pair/llms.txt')).toContain('linear-implementation.md')
  })
})
