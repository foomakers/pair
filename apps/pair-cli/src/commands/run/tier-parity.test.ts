import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { InMemoryFileSystemService } from '@pair/content-ops'
import { readAutomationPolicy, POLICY_PATH } from './automation-policy'

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
  parseMaxParallelism: (policyText: string) => unknown
  resolveAuditLocation: (policyText: string) => string
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
    return { extractEligibility, extractAutoAdvance, parseStopPredicate, parseMaxParallelism, resolveAuditLocation }`,
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
    'Max Parallelism': () => helpers.parseMaxParallelism(policyText),
    'Audit Location': () => helpers.resolveAuditLocation(policyText),
  }
  try {
    run[section]()
    return false
  } catch {
    return true
  }
}

/** The corpus: every value a previous review round found, plus the legitimate ones around them. */
const ELIGIBILITY_CORPUS: Array<[label: string, value: string]> = [
  ['a plain tier label', 'risk:green'],
  ['a label carrying spaces', 'good first issue'],
  ['a command substitution', 'risk:$(whoami)'],
  ['a backticked value', 'risk:`id`'],
  ['a comma-separated pair', 'risk:green, risk:yellow'],
  ['a boolean expression', 'risk:green OR risk:yellow'],
  ['a copied list item', '- risk:green'],
  ['juxtaposed labels', 'risk:green risk:yellow'],
  ['a 4000-character payload', 'a'.repeat(4000)],
]

const PREDICATE_CORPUS: Array<[label: string, value: string]> = [
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
]

describe('tier 1 and tier 2 read the same policy file the same way', () => {
  it('evaluates tier 1 from its own source, so its rules are never copied here', () => {
    expect(tier1().extractEligibility('## Eligibility\n\nrisk:green\n')).toEqual({
      kind: 'value',
      value: 'risk:green',
    })
  })

  it.each(ELIGIBILITY_CORPUS)('agrees on `## Eligibility` with %s', (_label, value) => {
    const policyText = `## Eligibility\n\n${value}\n`

    expect(tier2Rejects(policyText)).toBe(tier1Rejects(policyText, 'Eligibility'))
  })

  it.each(PREDICATE_CORPUS)('agrees on `## Stop Predicate` with %s', (_label, value) => {
    const policyText = `## Stop Predicate\n\n${value}\n`

    expect(tier2Rejects(policyText)).toBe(tier1Rejects(policyText, 'Stop Predicate'))
  })

  const AUTO_ADVANCE_CORPUS: Array<[label: string, value: string]> = [
    ['the fail-closed default', '(none)'],
    ['the project’s own eligibility tier', 'risk:green'],
    ['a tier outside eligibility', 'risk:red'],
    ['a non-label value', 'yes please'],
    ['a boolean expression', 'risk:green OR risk:yellow'],
    ['a command substitution', 'risk:$(id)'],
  ]

  const PARALLELISM_CORPUS: Array<[label: string, value: string]> = [
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
  ]

  const AUDIT_CORPUS: Array<[label: string, value: string]> = [
    ['a normal relative path', 'automation/loop-audit.md'],
    ['an absolute path', '/var/tmp/audit.md'],
    ['a traversing path', '../../../etc/x.md'],
    ['a backticked path', 'audit`whoami`.md'],
    ['a two-line body', 'audit/one.md\naudit/two.md'],
  ]

  it.each(AUTO_ADVANCE_CORPUS)('agrees on `## Auto-Advance` with %s', (_label, value) => {
    // Eligibility is declared alongside it, because tier 1 validates the switch against it.
    const policyText = `## Eligibility\n\nrisk:green\n\n## Auto-Advance\n\n${value}\n`

    expect(tier2Rejects(policyText)).toBe(tier1Rejects(policyText, 'Auto-Advance'))
  })

  it.each(PARALLELISM_CORPUS)('agrees on `## Max Parallelism` with %s', (_label, value) => {
    const policyText = `## Max Parallelism\n\n${value}\n`

    expect(tier2Rejects(policyText)).toBe(tier1Rejects(policyText, 'Max Parallelism'))
  })

  it.each(AUDIT_CORPUS)('agrees on `## Audit Location` with %s', (_label, value) => {
    const policyText = `## Audit Location\n\n${value}\n`

    expect(tier2Rejects(policyText)).toBe(tier1Rejects(policyText, 'Audit Location'))
  })

  it('agrees that this repo’s real adoption file is valid', () => {
    const real = readFileSync(join(REPO_ROOT, POLICY_PATH), 'utf-8')

    expect(tier2Rejects(real)).toBe(false)
    expect(tier1Rejects(real, 'Eligibility')).toBe(false)
    expect(tier1Rejects(real, 'Stop Predicate')).toBe(false)
  })
})
