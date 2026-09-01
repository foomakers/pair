import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { syncFrontmatter } from '@pair/content-ops'
import {
  buildDatasetSkillNameMap,
  buildSkillLinkPathMap,
  applyKnownMirrorTransforms,
} from '../tools/skills-guide-mirror'
import { sectionBetween } from './test-utils'

// Conformance guard for story #419: /publish-pr realigns the generated mirrors from
// the LOCAL dataset, at the last point where the regenerated output can still enter
// the branch — and commits it as its OWN commit, or says nothing at all.
//
// The behaviour of the command itself (regenerates, idempotent, fails loud, leaves
// authored changes alone) is exercised against a real fixture repo by
// `packages/dev-tools/src/quality-gates/regenerate-mirrors.test.ts`. What is guarded
// HERE is the part that lives in prose and can only regress in prose: which phase the
// step runs in, that the command is read from the adoption rather than named in the
// skill, that a no-op stays silent, and that the commit is separate and stages only
// generated paths.
//
// See ADL 2026-09-01-publish-pr-realigns-mirrors-before-the-gate.md.

const DATASET = join(__dirname, '../../dataset/.skills/capability/publish-pr/SKILL.md')
const MIRROR = join(__dirname, '../../../../.claude/skills/pair-capability-publish-pr/SKILL.md')
const SKILLS_DIR = join(__dirname, '../../dataset/.skills')
const WAY_OF_WORKING = join(__dirname, '../../../../.pair/adoption/tech/way-of-working.md')

const dataset = (): string => readFileSync(DATASET, 'utf-8')
const mirror = (): string => readFileSync(MIRROR, 'utf-8')

/** Phase 1's body, bounded by the next phase heading — fails closed on a rename. */
const phase1 = (): string =>
  sectionBetween(dataset(), '### Phase 1:', '### Phase 2: Resolve Merge Strategy')

describe('publish-pr realigns mirrors before its gate (#419)', () => {
  it('runs the realignment inside Phase 1, ahead of the /verify-quality composition', () => {
    const p1 = phase1()
    // Ordering is the whole point: mirror drift is what turns the gate red, and a red
    // gate HALTs — so a realignment placed after it is unreachable in the only case it
    // exists for. Anchored to the Phase 1 SPAN, not to the file: `/verify-quality`
    // appears in the frontmatter description and the composed-skills table long before
    // any phase, so a global indexOf comparison would pass on any arrangement.
    const realignIdx = p1.search(/mirror-realign-command/)
    const gateIdx = p1.search(/Compose `\/verify-quality`/)
    expect(realignIdx).toBeGreaterThanOrEqual(0)
    expect(gateIdx).toBeGreaterThan(realignIdx)
  })

  it('reads the command from the adoption instead of naming one (portability)', () => {
    const c = dataset()
    expect(c).toContain('`mirror-realign-command`')
    expect(c).toContain('## Quality Gates')
    // A skill shipped to every adopter must not hardcode this repository's own script.
    expect(c).not.toContain('pnpm mirrors:regenerate')
  })

  it('skips the step entirely when no command is declared, reporting nothing', () => {
    const c = dataset()
    expect(c).toMatch(/Absent ⇒ the realignment step is skipped entirely/)
    expect(c).toMatch(/No `mirror-realign-command` declared[\s\S]{0,200}skip the realignment step/)
  })

  it('regenerates from the LOCAL dataset, never from a published release', () => {
    const p1 = phase1()
    expect(p1).toMatch(/\*\*local\*\* dataset/)
    expect(p1).toContain('never a published release')
  })

  it('commits the generated paths ALONE, and never stages the whole tree', () => {
    const p1 = phase1()
    expect(p1).toContain('git add -A')
    expect(p1).toMatch(/never `git add -A`/)
    expect(p1).toMatch(/stage \*\*only\*\* those paths/)
    expect(p1).toMatch(/never mixed into a feature commit/)
  })

  it('names the commit a regeneration, never a fix (an overwritten hand-edit was restored)', () => {
    const p1 = phase1()
    expect(p1).toMatch(/regenerate mirrors from local dataset/)
    expect(p1).toMatch(/never a "fix"/)
  })

  it('leaves unstaged authored changes untouched and verifies they survived', () => {
    const p1 = phase1()
    expect(p1).toMatch(/unstaged authored changes[\s\S]{0,200}must survive the run untouched/)
    expect(p1).toMatch(/`git status` still shows every pre-existing unstaged authored change/)
  })

  it('stays SILENT on a no-op — no commit and no output row', () => {
    const p1 = phase1()
    expect(p1).toMatch(/a no-op stays \*\*silent\*\*/)
    expect(p1).toMatch(/no commit, and no output row/)
    // The Mirrors row is conditional, which is what "reports nothing" means in a
    // fixed-shape report: the row is absent, not filled with "nothing to do".
    expect(dataset()).toMatch(/omit this row entirely when nothing was committed/)
  })

  it('commits drift in a file the branch never touched, and says so', () => {
    expect(phase1()).toMatch(/Drift in a file this branch never touched is committed here too/)
  })

  it('HALTs before any PR side effect when the command exits non-zero', () => {
    const c = dataset()
    expect(phase1()).toMatch(/non-zero exit → HALT\*\* before any PR side effect/)
    expect(c).toMatch(/exits non-zero\*\* \(Phase 1\)[\s\S]{0,200}no PR side effects/)
  })

  it('installed mirror is reproducible from the dataset via the real transform', () => {
    // Same whole-file guarantee implement-compose-close.test.ts asserts: the mirror must
    // equal the dataset run through the `pair update` copy pipeline (frontmatter `name`
    // rename + the `/command` and `.skills/**` link rewrites). A hand-ported mirror —
    // the exact anomaly #419's command exists to make unnecessary — fails here.
    const reconstructed = applyKnownMirrorTransforms(
      syncFrontmatter(dataset(), { from: 'publish-pr', to: 'pair-capability-publish-pr' }),
      buildDatasetSkillNameMap(SKILLS_DIR),
      buildSkillLinkPathMap(SKILLS_DIR),
    )
    expect(mirror()).toBe(reconstructed)
  })
})

describe("this repository's own wiring for the realignment (#419)", () => {
  it('declares mirror-realign-command, so the step actually runs here', () => {
    const wow = readFileSync(WAY_OF_WORKING, 'utf-8')
    expect(wow).toMatch(/\*\*`mirror-realign-command`\*\*: `pnpm mirrors:regenerate`/)
  })

  it('declares it under Quality Gates — the section publish-pr reads', () => {
    const wow = readFileSync(WAY_OF_WORKING, 'utf-8')
    const gates = sectionBetween(wow, '## Quality Gates', '### Review Tier Matrix')
    expect(gates).toContain('`mirror-realign-command`')
  })
})
