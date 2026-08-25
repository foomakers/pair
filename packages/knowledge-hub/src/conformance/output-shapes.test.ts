/**
 * Conformance guard for `skill-conventions/output-shapes.md` — the Decision Shape.
 *
 * The doc declares a canonical Output Format and names the skills that use it. Until
 * this file, nothing enforced either half: a grep for `output-shapes` across `src/`
 * came back empty, so "the shape and the skills cannot drift apart" was a claim in
 * prose with no mechanism behind it. It was already drifting — the shape gained an
 * `Approval` line in one place while one skill wrote a different value on it, and
 * whether that was a bug or an accepted delta was not stated anywhere.
 *
 * Both directions are checked, because each catches a different mistake:
 *  - every skill the doc NAMES must actually carry the canonical labels (a skill
 *    that reshapes its output silently stops following the shape it points at);
 *  - every skill whose output IS a Decision Shape block must be NAMED (a new
 *    decision skill that nobody adds to the list inherits nothing).
 *
 * Data-driven per skill present, no count asserted: the declared list is parsed out
 * of the doc and the actual set is read off the corpus, so adding a decision skill
 * means editing the doc — not this file.
 *
 * One file per target KB artifact, per the conformance-test-per-file ADL: this is
 * `output-shapes.md`'s file. The `$approval` argument/round obligations live in
 * `approval-signal.test.ts`, which targets a different artifact.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, existsSync } from 'fs'
import { join } from 'path'
import { sectionBetween } from './test-utils'

const CAPABILITY_DIR = join(__dirname, '../../dataset/.skills/capability')
const DOC = join(
  __dirname,
  '../../dataset/.pair/knowledge/guidelines/technical-standards/ai-development/skill-conventions/output-shapes.md',
)

const read = (p: string): string => readFileSync(p, 'utf-8')
const skillFile = (name: string): string => join(CAPABILITY_DIR, name, 'SKILL.md')

/** The Decision Shape section, so a name elsewhere in the doc is never mistaken for a member. */
const decisionSection = (): string =>
  sectionBetween(read(DOC), '## Decision Shape', '## Report Shape')

/** Skill names the doc declares as Decision Shape users, in declaration order. */
function declaredDecisionSkills(): string[] {
  const intro = decisionSection()
    .split('\n')
    .find(l => l.startsWith('Used by')) as string
  return [...intro.matchAll(/`(assess-[a-z-]+)`/g)].map(m => m[1] as string)
}

/** Skills whose Output Format really is a Decision Shape block. */
function actualDecisionSkills(): string[] {
  return readdirSync(CAPABILITY_DIR)
    .filter(name => existsSync(skillFile(name)))
    .filter(name => /^ASSESSMENT COMPLETE/m.test(read(skillFile(name))))
    .sort()
}

/** The row labels the canonical block carries, parsed from the doc's own fence. */
function canonicalLabels(): string[] {
  const fence = sectionBetween(decisionSection(), '```text', '```')
  return [...fence.matchAll(/^[│├└─\s]*([A-Z][a-z]+):/gm)].map(m => m[1] as string)
}

const DECLARED = declaredDecisionSkills()

describe('the Decision Shape declares the set of skills that actually use it', () => {
  it('names at least one skill, and parses (a silent parse failure would pass everything)', () => {
    expect(DECLARED.length).toBeGreaterThan(0)
    expect(canonicalLabels()).toContain('Approval')
  })

  it('the declared list equals the set of skills whose output IS a Decision Shape block', () => {
    // Set equality, so both a stale name and an unlisted new decision skill fail.
    expect([...DECLARED].sort()).toEqual(actualDecisionSkills())
  })

  it('excludes `assess-security`, whose block is a different shape', () => {
    // Its Output Format is `SECURITY AUDIT COMPLETE` with mode-specific rows, so it
    // is not a Decision Shape member — the count is EIGHT, not nine, and the doc
    // must not quietly acquire it just because it now has an `Approval` line too.
    expect(DECLARED).not.toContain('assess-security')
    expect(read(skillFile('assess-security'))).toMatch(/^SECURITY AUDIT COMPLETE/m)
  })
})

describe('every declared Decision Shape skill carries the canonical labels', () => {
  for (const skill of DECLARED) {
    it(`${skill} — has every canonical row label in its ASSESSMENT COMPLETE block`, () => {
      const block = sectionBetween(read(skillFile(skill)), 'ASSESSMENT COMPLETE', '```')
      for (const label of canonicalLabels()) {
        expect(block, `${skill} is missing the \`${label}\` row`).toMatch(
          new RegExp(`^[│├└─\\s]*${label}:`, 'm'),
        )
      }
    })
  }
})

describe('a per-skill delta on the shape is documented as one', () => {
  // The doc already documents `assess-stack`'s `Mode` row and wider `Status` set,
  // and `assess-pm`'s `Delegated` status. Round 4 found a third, undocumented one:
  // `assess-stack` writes `auto — UNRESOLVED, handed back to the caller` where the
  // canonical line says `no proposal`. That is a real difference in meaning (the
  // skill is output-only, so its unresolved judgement goes back to the caller
  // rather than becoming a non-proposal), which makes it a delta to state — the
  // alternative, silently diverging from the shape you point at, is what this file
  // exists to prevent.
  const deltaParagraph = (): string =>
    decisionSection()
      .split('\n')
      .find(l => l.startsWith('Per-skill delta:')) as string

  it('documents every Approval-line wording that differs from the canonical one', () => {
    const canonical = (
      sectionBetween(decisionSection(), '```text', '```')
        .split('\n')
        .find(l => /Approval:/.test(l)) as string
    ).trim()

    for (const skill of DECLARED) {
      const line = read(skillFile(skill))
        .split('\n')
        .find(l => /^[│├└─\s]*Approval:/.test(l))
      expect(line, `${skill} has no Approval line`).toBeDefined()
      if ((line as string).trim() === canonical) continue
      // Divergent ⇒ the doc's delta paragraph must name the skill AND the row.
      expect(deltaParagraph(), `${skill}'s Approval-line delta is undocumented`).toContain(skill)
      expect(deltaParagraph()).toMatch(/Approval/)
    }
  })
})
