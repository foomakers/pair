/**
 * Conformance guard for story #410 / ADR-021 — the non-interactive signal is an
 * argument on the COMPOSED SKILL, not a note on the caller.
 *
 * Two families (`assess-*`, `map-*`) used to end in an unconditional
 * developer-approval round with no signal of their own, so a caller that must not
 * ask had to declare, per composed skill, that it suppressed a round it happened
 * to know about. That shape cannot see the NEXT composed skill that asks: the same
 * defect was found twice in two consecutive review rounds of one PR, on two
 * different surfaces. `$approval` moves the obligation to where the round is.
 *
 * WHY HERE AND NOT ONLY IN THE GATE: the `skills:conformance` gate
 * (`tools/skills-conformance-check.ts`, check 7) enforces the two mechanical
 * per-skill obligations over the DATASET. This file adds what the gate does not
 * see — the INSTALLED mirror, the convention text that is the single statement of
 * the signal, and the two invariants no per-skill grep can express: that the
 * detector actually sees this corpus (a guard that finds zero rounds is green and
 * blind), and that the one judgement gate survives `auto`.
 *
 * DATA-DRIVEN, NO COUNT: every per-skill case is derived from the dataset at
 * collection time, keyed by the family PREFIXES the guard declares. A new
 * `assess-…`/`map-…` member is covered the day it lands, with no edit here — which
 * is AC5's whole point (the defect must not recur in an eleventh surface).
 */
import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync, readdirSync } from 'fs'
import { join } from 'path'
import {
  APPROVAL_SIGNAL_FAMILIES,
  checkApprovalSignal,
  findApprovalRounds,
  findGuidedDrift,
} from '../tools/skills-conformance-check'

const DATASET_SKILLS = join(__dirname, '../../dataset/.skills')
const INSTALLED_SKILLS = join(__dirname, '../../../../.claude/skills')
const KB_REL = 'guidelines/technical-standards/ai-development/skill-conventions/approval-rounds.md'
const CASCADE_REL =
  'guidelines/technical-standards/ai-development/skill-conventions/resolution-cascade.md'

/** The two copies of one KB statement: dataset source and installed mirror. */
const kbCopies = (rel: string): Array<readonly [string, string]> => [
  ['dataset', join(__dirname, '../../dataset/.pair/knowledge', rel)],
  ['installed KB', join(__dirname, '../../../../.pair/knowledge', rel)],
]

const read = (p: string): string => readFileSync(p, 'utf-8')

/**
 * Every dataset skill of an obliged family, as `[category/name, absolute path]`.
 * Read off the directory tree, so the case list IS the corpus.
 */
function familySkills(): Array<readonly [string, string]> {
  const out: Array<readonly [string, string]> = []
  for (const category of readdirSync(DATASET_SKILLS)) {
    const catDir = join(DATASET_SKILLS, category)
    let entries: string[]
    try {
      entries = readdirSync(catDir)
    } catch {
      continue // a file at the registry root, not a category dir
    }
    for (const name of entries) {
      if (!APPROVAL_SIGNAL_FAMILIES.some(prefix => name.startsWith(prefix))) continue
      const file = join(catDir, name, 'SKILL.md')
      if (existsSync(file)) out.push([`${category}/${name}`, file])
    }
  }
  return out.sort(([a], [b]) => a.localeCompare(b))
}

const FAMILY_SKILLS = familySkills()

/** `capability/assess-ai` → `pair-capability-assess-ai` (the installed dir). */
const installedDir = (rel: string): string => `pair-${rel.split('/').join('-')}`

describe('the obliged families honour $approval, per skill present (#410)', () => {
  it('the corpus actually HAS family members to check (a guard over nothing is not green)', () => {
    expect(FAMILY_SKILLS.length).toBeGreaterThan(0)
    for (const prefix of APPROVAL_SIGNAL_FAMILIES) {
      expect(
        FAMILY_SKILLS.some(([rel]) => rel.split('/')[1]?.startsWith(prefix)),
        `no skill found for declared family "${prefix}*"`,
      ).toBe(true)
    }
  })

  it('the detector SEES this corpus — some family member really does declare a round', () => {
    // Without this, a pattern set that stopped matching the corpus would leave
    // every per-skill case below trivially green while the convention went
    // unenforced. Deliberately "some", not "N": which members ask is theirs to
    // change, that at least one does is what makes the guard meaningful.
    const withRounds = FAMILY_SKILLS.filter(([, file]) => findApprovalRounds(read(file)).length > 0)
    expect(withRounds.length).toBeGreaterThan(0)
  })

  for (const [rel, file] of FAMILY_SKILLS) {
    it(`${rel} — every approval round is conditional on $approval (dataset)`, () => {
      expect(checkApprovalSignal(`${rel}/SKILL.md`, read(file))).toEqual([])
    })

    it(`${rel} — if it declares the argument, the detector sees the round it declares it for`, () => {
      // Per-skill anti-blindness pin. `checkApprovalSignal` is silent both for a
      // skill with no round AND for one whose round the pattern set stopped
      // recognising — indistinguishable from the outside. A skill only carries the
      // `$approval` row BECAUSE it asks something, so the row is the corpus's own
      // statement that a round exists: if the detector finds none, it went blind.
      const content = read(file)
      if (!/\|\s*`\$approval`/.test(content)) return
      expect(findApprovalRounds(content).length).toBeGreaterThan(0)
    })

    it(`${rel} — the INSTALLED mirror honours it too (atomic across both corpora)`, () => {
      // Partial adoption is worse than none: a caller passing one signal reads it
      // as total, so an unconverted copy hangs a run that looks correct.
      const mirror = join(INSTALLED_SKILLS, installedDir(rel), 'SKILL.md')
      expect(existsSync(mirror), `${mirror} missing`).toBe(true)
      expect(checkApprovalSignal(`${rel}/SKILL.md`, read(mirror))).toEqual([])
    })
  }
})

describe('tie-break / choice rounds are rounds too (review round 1, Major 1)', () => {
  // The first pass qualified the CONFIRMATION rounds and left three tie-break
  // rounds ("present top 2 with trade-off analysis", "ask developer to choose")
  // unqualified — and the detector did not see them, so the gate stayed green over
  // a hang: under autonomy the run stops on a tie nobody can answer. This is the
  // corpus-level witness that the detector now sees them AND that they are
  // qualified; the injection half (removing the qualification ⇒ red) lives in
  // skills-conformance-check.test.ts.
  const TIE_BREAK = /\b(?:score (?:equally|within)|ask developer to choose)\b/i

  const withTieBreak = FAMILY_SKILLS.filter(([, file]) => TIE_BREAK.test(read(file)))

  it('the corpus still has tie-break rounds to check', () => {
    expect(withTieBreak.length).toBeGreaterThan(0)
  })

  for (const [rel, file] of withTieBreak) {
    it(`${rel} — its tie-break lines are detected and carry the signal`, () => {
      const content = read(file)
      const tieLines = content
        .split('\n')
        .map((line, i) => ({ line: i + 1, text: line }))
        .filter(l => TIE_BREAK.test(l.text))
      expect(tieLines.length).toBeGreaterThan(0)

      const detected = findApprovalRounds(content)
      for (const tie of tieLines) {
        const round = detected.find(r => r.line === tie.line)
        expect(round, `line ${tie.line} is a tie-break the detector does not see`).toBeDefined()
        expect(round?.qualified, `line ${tie.line} is not conditional on $approval`).toBe(true)
      }
    })
  }
})

describe('qualifying a round did not move the guided path (AC2, review round 2)', () => {
  // The round-1 remediation broke AC2 in `assess-methodology`: "name the leader"
  // landed BEFORE the `Under auto` clause, so the guided interview started naming a
  // winner in a near-tie where it used to present two neutral options. AC2 is
  // "guided must not shift by one word", so the invariant is checked over the whole
  // family, in both corpora, not just on the line that broke.
  for (const [rel, file] of FAMILY_SKILLS) {
    it(`${rel} — no auto-only text in the guided half of any round (dataset)`, () => {
      expect(findGuidedDrift(read(file))).toEqual([])
    })

    it(`${rel} — same in the installed mirror`, () => {
      expect(findGuidedDrift(read(join(INSTALLED_SKILLS, installedDir(rel), 'SKILL.md')))).toEqual(
        [],
      )
    })
  }
})

describe('a tie-break resolves from a real source, not an invented order (round 2)', () => {
  // Round 2, Minor: the round-1 wording said "the one the guideline lists first",
  // but nothing in the corpus is a ranking — `assess-testing` Step 3 enumerates
  // "Vitest, Jest, …" while `guidelines/testing/README.md`'s comparison table lists
  // Jest first, so the same exact tie resolved two ways depending on which file was
  // read. A tie-break has to name a source that actually decides.
  const ORDERING_CLAIM = /\b(?:lists?|reaches)\s+first\b/i

  for (const [rel, file] of FAMILY_SKILLS) {
    it(`${rel} — claims no first-in-a-list tie-break`, () => {
      const offenders = read(file)
        .split('\n')
        .filter(line => ORDERING_CLAIM.test(line))
      expect(offenders, `list-order tie-break in ${rel}: ${offenders.join(' | ')}`).toEqual([])
    })
  }

  // Round 3, Minor 2: this pin filtered on the literal "exact tie", which only
  // `assess-methodology` uses — so the two clauses rewritten alongside it
  // (`assess-testing`, `assess-observability`) were outside the filter, and the
  // `toBeGreaterThan(0)` witness was already satisfied by that one skill. The
  // filter is now the concept, not one skill's phrasing, and each match is its own
  // named case so the report shows WHICH skills were actually checked.
  // Round 7: the filter is the DECLARED MARKER, not a word in the prose. A skill
  // resolves a tie iff one of its rounds declares `auto=project-state-then-unresolved`
  // — which is the contract, so the filter cannot drift out from under the pin the
  // way `/exact tie/` and then `/\btie\b/` both did.
  const declaresTieBreak = (content: string): boolean =>
    findApprovalRounds(content).some(r => r.marker?.auto === 'project-state-then-unresolved')

  const withTie = FAMILY_SKILLS.filter(([, file]) => declaresTieBreak(read(file)))

  it('the filter catches every skill that declares a tie-break resolution', () => {
    const matched = withTie.map(([rel]) => rel)
    for (const skill of [
      'capability/assess-methodology',
      'capability/assess-observability',
      'capability/assess-testing',
    ]) {
      expect(matched, `${skill} declares a tie-break and must be pinned`).toContain(skill)
    }
  })

  for (const [rel, file] of withTie) {
    it(`${rel} — the declaring round survives the gate's own contract check`, () => {
      // The gate (`checkApprovalSignal` → `checkDeclaredResolution`) is what verifies
      // that a round declaring `project-state-then-unresolved` actually says so, and
      // says nothing about document order. Asserted here over the real corpus so a
      // regression fails in the conformance suite too, not only in the CLI gate.
      expect(checkApprovalSignal(`${rel}/SKILL.md`, read(file))).toEqual([])
      const declaring = findApprovalRounds(read(file)).filter(
        r => r.marker?.auto === 'project-state-then-unresolved',
      )
      expect(declaring.length).toBeGreaterThan(0)
      for (const round of declaring) {
        expect(round.text, `${rel}:${round.line}`).toMatch(/project state/i)
        expect(round.text, `${rel}:${round.line}`).toMatch(/no proposal|unresolved/i)
        expect(round.text, `${rel}:${round.line}`).not.toMatch(
          /\b(?:listed first|first listed|lists? first|reaches first)\b/i,
        )
      }
    })

    it(`${rel} — ONE line resolves the tie: project state, then the unresolved fallback`, () => {
      // Round 6, Minor 3: the fallback half used to be asserted over the WHOLE
      // FILE, where `/(no proposal|unresolved)/` is permanently satisfied by the
      // `$approval` Argument row and the `Approval:` output line that every family
      // member now carries. Proven by mutation: replacing this skill's fallback with
      // "the first framework simply wins" — the round-2 defect exactly, a tie
      // resolved by list order — left the suite green.
      //
      // Both halves are now required on the SAME line as the word "tie", so the
      // sentence that resolves the tie is the sentence being checked. That is also
      // how the resolution actually reads in the corpus: one clause, both branches.
      const resolving = read(file)
        .split('\n')
        .filter(line => /\btie\b/i.test(line) && /project state/i.test(line))

      expect(
        resolving.length,
        `${rel}: no single line both names a tie and resolves it from project state`,
      ).toBeGreaterThan(0)

      for (const line of resolving) {
        expect(
          line,
          `${rel}: this tie-break line resolves from project state but never says what ` +
            `happens when project state is silent — "${line.trim().slice(0, 120)}…"`,
        ).toMatch(/no proposal|unresolved/i)
      }
    })
  }
})

describe('the "unresolved" outcome is expressible at the interface (round 3, Minor 1)', () => {
  // A caller running `auto` can hit three outcomes, and the third one is not a
  // decision: an exact tie project state does not settle yields NO proposal. Both
  // surfaces a caller reads — the Argument row (what the mode promises) and the
  // Output Format (what comes back) — have to be able to say so, or the caller is
  // left inferring it from a missing field. The `map-*` pair already carried an
  // `Approval:` line; the nine `assess-*` did not.
  const declaring = FAMILY_SKILLS.filter(([, file]) => /\|\s*`\$approval`/.test(read(file)))

  /** The `Approval:` line of an Output Format block, if the skill has one. */
  const approvalLine = (content: string): string | undefined =>
    content.split('\n').find(l => /^[│├└─\s]*Approval:/.test(l))

  /**
   * The skill's own declaration that `auto` can end without a decision. Round 3's
   * version of this pin keyed on a LITERAL BODY PHRASE ("no proposal is emitted"),
   * which matched three skills and missed `assess-architecture` — whose Graceful
   * Degradation says "emits **no proposal**" in different words. Reverting that
   * skill's Argument row to the old two-branch wording therefore left the suite
   * green: a gate above a regression, the same defect class round 3 had just
   * closed on two other skills. The `Approval:` line is the right key because it is
   * the skill's own INTERFACE statement of the outcome set — structural, not a
   * phrasing, and exactly what a caller reads.
   */
  const declaresUnresolved = (content: string): boolean =>
    /unresolved/i.test(approvalLine(content) ?? '')

  const withUnresolved = declaring.filter(([, file]) => declaresUnresolved(read(file)))

  it('every skill that declares the argument is covered here', () => {
    expect(declaring.length).toBeGreaterThan(0)
  })

  it('the conditional assertion below is not vacuous, and covers every assess-* member', () => {
    // The check is conditional because the two `map-*` members legitimately have no
    // unresolved outcome (`map-subdomains` has two branches; `map-contexts`' third
    // is the HALT its row already names). Every OTHER declaring member must be in
    // it — stated as "all except the map-* pair" rather than as a number, so a new
    // family member joins the pin by construction.
    expect(withUnresolved.length).toBeGreaterThan(0)
    const excluded = declaring
      .filter(([, file]) => !declaresUnresolved(read(file)))
      .map(([rel]) => rel)
    expect(excluded.sort()).toEqual(['capability/map-contexts', 'capability/map-subdomains'])
  })

  for (const [rel, file] of declaring) {
    it(`${rel} — the Output Format carries an Approval line a caller can read`, () => {
      expect(approvalLine(read(file))).toBeDefined()
    })
  }

  for (const [rel, file] of withUnresolved) {
    it(`${rel} — its Argument row states the unresolved outcome its interface declares`, () => {
      const content = read(file)
      const row = content.split('\n').find(l => /\|\s*`\$approval`/.test(l)) as string
      // The round-2 wording claimed a tie is always "resolved deterministically",
      // which the unresolved branch contradicts. Nobody may promise that again.
      expect(row).not.toMatch(/resolved deterministically/i)
      // Row-vs-Output-Format consistency: the row is what a caller reads BEFORE
      // invoking, so an outcome the return value can carry and the row does not
      // mention is an outcome the caller has no declared way to handle.
      expect(row).toMatch(/unresolved|no proposal/i)
    })
  }
})

describe('the convention is the single statement of the signal (#410)', () => {
  for (const [label, path] of kbCopies(KB_REL)) {
    it(`${label} copy states the default, the resolutions and the authoring obligation`, () => {
      const doc = read(path)
      // The default is what makes the change guided-neutral (AC2).
      expect(doc).toMatch(/`interactive`[\s\S]{0,200}default/i)
      expect(doc).toMatch(/omitted[\s\S]{0,120}`?\$approval`?[\s\S]{0,120}resolves here/i)
      // The three round kinds, each with its resolution under `auto`.
      expect(doc).toMatch(/Accept it as-is/i)
      expect(doc).toMatch(/Keep what is already recorded/i)
      expect(doc).toMatch(/HALTs/)
      // `auto` suppresses asking, never judging — and never reporting.
      expect(doc).toMatch(/suppresses \*?asking\*?, never \*?judging\*?/i)
      expect(doc).toMatch(/"do not ask", not "do not report"/i)
      // AC5: the obligation binds a family member that does not exist yet.
      expect(doc).toMatch(/must honour `\$approval`/)
      expect(doc).toMatch(/new family member/i)
    })
  }

  for (const [label, path] of kbCopies(CASCADE_REL)) {
    it(`${label} cascade qualifies the two rounds it owns, so no skill restates them`, () => {
      const cascade = read(path)
      // Path A's confirmation and Path B's keep-or-redo are the rounds every
      // cascade-following skill inherits — qualified once, here.
      expect(cascade).toMatch(/\*\*Act\*\* \(`\$approval: interactive`\)/)
      expect(cascade).toMatch(/Under `\$approval: auto`[\s\S]{0,400}accepted as passed/)
      expect(cascade).toMatch(/Under `\$approval: auto`[\s\S]{0,400}\*\*kept\*\*/)
      expect(cascade).toMatch(/never these two|never restated per skill/i)
      expect(cascade).toContain('approval-rounds.md')
    })
  }
})

describe('the judgement gate survives the signal (#410, AC4)', () => {
  // #278 kept this gate deliberately in bootstrap's quick depth: writing a domain
  // model that records a coupling risk nobody judged is worse than asking one
  // question. A generic non-interactive signal must not swallow it — and it must
  // survive BY THE MECHANISM (a round with no proposal to accept), not by an
  // exception a future caller has to remember.
  const copies = (): Array<readonly [string, string]> => [
    ['dataset', join(DATASET_SKILLS, 'capability/map-contexts/SKILL.md')],
    ['installed', join(INSTALLED_SKILLS, 'pair-capability-map-contexts/SKILL.md')],
  ]

  for (const [label, path] of copies()) {
    it(`${label} map-contexts HALTs on unbalanced + volatile under every $approval value`, () => {
      const skill = read(path)
      expect(skill).toMatch(/unbalanced \+ volatile/i)
      expect(skill).toMatch(/HALTs? under every value of `\$approval`/)
      // and the argument row says so where a caller reads it
      expect(skill).toMatch(/`\$approval`[\s\S]{0,600}does not lift the Step 3 gate/)
    })
  }
})
