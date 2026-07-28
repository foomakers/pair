import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'

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
    ['process/implement/SKILL.md', 'pair-process-implement'],
    ['next/SKILL.md', 'pair-next'],
  ]

  for (const [rel] of PR_SIDE) {
    it(`${rel} routes PR/review operations to the code host (never "the PM tool")`, () => {
      const content = datasetSkill(rel)
      expect(content).toMatch(/code host|code-host/i)
      // The conflation the audit exists to kill: reading/writing a PR "from the PM tool".
      expect(content).not.toMatch(/(PR|pull request)[^.\n]{0,40}(from|on|to|using) the PM tool/i)
    })
  }

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
