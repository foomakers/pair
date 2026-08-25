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
  /**
   * The `|`-separated alternatives inside an `Approval:` line's brackets.
   *
   * Round 6, Minor 2: this used to anchor the bracket group to end-of-line
   * (`/\[(.*)\]\s*$/`), so ANY trailing text made the match fail and the skill was
   * skipped **silently** — the non-vacuity counter stayed satisfied by another
   * skill. Proven by mutation: a nonsense value plus " (see the note below)" after
   * the bracket left the suite green. Now the first bracket group anywhere on the
   * line, and an unparseable line is a loud failure (see `parsedAlternatives`)
   * rather than an empty list.
   */
  const alternatives = (line: string): string[] =>
    (/\[([^\]]*)\]/.exec(line)?.[1] ?? '')
      .split('|')
      .map(a => a.trim())
      .filter(Boolean)

  /**
   * `alternatives`, but a line the parser cannot read fails the test that asked.
   * A guard whose input parser degrades to "nothing to check" is not a guard.
   */
  const parsedAlternatives = (skill: string, line: string): string[] => {
    const parsed = alternatives(line)
    expect(
      parsed.length,
      `${skill}: this Approval line is not in a shape the guard can read — expected ` +
        `\`Approval:  [a | b | …]\`, got "${line.trim()}"`,
    ).toBeGreaterThan(1)
    return parsed
  }

  const approvalLineOf = (skill: string): string | undefined =>
    read(skillFile(skill))
      .split('\n')
      .find(l => /^[│├└─\s]*Approval:/.test(l))

  const canonicalApprovalLine = (): string =>
    sectionBetween(decisionSection(), '```text', '```')
      .split('\n')
      .find(l => /Approval:/.test(l)) as string

  it('documents each divergent Approval value, in prose that names ITS OWN skill', () => {
    // Round 5, Minor 1: the previous version asserted `paragraph.toContain(skill)`
    // plus a bare `/Approval/`. Both were already true for `assess-stack` and
    // `assess-pm` for UNRELATED reasons (their `Mode` and `Delegated` deltas), so
    // the pin was permanently satisfied for exactly the two of eight skills most
    // likely to diverge — proven by mutation: rewriting `assess-pm`'s Approval line
    // to nonsense kept the suite green, while the same mutation on `assess-testing`
    // (not named in the paragraph) went red.
    //
    // The assertion is bound to the DIVERGENT VALUE ITSELF, which no other skill's
    // delta can supply. Round 6, Minor 3 closed the other half: a ±400-character
    // proximity window still admitted a NEIGHBOUR's name, so `assess-pm` carrying
    // `assess-stack`'s literal value stayed green because "assess-pm" happened to
    // sit within 400 chars of `assess-stack`'s delta sentence. The scope is now the
    // SENTENCES THAT NAME THE SKILL — a character window is not attribution.
    const canonicalAlts = alternatives(canonicalApprovalLine())
    const section = decisionSection()
    let checked = 0

    /** Sentences of § Decision Shape that name `skill`. */
    const sentencesNaming = (skill: string): string[] =>
      section.split(/(?<=\.)\s+/).filter(sentence => sentence.includes(skill))

    for (const skill of DECLARED) {
      const line = approvalLineOf(skill)
      expect(line, `${skill} has no Approval line`).toBeDefined()
      for (const value of parsedAlternatives(skill, line as string).filter(
        a => !canonicalAlts.includes(a),
      )) {
        checked++
        const attributed = sentencesNaming(skill)
        expect(
          attributed.length,
          `${skill}: its Approval line diverges from the canonical shape ("${value}") but ` +
            `§ Decision Shape has no sentence naming ${skill} at all`,
        ).toBeGreaterThan(0)
        expect(
          attributed.some(sentence => sentence.includes(value)),
          `${skill}: the divergent Approval value "${value}" is not documented in a sentence ` +
            `that names ${skill}. Documenting it beside another skill's delta does not ` +
            `attribute it — ${attributed.length} sentence(s) name ${skill} and none carry it.`,
        ).toBe(true)
      }
    }

    // Non-vacuity: today exactly one skill diverges. If that stops being true the
    // loop above silently checks nothing, so the count is asserted to be positive
    // (not to be one — a second legitimate delta must not require a test edit).
    expect(
      checked,
      'no divergent Approval value found — is the extraction working?',
    ).toBeGreaterThan(0)
  })

  it('every skill count claimed in prose equals the declared list length', () => {
    // Round 5, Minor 2: round 4 replaced a WRONG count ("nine") with an
    // UNVERIFIED one ("eight"). `checkProseCounts` only sweeps KB_PROSE_FILES,
    // which does not include this file, so the concrete regression path was: a
    // ninth decision skill lands → the set-equality test fails → someone appends
    // the name to the list → the suite goes green with "eight skills" still
    // written there, falsely claiming to be the authority. That is this story's own
    // business rule ("no hardcoded count — the families grow") broken inside the
    // artifact the story exists to enforce.
    const WORDS: Record<string, number> = {
      one: 1,
      two: 2,
      three: 3,
      four: 4,
      five: 5,
      six: 6,
      seven: 7,
      eight: 8,
      nine: 9,
      ten: 10,
      eleven: 11,
      twelve: 12,
    }
    const section = decisionSection()
    // A COUNT CLAIM is a number that qualifies "skills" directly — "8 **decision**
    // skills", "eight skills" — with at most one word (bold markers included)
    // between. A loose "within 40 characters" window also swallowed prose like
    // "the one that is not a decision: a call the skill …", which counts nothing.
    const claims = [
      ...section.matchAll(
        /\b(\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\b(?:\s+\*{0,2}[a-z-]+\*{0,2})?\s+skills?\b/gi,
      ),
    ]
    expect(claims.length, 'no count claim found — the regex must track the prose').toBeGreaterThan(
      0,
    )
    for (const claim of claims) {
      const raw = claim[1] as string
      const stated = WORDS[raw.toLowerCase()] ?? Number(raw)
      expect(
        stated,
        `prose says "${raw} skills" but the declared list has ${DECLARED.length}`,
      ).toBe(DECLARED.length)
    }
  })
})
