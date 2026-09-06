import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { syncFrontmatter } from '@pair/content-ops'
import {
  buildDatasetSkillNameMap,
  buildSkillLinkPathMap,
  applyKnownMirrorTransforms,
} from '../tools/skills-guide-mirror'

// Conformance guard for story #256: /implement's closing phase composes
// /checkpoint (write) + /publish-pr (via a handoff-only subagent), and its
// opening phase resumes from the checkpoint without repeating completed tasks.
// The 5-step task cycle is unchanged (AC4 — no regression). The subagent
// boundary is mechanical isolation (D23): anonymous, no named role, its prompt
// is the handoff only. Degradation: subagent spawning unavailable ⇒ checkpoint
// still written, /publish-pr invoked inline, degradation noted (AC3).
// See issue #256 and epic #206.

const DATASET = join(__dirname, '../../dataset/.skills/process/implement/SKILL.md')
const MIRROR = join(__dirname, '../../../../.claude/skills/pair-process-implement/SKILL.md')
const SKILLS_DIR = join(__dirname, '../../dataset/.skills')

const dataset = (): string => readFileSync(DATASET, 'utf-8')
const mirror = (): string => readFileSync(MIRROR, 'utf-8')

describe('implement composes checkpoint + publish-pr (#256)', () => {
  it('lists /checkpoint and /publish-pr as composed skills (dataset short refs)', () => {
    const c = dataset()
    expect(c).toMatch(/\/checkpoint\b/)
    expect(c).toMatch(/\/publish-pr\b/)
  })

  it('lists the prefixed composed skills in the installed mirror', () => {
    const c = mirror()
    expect(c).toMatch(/\/pair-capability-checkpoint\b/)
    expect(c).toMatch(/\/pair-capability-publish-pr\b/)
  })

  it('installed mirror is byte-for-byte reproducible from the dataset via the real transform', () => {
    // Whole-file mirror consistency (the same guarantee skills-guide-mirror.test.ts
    // asserts for skills-guide.md): the installed SKILL.md must equal the dataset
    // SKILL.md run through the `pair-cli update` copy pipeline —
    //   1. syncFrontmatter: the `name:` rename `implement` -> `pair-process-implement`
    //      the flatten+prefix directory rename triggers (a SKILL.md carries a renamed
    //      frontmatter `name`, unlike the frontmatter-free skills-guide.md), then
    //   2. applyKnownMirrorTransforms: content-ops `rewriteSkillReferences` +
    //      `rewriteSkillLinkPaths` (the `/command` token + SKILL.md link-path rewrites).
    //
    // One further copy-pipeline transform is NOT modeled by applyKnownMirrorTransforms:
    // the flatten/prefix link-rewriter prepends `./` to a bare same-dir relative link
    // when the file moves (link-rewriter.ts computeNewHref: `if (!startsWith('.')) './'+p`).
    // For this skill that affects only the same-dir sibling `post-review-merge.md` links
    // (`](post-review-merge.md)` in the bare-authored dataset -> `](./post-review-merge.md)`
    // in the mirror). skills-guide.md has no same-dir sibling links, so that helper alone
    // suffices there but not here. We neutralize exactly that systematic `./`-prepend on
    // both sides — every OTHER byte must still match, so any real drift (hand-edited mirror,
    // a dataset edit not propagated via `pair-cli update`) still fails. `pair-cli update` remains
    // the ground truth for regeneration.
    //
    // Restrict the neutralization to SAME-DIR SIBLING links only (`](./name.md)` with no
    // further `/`) — that is the exact and only shape the flatten link-rewriter produces
    // here. A blanket `](./` strip would also mask a nested `](./sub/file.md)` drift, so we
    // keep the guard tight: any `./`-prefixed link with a path segment still fails.
    const skillNameMap = buildDatasetSkillNameMap(SKILLS_DIR)
    const linkPathMap = buildSkillLinkPathMap(SKILLS_DIR)
    const reconstructed = applyKnownMirrorTransforms(
      syncFrontmatter(dataset(), { from: 'implement', to: 'pair-process-implement' }),
      skillNameMap,
      linkPathMap,
    )
    const neutralizeSameDirDotSlash = (s: string): string =>
      s.replace(/\]\(\.\/([^/)]+)\)/g, ']($1)')
    expect(neutralizeSameDirDotSlash(mirror())).toBe(neutralizeSameDirDotSlash(reconstructed))
  })
})

describe('closing phase: checkpoint(write) then publish-pr (AC1)', () => {
  const c = dataset()

  it('writes the checkpoint as the boundary/handoff artifact before publishing', () => {
    // checkpoint is written in write mode at the closing phase.
    expect(c).toMatch(/\$mode\s*=?:?\s*write/i)
    expect(c.toLowerCase()).toContain('checkpoint')
    // Ordering within Phase 3: the checkpoint-write step (Step 3.2) precedes the
    // publish-via-subagent step (Step 3.3). Anchoring on the step HEADINGS is
    // load-bearing: bare indexOf('checkpoint') / indexOf('/publish-pr') both fall
    // inside the frontmatter description, so that comparison is trivially true and
    // would not actually guard the closing-phase ordering.
    const step32Idx = c.search(/#+\s*Step\s*3\.2:\s*Write the Checkpoint/i)
    const step33Idx = c.search(/#+\s*Step\s*3\.3:\s*Publish the PR/i)
    expect(step32Idx).toBeGreaterThanOrEqual(0)
    expect(step33Idx).toBeGreaterThan(step32Idx)
    // and within those steps: checkpoint write ($mode=write) comes before the
    // subagent spawn that runs /publish-pr. Anchor the write search to the
    // Step 3.2 SPAN (step32..step33), not the first global occurrence — the
    // first `$mode=write` in the file is the composed-skills table (and the
    // between-task Step 2.8 write), so a global search would not actually prove
    // the closing-phase write lives inside Step 3.2.
    const step32Span = c.slice(step32Idx, step33Idx)
    const writeWithinStep32 = step32Span.search(/\$mode\s*=?:?\s*write/i)
    expect(writeWithinStep32).toBeGreaterThanOrEqual(0)
    const writeInvocationIdx = step32Idx + writeWithinStep32
    const subagentSpawnIdx = c.toLowerCase().indexOf('spawn an')
    expect(subagentSpawnIdx).toBeGreaterThan(writeInvocationIdx)
  })

  it('spawns an anonymous subagent whose prompt is the handoff only (D23)', () => {
    const low = c.toLowerCase()
    expect(low).toContain('subagent')
    expect(low).toContain('handoff')
    expect(low).toContain('anonymous')
    // mechanical isolation, no named role.
    expect(c).toContain('D23')
    // clean/fresh context reset within one execution.
    expect(low).toMatch(/clean context|fresh context/)
  })

  it('delegates gate + PR to /publish-pr instead of re-doing PR logic', () => {
    // implement never re-does gate/PR logic — composes /publish-pr only.
    expect(c.toLowerCase()).toMatch(/never re-?do|composes .*publish-pr only/)
    // the old raw "create or update PR" template-fill step is gone.
    expect(c).not.toMatch(/#+\s*Step\s*3\.4:\s*Create or Update PR/i)
  })
})

describe('opening phase: resume from checkpoint (AC2)', () => {
  const c = dataset()

  it('probes the checkpoint in resume mode at Phase 0', () => {
    expect(c).toMatch(/\$mode\s*=?:?\s*resume/i)
  })

  it('resumes from the first pending task without repeating completed work', () => {
    const low = c.toLowerCase()
    expect(low).toMatch(/first pending task|first incomplete/)
    expect(low).toMatch(/without repeating|never re-?does completed|skip.*completed/)
  })
})

describe('degraded inline path (AC3)', () => {
  const c = dataset()

  it('falls back to inline /publish-pr when subagent spawning is unavailable', () => {
    const low = c.toLowerCase()
    expect(low).toContain('inline')
    expect(low).toMatch(/subagent spawn|spawning.*unavailable|cannot spawn|no subagent/)
  })

  it('notes the degradation in the output', () => {
    expect(c.toLowerCase()).toMatch(/degrad/)
  })
})

describe('edge cases (#256)', () => {
  const c = dataset()

  it('HALTs on checkpoint/branch divergence (branch missing)', () => {
    const low = c.toLowerCase()
    expect(low).toMatch(/branch.*missing|missing.*branch|diverg/)
    expect(c).toContain('HALT')
  })

  it('warns and requires confirmation on a stale checkpoint (story Done)', () => {
    const low = c.toLowerCase()
    expect(low).toMatch(/stale checkpoint|already done|story.*done/)
    expect(low).toMatch(/confirm/)
  })

  it('treats a subagent failure mid-PR as idempotent rerun (publish-pr updates)', () => {
    const low = c.toLowerCase()
    expect(low).toMatch(/idempotent/)
    expect(low).toMatch(/subagent fail|fails mid|rerun|re-run|re-invoke/)
  })
})

describe('no regression on the 5-step task cycle (AC4)', () => {
  const c = dataset()

  it('keeps the 5-step per-task cycle intact', () => {
    // Phase 2 task cycle anchors remain.
    expect(c).toMatch(/Step 2\.1: Select Next Task/)
    expect(c).toMatch(/Step 2\.7: Verify Quality/)
    expect(c).toMatch(/Step 2\.8: Task Completion/)
  })
})
