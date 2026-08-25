import { describe, it, expect } from 'vitest'
import { InMemoryFileSystemService } from '@pair/content-ops'
import {
  readAutomationPolicy,
  describeParallelism,
  describeMergePosture,
  POLICY_PATH,
  DEFAULT_AUDIT_LOCATION,
} from './automation-policy'

const cwd = '/project'

function policyFrom(markdown?: string) {
  const fs = new InMemoryFileSystemService(
    markdown === undefined ? {} : { [`${cwd}/${POLICY_PATH}`]: markdown },
    cwd,
    cwd,
  )
  return { fs, read: () => readAutomationPolicy(fs, cwd) }
}

const THIS_PROJECTS_POLICY = `# Automation Policy — this project's delta

## Eligibility

risk:green

## Auto-Advance

(none)

## Stop Predicate

tag:risk:red ⇒ Done
max-iterations: 20

## Max Parallelism

3

## Audit Location

automation/loop-audit.md
`

describe("readAutomationPolicy — absent file (today's real path for most projects)", () => {
  it('applies the fail-safe defaults and says automation is off', () => {
    const policy = policyFrom().read()

    expect(policy.eligibility).toBeUndefined()
    expect(policy.maxIterations).toBe(1)
    expect(policy.maxParallelism).toBe(1)
    expect(policy.auditLocation).toBe(DEFAULT_AUDIT_LOCATION)
    expect(policy.source).toContain('fail-safe defaults')
    expect(policy.warnings.join('\n')).toContain('automation is off')
  })
})

describe('readAutomationPolicy — present file', () => {
  it("reads this project's own policy with pair-loop's parameter names", () => {
    const policy = policyFrom(THIS_PROJECTS_POLICY).read()

    expect(policy).toMatchObject({
      eligibility: 'risk:green',
      autoAdvance: '(none)',
      stopPredicate: 'tag:risk:red ⇒ Done',
      maxIterations: 20,
      maxParallelism: 3,
      auditLocation: 'automation/loop-audit.md',
      source: POLICY_PATH,
    })
  })

  it('never writes the file it reads', async () => {
    const { fs, read } = policyFrom(THIS_PROJECTS_POLICY)
    const before = fs.readFileSync(`${cwd}/${POLICY_PATH}`)

    read()

    expect(fs.readFileSync(`${cwd}/${POLICY_PATH}`)).toBe(before)
  })

  it('applies section-level fail-safes when only some sections exist', () => {
    const policy = policyFrom('## Eligibility\n\nrisk:green\n').read()

    expect(policy.maxIterations).toBe(1)
    expect(policy.maxParallelism).toBe(1)
    expect(policy.auditLocation).toBe(DEFAULT_AUDIT_LOCATION)
  })

  it('does not read a declaration out of a fenced example (rendered-markdown counting)', () => {
    const policy = policyFrom(
      '## Notes\n\n```markdown\n## Eligibility\n\nrisk:red\n```\n\n## Eligibility\n\nrisk:green\n',
    ).read()

    expect(policy.eligibility).toBe('risk:green')
  })

  it('accepts ONLY the documented `⇒` arrow', () => {
    const policy = policyFrom('## Stop Predicate\n\nroot ⇒ Done\n').read()

    expect(policy.stopPredicate).toBe('root ⇒ Done')
  })

  it('HALTS on the ASCII `=>` arrow, naming the documented form (round 3, Major)', () => {
    // The schema (`automation-policy.md` §Stop Predicate) documents `⇒` and nothing else, and the
    // tier-1 workflow accepts `⇒` alone. A driver that ALSO accepted `=>` would be inventing a
    // laxer grammar than the schema owner — and the same adoption file would then run on tier 2
    // and HALT on tier 1, which is precisely what ADR-021's "one capability" claim forbids.
    expect(() => policyFrom('## Stop Predicate\n\nroot => Done\n').read()).toThrow(
      /uses `=>`, but the documented arrow is `⇒`/,
    )
    expect(() => policyFrom('## Stop Predicate\n\ntag:risk:red => Done\n').read()).toThrow(
      /`## Stop Predicate`/,
    )
  })
})

describe('readAutomationPolicy — HALTs before any card is touched', () => {
  it.each([
    [
      'an empty Eligibility section',
      '## Eligibility\n\n## Auto-Advance\n\n(none)\n',
      /present but empty/,
    ],
    ['two labels', '## Eligibility\n\nrisk:green, risk:yellow\n', /exactly one label/],
    ['a boolean expression', '## Eligibility\n\nrisk:green OR risk:yellow\n', /exactly one label/],
    ['a copied list item', '## Eligibility\n\n- risk:green\n', /copied markdown wrapper/],
    [
      'juxtaposed labels',
      '## Eligibility\n\nrisk:green risk:yellow\n',
      /juxtaposes several labels/,
    ],
    [
      'prose longer than the label cap',
      `## Eligibility\n\n${'a'.repeat(51)}\n`,
      /longer than the host's label cap/,
    ],
    [
      'two Eligibility headings',
      '## Eligibility\n\nrisk:green\n\n## Eligibility\n\nrisk:yellow\n',
      /carries 2 `## Eligibility` headings/,
    ],
    ['a zero cap', '## Stop Predicate\n\nmax-iterations: 0\n', /not a positive integer/],
    ['a fractional cap', '## Stop Predicate\n\nmax-iterations: 1.5\n', /not a positive integer/],
    [
      'an unknown predicate shape',
      '## Stop Predicate\n\nwhenever it feels done\n',
      /matches neither/,
    ],
    [
      'a condition naming issue-body content',
      '## Stop Predicate\n\nroot ⇒ the body says done\n',
      /not a canonical macrostate/,
    ],
    ['a zero parallelism cap', '## Max Parallelism\n\n0\n', /not a positive integer/],
    [
      'an absolute audit path',
      '## Audit Location\n\n/var/tmp/audit.md\n',
      /must be project-relative/,
    ],
  ])('halts on %s', (_case, markdown, expected) => {
    expect(() => policyFrom(markdown).read()).toThrow(expected)
  })

  it('names the file in every halt message', () => {
    expect(() => policyFrom('## Eligibility\n\nrisk:green, risk:yellow\n').read()).toThrow(
      new RegExp(POLICY_PATH.replace(/[.]/g, '\\.')),
    )
  })
})

describe('describeParallelism (AC9)', () => {
  it('declares the single-process cap rather than honouring or ignoring the policy', () => {
    const policy = policyFrom(THIS_PROJECTS_POLICY).read()

    expect(describeParallelism(policy)).toContain('policy declares max 3')
    expect(describeParallelism(policy)).toContain('drives 1 card at a time')
    expect(describeParallelism(policy)).toContain("remains pair-loop's")
  })

  it('says nothing surprising when the policy is already sequential', () => {
    expect(describeParallelism(policyFrom().read())).toBe('Parallelism: 1 (policy: 1)')
  })
})

describe('describeMergePosture (round 1, finding 3)', () => {
  it('says nothing merges unattended when auto-advance is off', () => {
    const posture = describeMergePosture(policyFrom(THIS_PROJECTS_POLICY).read())

    expect(posture).toContain('never merges')
    expect(posture).toContain('(none)')
    // The old line claimed "the gate stays human" unconditionally, which is false as soon as a
    // tier is declared below. It must not promise that here either.
    expect(posture).not.toContain('the gate stays human')
  })

  it('states plainly that the SKILL may merge the declared tier itself', () => {
    const posture = describeMergePosture(
      policyFrom('## Eligibility\n\nrisk:green\n\n## Auto-Advance\n\nrisk:green\n').read(),
    )

    expect(posture).toContain('never merges')
    expect(posture).toContain('risk:green')
    expect(posture).toMatch(/skill may push and merge/i)
  })

  it('falls back to off when the policy file is absent', () => {
    const policy = policyFrom().read()

    expect(policy.autoAdvance).toBe('(none)')
    expect(describeMergePosture(policy)).toContain('(none)')
  })

  it('halts on an auto-advance tier the eligibility declaration does not name', () => {
    expect(() =>
      policyFrom('## Eligibility\n\nrisk:green\n\n## Auto-Advance\n\nrisk:red\n').read(),
    ).toThrow(/`## Auto-Advance` declares `risk:red`/)
  })
})

/**
 * The content check the schema owner requires and tier 1 enforces (round 4, Major).
 *
 * Every one of these values reaches an AGENT PROMPT that runs `gh` in an unattended run.
 * `.claude/workflows/pair-loop.js` (tier 1) rejects all of them through `isSafePromptText`, added by
 * #250's own round-3 review naming exactly this threat. The driver borrows the policy's VALUES, so
 * it must borrow the check that decides which values are admissible — otherwise the same adoption
 * file is safe on tier 1 and executable on tier 2, the divergence ADR-021 excludes.
 */
describe('readAutomationPolicy — a policy value is never a command fragment (round 4, Major)', () => {
  const eligibility = (value: string) => `## Eligibility\n\n${value}\n`
  const predicate = (value: string) => `## Stop Predicate\n\n${value}\n`

  it.each([
    ['a command substitution', 'risk:$(whoami)'],
    ['a backtick', 'risk:`id`'],
    ['a backtick mid-value', 'risk:gr`een'],
  ])('HALTs on `## Eligibility` carrying %s', (_case, value) => {
    expect(() => policyFrom(eligibility(value)).read()).toThrow(/command fragment/)
  })

  it.each([
    ['a backticked selector payload', 'tag:`gh pr merge 459 --admin` ⇒ Done'],
    ['a command substitution in the selector', 'tag:$(whoami) ⇒ Done'],
  ])('HALTs on `## Stop Predicate` carrying %s', (_case, value) => {
    expect(() => policyFrom(predicate(value)).read()).toThrow(/command fragment|selector/)
  })

  it('HALTs on the 4000-character selector payload', () => {
    expect(() => policyFrom(predicate(`tag:${'a'.repeat(4000)} ⇒ Done`)).read()).toThrow(
      /command fragment|selector/,
    )
  })

  it('HALTs on an over-long eligibility value', () => {
    expect(() => policyFrom(eligibility('a'.repeat(4000))).read()).toThrow()
  })

  it('HALTs on `## Auto-Advance` naming an unsafe tier', () => {
    expect(() =>
      policyFrom('## Eligibility\n\nrisk:green\n\n## Auto-Advance\n\nrisk:$(id)\n').read(),
    ).toThrow()
  })

  it('HALTs on an audit location that could become a command fragment', () => {
    expect(() => policyFrom('## Audit Location\n\naudit`whoami`.md\n').read()).toThrow()
  })

  it('still accepts every legitimate value, spaces included', () => {
    const policy = policyFrom(
      '## Eligibility\n\ngood first issue\n\n## Stop Predicate\n\ntype:user story ⇒ Done and has-tag:risk:red\nmax-iterations: 20\n',
    ).read()

    expect(policy.eligibility).toBe('good first issue')
    expect(policy.stopPredicate).toBe('type:user story ⇒ Done and has-tag:risk:red')
  })
})

/** Round 4, minor 1: parity measured on the CLASS — the same strictness tier 1 applies. */
describe('readAutomationPolicy — numeric and condition forms match tier 1 exactly', () => {
  it.each([
    ['scientific notation', '1e3'],
    ['hexadecimal', '0x10'],
    ['a trailing-zero float', '2.0'],
    ['a leading plus', '+3'],
    ['digits with a suffix', '3abc'],
  ])('HALTs on max-iterations in %s form', (_case, value) => {
    expect(() => policyFrom(`## Stop Predicate\n\nmax-iterations: ${value}\n`).read()).toThrow(
      /not a positive integer/,
    )
  })

  it('accepts a plain decimal integer', () => {
    expect(policyFrom('## Stop Predicate\n\nmax-iterations: 20\n').read().maxIterations).toBe(20)
  })

  it.each([
    ['an empty has-tag payload', 'root ⇒ has-tag:'],
    ['a has-tag payload carrying a space', 'root ⇒ has-tag:a b'],
  ])('HALTs on a condition with %s', (_case, value) => {
    expect(() => policyFrom(`## Stop Predicate\n\n${value}\n`).read()).toThrow(
      /not a canonical macrostate/,
    )
  })

  it('accepts a well-formed has-tag condition', () => {
    expect(policyFrom('## Stop Predicate\n\nroot ⇒ has-tag:risk:red\n').read().stopPredicate).toBe(
      'root ⇒ has-tag:risk:red',
    )
  })

  it('HALTs on `## Max Parallelism` in a non-decimal form', () => {
    expect(() => policyFrom('## Max Parallelism\n\n1e3\n').read()).toThrow(/not a positive integer/)
  })

  /**
   * Round 4, minor 2 — resolved the other way round, deliberately.
   *
   * `tag:a<b>` passes tier 1's content check (`isSafePromptText` allows angle brackets), so HALTing
   * on it here would be the driver inventing STRICTER schema than its owner — the same class of
   * divergence as round 3's, mirrored. Parity means accepting it; the fix therefore belongs to the
   * token reader, which must not discard a token because a QUOTED value contains `<…>`
   * (see `stream-reader.test.ts` — the placeholder check is quote-aware).
   */
  it('accepts a selector payload carrying `<...>`, exactly as tier 1 does', () => {
    expect(policyFrom('## Stop Predicate\n\ntag:a<b> ⇒ Done\n').read().stopPredicate).toBe(
      'tag:a<b> ⇒ Done',
    )
  })
})
