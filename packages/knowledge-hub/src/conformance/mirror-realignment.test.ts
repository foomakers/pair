import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { syncFrontmatter } from '@pair/content-ops'
import {
  buildDatasetSkillNameMap,
  buildSkillLinkPathMap,
  applyKnownMirrorTransforms,
} from '../tools/skills-guide-mirror'
import { MIRROR_REGENERATE_COMMAND } from '../tools/skill-md-mirror'
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
const ROOT_PACKAGE_JSON = join(__dirname, '../../../../package.json')

const dataset = (): string => readFileSync(DATASET, 'utf-8')
const mirror = (): string => readFileSync(MIRROR, 'utf-8')

/** Phase 1's body, bounded by the next phase heading — fails closed on a rename. */
const phase1 = (): string =>
  sectionBetween(dataset(), '### Phase 1:', '### Phase 2: Resolve Merge Strategy')

/**
 * The `## Notes` section. It is the file's LAST section, so it runs to EOF and
 * `sectionBetween` (which needs an end marker) does not apply — this fails closed the
 * same way, by throwing when the heading is gone.
 */
const notes = (): string => {
  const content = dataset()
  const start = content.indexOf('## Notes')
  if (start === -1) throw new Error('publish-pr SKILL.md: `## Notes` heading not found')
  return content.slice(start)
}

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
    // Only the negated form is asserted: a bare `toContain('git add -A')` is satisfied by
    // the exact prose this test exists to forbid ("stage everything with `git add -A`"),
    // so it cannot distinguish the rule from its inverse. The regex below proves both.
    expect(p1).toMatch(/never `git add -A`/)
    expect(p1).toMatch(/stage \*\*only\*\* the paths that comparison produced/)
    expect(p1).toMatch(/never mixed into a feature commit/)
  })

  it('derives the staged set from a BEFORE/AFTER porcelain comparison, never from a path glob', () => {
    // The rule this replaces staged "the generated paths the command owns", resolved
    // through the adoption's owned-path globs. In this repository those globs include
    // root `.pair/**`, which holds 117 tracked AUTHORED files under `.pair/adoption/**`
    // (`git ls-files .pair/adoption | wc -l` -> 117). A contributor who edits
    // `.pair/adoption/tech/way-of-working.md`, leaves it unstaged and runs the skill
    // would have their prose committed under `chore: regenerate mirrors from local
    // dataset` — a commit they never wrote — contradicting this same phase's
    // "unstaged authored changes ... must survive the run untouched".
    const p1 = phase1()
    expect(p1).toMatch(/\*\*before\*\* snapshot — `git status --porcelain`/)
    expect(p1).toMatch(/\*\*after\*\* snapshot \(`git status --porcelain` again/)
    expect(p1).toMatch(/appeared, disappeared or changed between the two reads/)
    expect(p1).toMatch(/rather than from a \*\*path glob\*\*/)
    expect(p1).toMatch(/and never a glob/)
    // The portability payoff, stated where the rule is: no adopter enumerates globs.
    expect(p1).toMatch(/no adopter has to enumerate owned globs anywhere/)
  })

  it('pairs the porcelain snapshots with a content DIGEST of the already-dirty paths', () => {
    // Round-2 finding. A porcelain entry encodes STATUS, not content, so on a path that was
    // already dirty before the run the entry is identical either way. Concrete loss: HEAD
    // carries a drifted mirror, the contributor holds an uncommitted hand-edit to that same
    // file, the command regenerates it -> ` M <path>` before, ` M <path>` after. Under a
    // status-only comparison the agent reads NO CHANGE: no commit, no `Mirrors:` row, silence
    // — while the hand-edit is gone from disk and the branch still pushes the stale mirror,
    // turning `skills:conformance` red on the very PR this step exists to keep green.
    // MEASURED against the real script:
    // packages/dev-tools/src/quality-gates/regenerate-mirrors.test.ts, 'overwrites a pre-dirty
    // mirror while `git status --porcelain` stays byte-identical'.
    const p1 = phase1()
    expect(p1).toMatch(/content digest of every path that snapshot reports as dirty/)
    expect(p1).toMatch(/`git hash-object <path>`/)
    expect(p1).toMatch(/encodes \*\*status, not content\*\*/)
    // The digest half must be IN the staged set, not merely detected.
    expect(p1).toMatch(/plus every path already dirty in the before snapshot whose digest changed/)
    // ...and the loss must be reported: silence is the failure mode, not the commit.
    expect(p1).toMatch(/overwrote uncommitted changes in: <paths>/)
    expect(p1).toMatch(/Never silent here/)
    expect(dataset()).toMatch(/overwrote uncommitted changes in: <paths>\]/)
    // The no-op branch must require BOTH halves to be quiet, or it re-opens the same hole.
    expect(p1).toMatch(/equal \*\*and no dirty path's digest moved\*\*/)
  })

  it('names the commit a regeneration, never a fix (an overwritten hand-edit was restored)', () => {
    const p1 = phase1()
    expect(p1).toMatch(/regenerate mirrors from local dataset/)
    expect(p1).toMatch(/never a "fix"/)
  })

  it('verifies survival by CONTENT, so the check cannot certify an unseen overwrite', () => {
    const p1 = phase1()
    expect(p1).toMatch(/unstaged authored changes[\s\S]{0,200}must survive the run untouched/)
    // The previous wording — "`git status` still shows every pre-existing unstaged authored
    // change, untouched" — PASSES on an overwritten file: the path is still listed, because
    // that is what an overwrite of a dirty path leaves behind. The Verify must read the
    // digest, and must say why the listing is not evidence.
    expect(p1).not.toMatch(/`git status` still shows every pre-existing unstaged authored change/)
    expect(p1).toMatch(
      /every pre-existing dirty path that is NOT in the set still carries its before digest/,
    )
    expect(p1).toMatch(/certify the loss it is meant to catch/)
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

  it('Notes carve the Phase-1 write out instead of denying it', () => {
    // A skill whose behaviour IS its prose cannot carry a normative "does not modify
    // source files" in Notes while Phase 1 writes and commits files: an agent or
    // maintainer reconciling the two can conclude the realignment is out of contract
    // and skip or delete it. The Notes bullet must name the exception.
    const n = notes()
    expect(n).not.toMatch(/it does not modify source files/)
    expect(n).toMatch(
      /modifies files \*\*only\*\* through the adoption-declared `mirror-realign-command`/,
    )
    expect(n).toMatch(/never renders a review verdict, and never merges/)
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

  it('every mirror guard prints a command the root package.json actually defines', () => {
    // MIRROR_REGENERATE_COMMAND is the copy of the script name that had NO guard tying
    // it to package.json. `gate:composition` covers dev-tools' MIRROR_REMEDY_SCRIPT and
    // the test above covers the way-of-working literal, so renaming the script to
    // `mirrors:sync` in package.json + MIRROR_REMEDY_SCRIPT + way-of-working.md left
    // both green while every mirror-guard failure still printed
    // "Regenerate with 'pnpm mirrors:regenerate'" — a dead command, the exact class
    // gate:composition exists to prevent for the other remedy step. This closes it from
    // this side: the two packages now both fail against the same package.json.
    const rootPkg = JSON.parse(readFileSync(ROOT_PACKAGE_JSON, 'utf-8')) as {
      scripts?: Record<string, string>
    }
    const runner = 'pnpm '
    expect(MIRROR_REGENERATE_COMMAND.startsWith(runner)).toBe(true)
    const script = MIRROR_REGENERATE_COMMAND.slice(runner.length)
    expect(Object.keys(rootPkg.scripts ?? {})).toContain(script)
  })
})
