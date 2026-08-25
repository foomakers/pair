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
  parseStopPredicate: (policyText: string) => unknown
  parseMaxParallelism: (policyText: string) => unknown
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
  const helpers = source.slice(0, source.indexOf(ORCH_MARKER))
  const factory = new Function(
    `${helpers}
    return { extractEligibility, extractAutoAdvance, parseStopPredicate, parseMaxParallelism }`,
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

function tier1Rejects(policyText: string, section: 'Eligibility' | 'Stop Predicate'): boolean {
  const helpers = tier1()
  try {
    if (section === 'Eligibility') helpers.extractEligibility(policyText)
    else helpers.parseStopPredicate(policyText)
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

  it('agrees that this repo’s real adoption file is valid', () => {
    const real = readFileSync(join(REPO_ROOT, POLICY_PATH), 'utf-8')

    expect(tier2Rejects(real)).toBe(false)
    expect(tier1Rejects(real, 'Eligibility')).toBe(false)
    expect(tier1Rejects(real, 'Stop Predicate')).toBe(false)
  })
})
