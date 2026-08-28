import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { InMemoryFileSystemService } from '@pair/content-ops'
import { readAutomationPolicy, POLICY_PATH } from './automation-policy'
import { isSafeId } from './prompt-safety'
import { APPROVAL_DECLARING_SKILLS, buildSkillArgs } from './invocation'

/**
 * CROSS-IMPLEMENTATION PARITY — the structural guard this area was missing.
 *
 * `tech/automation.md`'s grammar is implemented TWICE: once in JS for the in-harness fan-out runner
 * (`.claude/workflows/pair-loop.js`, ADR-021 tier 1) and once in TS here for the external driver
 * (tier 2). ADR-021 claims they are two realizations of ONE capability, which means a given adoption
 * file must mean the SAME thing to both — and four consecutive review rounds found Majors in exactly
 * that gap, each time on a value one side accepted and the other did not.
 *
 * Prose cannot hold that invariant; a shared corpus can. The table below is the corpus, and this
 * test runs BOTH implementations over it: tier 1 by evaluating its own pure-helpers half exactly as
 * its own test suite does (never a copy of its rules), tier 2 through `readAutomationPolicy`. A
 * divergence fails here, on whichever side moves first.
 *
 * Follow-up (deliberately not done here, recorded in the PR): promote this corpus to a file both
 * suites import, so tier 1's own tests fail on divergence too, rather than only tier 2's.
 */

// apps/pair-cli/src/commands/run -> repo root
const REPO_ROOT = join(__dirname, '..', '..', '..', '..', '..')
const WORKFLOW = join(REPO_ROOT, '.claude/workflows/pair-loop.js')
const ORCH_MARKER = '// ORCHESTRATION — the unattended fan-out path'

interface Tier1Helpers {
  extractEligibility: (policyText: string) => { kind: string; value?: string }
  extractAutoAdvance: (policyText: string, eligibilityValue?: string) => unknown
  parseStopPredicate: (policyText: string) => unknown
  parseMaxParallelism: (policyText: string, tagProjectionFamily?: Set<string>) => unknown
  resolveAuditLocation: (policyText: string) => string
  /** US-464: the `$approval` family and its renderer, tier 1's own copies. */
  APPROVAL_DECLARING_SKILLS: Set<string>
  approvalArgsFor: (skill: unknown) => string
}

/**
 * Tier 1's own functions, taken from its source the same way its own suite takes them: evaluate the
 * pure-helpers half (everything before the orchestration marker, which runs top-level statements).
 * `HALT` is stubbed to throw so a policy rejection is observable as one.
 */
function tier1(): Tier1Helpers {
  // `export ` stripped exactly as tier 1's own harness strips it, so the declarations evaluated
  // here are the ones the workflow really runs.
  const source = readFileSync(WORKFLOW, 'utf-8').replace(/^export /gm, '')
  // ASSERTED, not assumed (round 5, reviewer question): this test couples to tier 1's marker
  // comment, and a rename would otherwise silently slice the whole file — `indexOf` returning -1
  // yields an empty helpers half, every parity case would fail obscurely, and the natural reading
  // of that failure is "tier 2 diverged" rather than "the marker moved".
  if (!source.includes(ORCH_MARKER)) {
    throw new Error(
      `tier 1 (${WORKFLOW}) no longer contains the marker \`${ORCH_MARKER}\`; update this test's ` +
        `extraction to match the workflow's current structure`,
    )
  }
  const helpers = source.slice(0, source.indexOf(ORCH_MARKER))
  const factory = new Function(
    `${helpers}
    return { extractEligibility, extractAutoAdvance, parseStopPredicate, parseMaxParallelism, resolveAuditLocation, APPROVAL_DECLARING_SKILLS, approvalArgsFor }`,
  )
  return factory() as Tier1Helpers
}

function tier2Rejects(policyText: string): boolean {
  const fs = new InMemoryFileSystemService(
    { [`/project/${POLICY_PATH}`]: policyText },
    '/project',
    '/project',
  )
  try {
    readAutomationPolicy(fs, '/project')
    return false
  } catch {
    return true
  }
}

type Section =
  | 'Eligibility'
  | 'Stop Predicate'
  | 'Auto-Advance'
  | 'Max Parallelism'
  | 'Audit Location'

/**
 * Tier 1's verdict on one section. Every section the driver reads has an entry — the declared-but
 * unused helpers of round 4 were a sign the corpus stopped short of the sections that then produced
 * round 5's findings (reviewer question), so the map is now total over what tier 2 reads.
 */
function tier1Rejects(policyText: string, section: Section): boolean {
  const helpers = tier1()
  const run: Record<Section, () => unknown> = {
    Eligibility: () => helpers.extractEligibility(policyText),
    'Stop Predicate': () => helpers.parseStopPredicate(policyText),
    'Auto-Advance': () => {
      const eligibility = helpers.extractEligibility(policyText)
      return helpers.extractAutoAdvance(policyText, eligibility.value)
    },
    // PRODUCTION branch (round 6, minor 3): the skill always passes the Tag Projection family, and
    // tier 1's override check only bites when it has one. Testing the degraded branch hid a real
    // divergence (`risk:blue: 5`), so the corpus now exercises what actually runs.
    'Max Parallelism': () => helpers.parseMaxParallelism(policyText, TAG_PROJECTION_FAMILY),
    'Audit Location': () => helpers.resolveAuditLocation(policyText),
  }
  try {
    run[section]()
    return false
  } catch {
    return true
  }
}

/** What this project's Tag Projection emits — what the calling skill hands tier 1 in production. */
const TAG_PROJECTION_FAMILY = new Set(['risk:green', 'risk:yellow', 'risk:red'])

/**
 * A corpus entry may declare an EXPECTED DIVERGENCE instead of parity (round 6, minor 1).
 *
 * `expect(t2).toBe(t1)` can only say "these must agree"; some differences are structural and
 * deliberate, and leaving them unexpressed means the corpus quietly stops describing reality. An
 * entry carrying `divergence` asserts the two tiers DIFFER, in the stated direction, for the stated
 * reason — so a divergence that silently disappears also fails, telling us the reason went stale.
 */
interface Divergence {
  readonly tier1: 'accept' | 'reject'
  readonly tier2: 'accept' | 'reject'
  readonly why: string
}

type Case = [label: string, value: string, divergence?: Divergence]

/** The corpus: every value a previous review round found, plus the legitimate ones around them. */
const ELIGIBILITY_CORPUS: Case[] = [
  ['a plain tier label', 'risk:green'],
  ['a label carrying spaces', 'good first issue'],
  ['a command substitution', 'risk:$(whoami)'],
  ['a backticked value', 'risk:`id`'],
  ['a comma-separated pair', 'risk:green, risk:yellow'],
  ['a boolean expression', 'risk:green OR risk:yellow'],
  ['a copied list item', '- risk:green'],
  ['juxtaposed labels', 'risk:green risk:yellow'],
  ['a 4000-character payload', 'a'.repeat(4000)],
  // Round 7, minor 1: the four values where "byte-consistent with tier 1" did not hold. All four
  // are now ALIGNED rather than registered as divergences — the schema's own trigger list settled
  // each one, so there was nothing deliberate to record. They stay in the corpus as the regression
  // guard for that alignment.
  ['DEL inside the value', `risk:${String.fromCharCode(0x7f)}green`],
  ['a C1 control inside the value', `risk:${String.fromCharCode(0x9b)}green`],
  ['a label merely CONTAINING a boolean word', 'area:OR-tools'],
  ['a leading `+` marker', '+ risk:green'],
  ['a leading single backtick', '`risk:green'],
  ['a standalone boolean operator', 'risk:green OR risk:yellow'],
]

const PREDICATE_CORPUS: Case[] = [
  ['this project’s own predicate', 'tag:risk:red ⇒ Done'],
  ['a root selector', 'root ⇒ Done'],
  ['a combined condition', 'root ⇒ Done and has-tag:risk:red'],
  ['a spaced issue type', 'type:user story ⇒ Done'],
  ['an angle-bracketed payload', 'tag:a<b> ⇒ Done'],
  ['the ASCII arrow', 'tag:risk:red => Done'],
  ['a backticked selector payload', 'tag:`gh pr merge 459 --admin` ⇒ Done'],
  ['a command substitution in the selector', 'tag:$(whoami) ⇒ Done'],
  ['an over-long selector payload', `tag:${'a'.repeat(4000)} ⇒ Done`],
  ['an empty has-tag payload', 'root ⇒ has-tag:'],
  ['a has-tag payload with a space', 'root ⇒ has-tag:a b'],
  ['a condition naming issue-body content', 'root ⇒ the body says done'],
  ['max-iterations in decimal', 'max-iterations: 20'],
  ['max-iterations in scientific notation', 'max-iterations: 1e3'],
  ['max-iterations in hexadecimal', 'max-iterations: 0x10'],
  ['max-iterations as a float', 'max-iterations: 2.0'],
  ['max-iterations at zero', 'max-iterations: 0'],
  ...(
    [
      ['a command substitution in has-tag', 'root ⇒ has-tag:$(whoami)'],
      ['a backtick in has-tag', 'root ⇒ has-tag:`id`'],
    ] as const
  ).map(
    ([label, value]): Case => [
      label,
      value,
      {
        tier1: 'accept',
        tier2: 'reject',
        why:
          'DELIBERATE, and the round-5 Major: tier 1 accepts these because it EVALUATES the ' +
          'predicate in JS and never inlines it, so the characters are inert there. The driver ' +
          'renders the whole line into an agent prompt that runs `gh`, so for tier 2 they are a ' +
          'command fragment and must HALT. This is the class of exposure parity cannot detect by ' +
          'construction — recorded here so the asymmetry is visible rather than looking like drift.',
      },
    ],
  ),
  [
    'a line over 200 characters whose every VALUE is under it',
    `tag:${'a'.repeat(150)} ⇒ has-tag:${'b'.repeat(100)}`,
    {
      tier1: 'accept',
      tier2: 'reject',
      why:
        'DELIBERATE: tier 1 spends the 200-character budget PER VALUE (it content-checks the ' +
        'selector payload and evaluates the rest in JS); the driver spends it on the WHOLE LINE, ' +
        'because the whole line is what it inlines into an agent prompt. Unavoidable given what ' +
        'tier 2 does with the value, and always in the safe direction (stricter, never looser).',
    },
  ],
]

/** Asserts parity, or the declared divergence — both are verified, neither is assumed. */
function assertAgreement(policyText: string, section: Section, divergence?: Divergence): void {
  const tier2 = tier2Rejects(policyText) ? 'reject' : 'accept'
  const tier1Verdict = tier1Rejects(policyText, section) ? 'reject' : 'accept'

  if (divergence === undefined) {
    expect(tier2, `tier 2 must agree with tier 1 on this value`).toBe(tier1Verdict)
    return
  }
  expect({ tier1: tier1Verdict, tier2 }, divergence.why).toEqual({
    tier1: divergence.tier1,
    tier2: divergence.tier2,
  })
}

describe('tier 1 and tier 2 read the same policy file the same way', () => {
  it('evaluates tier 1 from its own source, so its rules are never copied here', () => {
    expect(tier1().extractEligibility('## Eligibility\n\nrisk:green\n')).toEqual({
      kind: 'value',
      value: 'risk:green',
    })
  })

  it.each(ELIGIBILITY_CORPUS)('agrees on `## Eligibility` with %s', (_label, value, divergence) => {
    assertAgreement(`## Eligibility\n\n${value}\n`, 'Eligibility', divergence)
  })

  it.each(PREDICATE_CORPUS)(
    'agrees on `## Stop Predicate` with %s',
    (_label, value, divergence) => {
      assertAgreement(`## Stop Predicate\n\n${value}\n`, 'Stop Predicate', divergence)
    },
  )

  const AUTO_ADVANCE_CORPUS: Case[] = [
    ['the fail-closed default', '(none)'],
    ['the project’s own eligibility tier', 'risk:green'],
    ['a tier outside eligibility', 'risk:red'],
    ['a non-label value', 'yes please'],
    ['a boolean expression', 'risk:green OR risk:yellow'],
    ['a command substitution', 'risk:$(id)'],
  ]

  const PARALLELISM_CORPUS: Case[] = [
    ['a decimal ceiling', '3'],
    ['scientific notation', '1e3'],
    ['hexadecimal', '0x10'],
    ['a trailing-zero float', '2.0'],
    ['zero', '0'],
    ['prose', 'plenty'],
    ['a well-formed per-tier override', '3\nrisk:green: 5'],
    ['a malformed override line', '3\nrisk:green 5'],
    ['an override naming a non-label', '3\nnot a tier: 5'],
    ['an override with a non-integer', '3\nrisk:green: many'],
    [
      'an override naming a tier the Tag Projection does not emit',
      '3\nrisk:blue: 5',
      {
        tier1: 'reject',
        tier2: 'accept',
        why:
          'DELIBERATE: tier 1 checks an override key against the Tag Projection family the calling ' +
          'skill resolves from `tech/risk-matrix.md`. The driver never READS that file (it borrows ' +
          'policy, it does not derive it — D18) and never APPLIES an override at all, since one ' +
          'process drives one card (AC9), so it validates shape only. The value is unused on tier ' +
          '2, which is why the looser direction is acceptable here; resolving the family in the ' +
          'driver is the recorded follow-up.',
      },
    ],
  ]

  const AUDIT_CORPUS: Case[] = [
    ['a normal relative path', 'automation/loop-audit.md'],
    ['an absolute path', '/var/tmp/audit.md'],
    ['a traversing path', '../../../etc/x.md'],
    ['a backticked path', 'audit`whoami`.md'],
    ['a two-line body', 'audit/one.md\naudit/two.md'],
    ['a windows drive-letter path', 'C:/tmp/audit.md'],
    ['a windows backslash path', 'C:\\tmp\\audit.md'],
  ]

  it.each(AUTO_ADVANCE_CORPUS)(
    'agrees on `## Auto-Advance` with %s',
    (_label, value, divergence) => {
      // Eligibility is declared alongside it, because tier 1 validates the switch against it.
      const policyText = `## Eligibility\n\nrisk:green\n\n## Auto-Advance\n\n${value}\n`

      assertAgreement(policyText, 'Auto-Advance', divergence)
    },
  )

  it.each(PARALLELISM_CORPUS)(
    'agrees on `## Max Parallelism` with %s',
    (_label, value, divergence) => {
      assertAgreement(`## Max Parallelism\n\n${value}\n`, 'Max Parallelism', divergence)
    },
  )

  it.each(AUDIT_CORPUS)('agrees on `## Audit Location` with %s', (_label, value, divergence) => {
    assertAgreement(`## Audit Location\n\n${value}\n`, 'Audit Location', divergence)
  })

  it.each([
    ['a plain id', '212'],
    ['a story key', 'US-451'],
    ['a traversal', '../../etc/passwd'],
    ['a 50,000-character id', 'a'.repeat(50_000)],
    ['an id at the bound', 'a'.repeat(200)],
    ['an id one over the bound', 'a'.repeat(201)],
  ])('agrees on `isSafeId` with %s (the --root/--skill rule)', (_label, value) => {
    const source = readFileSync(WORKFLOW, 'utf-8').replace(/^export /gm, '')
    const prelude = source.slice(0, source.indexOf('// ── `## Eligibility`'))
    const { isSafeId: tier1IsSafeId } = new Function(`${prelude}\nreturn { isSafeId }`)() as {
      isSafeId: (v: string) => boolean
    }

    expect(isSafeId(value)).toBe(tier1IsSafeId(value))
  })

  /**
   * `$approval` — the SECOND thing both tiers now implement twice (US-464).
   *
   * The policy corpus above guards a shared GRAMMAR; this guards a shared FAMILY: which composed
   * skills receive the non-interactive signal. Same failure mode as the four Majors above — one
   * side learns about a family member and the other does not — so it belongs in the same corpus,
   * evaluated from tier 1's own source rather than a copy.
   */
  describe('agrees on the `$approval` family (US-464)', () => {
    const tier2Family = [...APPROVAL_DECLARING_SKILLS].sort()

    it('holds the SAME family list on both tiers, member for member', () => {
      // The whole point of AC5: adding a member is a data edit on each tier, and this is what
      // fails when someone edits one list and forgets the other.
      expect([...tier1().APPROVAL_DECLARING_SKILLS].sort()).toEqual(tier2Family)
    })

    it.each(tier2Family)('renders the same argument for %s on both tiers', skill => {
      // Tier 2 renders it from its parameter map; tier 1 from its own helper. Byte-identical
      // spelling is deliberate — the signal is one thing, and two spellings of it would be a
      // divergence a reader has to hold in their head.
      expect(buildSkillArgs(skill, { approval: 'auto' })).toEqual(['--approval', 'auto'])
      expect(tier1().approvalArgsFor(skill)).toBe(' --approval auto')
    })

    it.each([
      // The skills tier 1 actually composes, plus tier 2's cascade pair and the callers that
      // FORWARD the signal without declaring it (ADR-021: bootstrap passes it; refine-story is the
      // untracked residual) and the two assess-* members with no approval round at all.
      'pair-next',
      'pair-loop',
      'pair-capability-verify-quality',
      'pair-process-bootstrap',
      'pair-process-refine-story',
      'pair-process-implement',
      'pair-capability-assess-cost',
      'pair-capability-assess-coupling',
    ])('invents nothing for %s on either tier (AC3/D18)', skill => {
      expect(buildSkillArgs(skill, { approval: 'auto' })).toEqual([])
      expect(tier1().approvalArgsFor(skill)).toBe('')
    })

    it('DIVERGES on where the posture comes from, deliberately and in the safe direction', () => {
      const declaring = tier2Family[0] as string

      // Tier 2 has an ATTENDED mode, so the posture is gated on `--autonomous`: no flag, no signal.
      expect(buildSkillArgs(declaring, {})).toEqual([])
      // Tier 1 has none — `pair-loop.js` IS the unattended fan-out path (ADR-017 §4), reached only
      // when a fan-out runner exists; the skill's degraded one-card path never loads this file. So
      // there is no posture to read and the signal is unconditional.
      //
      // Recorded rather than assumed, because the natural reading of the asymmetry is drift. Note
      // it is NOT gated on `## Auto-Advance`: that section decides whether an approved card is
      // MERGED unattended, not whether a human is watching — a run with `## Auto-Advance: (none)`
      // (this repo's own policy) is still fully unattended through implement and review.
      expect(tier1().approvalArgsFor(declaring)).toBe(' --approval auto')
    })

    it('threads the signal to NO skill tier 1 composes today — the mechanism, not a live thread', () => {
      // Stated as a test so it cannot rot silently. Tier 1 names exactly two skills, and neither
      // declares an approval round; its declaring-skill exposure is TRANSITIVE, through
      // `pair-implement-batch` -> `/pair-process-implement` -> `/pair-capability-assess-stack`,
      // and neither intermediary declares `$approval` — so threading it there would be the
      // invented argument AC3 forbids. When that changes, this test is what tells the next reader
      // the situation moved, instead of a silent no-op.
      const workflowSource = readFileSync(WORKFLOW, 'utf-8')
      const composed = [...workflowSource.matchAll(/Run \/([a-z0-9-]+)|via \/([a-z0-9-]+)/g)].map(
        match => match[1] ?? match[2],
      )

      expect([...new Set(composed)].sort()).toEqual(['pair-capability-verify-quality', 'pair-next'])
      for (const skill of composed) expect(tier1().approvalArgsFor(skill)).toBe('')
    })
  })

  it('agrees that this repo’s real adoption file is valid', () => {
    const real = readFileSync(join(REPO_ROOT, POLICY_PATH), 'utf-8')

    expect(tier2Rejects(real)).toBe(false)
    expect(tier1Rejects(real, 'Eligibility')).toBe(false)
    expect(tier1Rejects(real, 'Stop Predicate')).toBe(false)
  })
})
