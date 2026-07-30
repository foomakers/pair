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
