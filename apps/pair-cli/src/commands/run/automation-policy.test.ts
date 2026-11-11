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
    expect(policy.maxIterations).toBe(Number.POSITIVE_INFINITY)
    expect(policy.maxParallelism).toBe(1)
    expect(policy.auditLocation).toBe(DEFAULT_AUDIT_LOCATION)
    expect(policy.source).toContain('fail-safe defaults')
    expect(policy.warnings.join('\n')).toContain('automation is off')
  })
})

describe('readAutomationPolicy — present file', () => {

  it('does not read a declaration out of a fenced example (rendered-markdown counting)', () => {
    const policy = policyFrom(
      '## Notes\n\n```markdown\n## Eligibility\n\nrisk:red\n```\n\n## Eligibility\n\nrisk:green\n',
    ).read()

    expect(policy.eligibility).toBe('risk:green')
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
})

describe('describeParallelism (AC9)', () => {
  it('declares the single-process cap rather than honouring or ignoring the policy', () => {
    const policy = policyFrom(THIS_PROJECTS_POLICY).read()

    expect(describeParallelism(policy)).toContain('policy declares max 3')
    expect(describeParallelism(policy)).toContain('drives 1 card at a time')
    expect(describeParallelism(policy)).toContain("remains pair-loop's")
    expect(describeParallelism(policy)).toContain('--root <id> --parallel <n>')
  })

  it('says nothing surprising when the policy is already sequential', () => {
    expect(describeParallelism(policyFrom().read())).toBe('Parallelism: 1 (policy: 1)')
  })
})

describe('describeMergePosture (round 1, finding 3)', () => {

  // US-490: `run --card` now reaches the merge stage (cycle-merge.mjs check -> gate -> run), so
  // with a tier under `## Auto-Advance` the run itself merges that tier — "the driver never
  // merges" is false there and must not be printed.
  it.each(['risk:green', 'risk:yellow', 'risk:red'])(
    'states that merge is automatic for the declared tier %s',
    tier => {
      const posture = describeMergePosture(
        policyFrom(`## Eligibility\n\n${tier}\n\n## Auto-Advance\n\n${tier}\n`).read(),
      )

      expect(posture).not.toContain('never merges')
      expect(posture).toContain(tier)
      expect(posture).toMatch(/automatic/i)
    },
  )

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

  /**
   * Round 5, Major: the WHOLE predicate line reaches the prompt (`predicate = line`), so the
   * content check belongs on the line, not on one field of it. `has-tag:$(whoami)` satisfies
   * `/^has-tag:\S+$/` — shape is not safety.
   *
   * This is a TIER-2-ONLY exposure and the parity test cannot catch it by construction: tier 1
   * accepts the same strings but never inlines them, it evaluates the predicate in JS. So the guard
   * has to be here, applied directly.
   */
  it.each([
    ['a command substitution in has-tag', 'root ⇒ has-tag:$(whoami)'],
    ['a backtick in has-tag', 'root ⇒ has-tag:`id`'],
    ['a command substitution after the arrow', 'tag:risk:red ⇒ has-tag:$(id)'],
  ])('HALTs on a predicate line carrying %s', (_case, value) => {
    expect(() => policyFrom(`## Stop Predicate\n\n${value}\n`).read()).toThrow(/command fragment/)
  })

  it('HALTs on a traversing audit location, as tier 1 does', () => {
    expect(() => policyFrom('## Audit Location\n\n../../../etc/x.md\n').read()).toThrow(
      /escapes the working area/,
    )
  })

  it('HALTs on a multi-line audit location body, as tier 1 does', () => {
    expect(() => policyFrom('## Audit Location\n\naudit/one.md\naudit/two.md\n').read()).toThrow(
      /exactly one path/,
    )
  })

  it.each([
    ['DEL', 0x7f],
    ['a C1 control', 0x9b],
  ])('HALTs on %s in a policy value', (_case, code) => {
    const value = `risk:${String.fromCharCode(code)}green`

    expect(() => policyFrom(`## Eligibility\n\n${value}\n`).read()).toThrow(/command fragment/)
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

  it.each([
    ['an empty has-tag payload', 'root ⇒ has-tag:'],
    ['a has-tag payload carrying a space', 'root ⇒ has-tag:a b'],
  ])('HALTs on a condition with %s', (_case, value) => {
    expect(() => policyFrom(`## Stop Predicate\n\n${value}\n`).read()).toThrow(
      /not a canonical macrostate/,
    )
  })

  /**
   * Round 5, minor 2 — INVERTED from round 4, which was wrong in the other direction.
   *
   * Tier 1 parses this field with `Number()` (`parseMaxParallelism`), so `1e3` is 1000 and `0x10` is
   * 16 there. Round 4 tightened it here to decimal-only, making the driver STRICTER than its schema
   * owner — the same divergence as round 3's, mirrored. `max-iterations` stays strict because tier 1
   * IS strict there (`/^max-iterations:\s*(-?\d+)\s*$/`): the two fields differ on purpose.
   */
  it.each([
    ['scientific notation', '1e3', 1000],
    ['hexadecimal', '0x10', 16],
    ['a trailing-zero float', '2.0', 2],
  ])(
    'accepts `## Max Parallelism` in %s form, exactly as tier 1 does',
    (_case, value, expected) => {
      expect(policyFrom(`## Max Parallelism\n\n${value}\n`).read().maxParallelism).toBe(expected)
    },
  )

  it.each([
    ['a malformed override line', 'risk:green 5'],
    ['an override naming a non-label', 'not a tier: 5'],
    ['an override with a non-integer', 'risk:green: many'],
    ['an override at zero', 'risk:green: 0'],
  ])('HALTs on %s instead of ignoring it silently', (_case, override) => {
    expect(() => policyFrom(`## Max Parallelism\n\n3\n${override}\n`).read()).toThrow(
      /`## Max Parallelism`/,
    )
  })

  it('US-491: exposes the per-tier overrides for run --root --parallel, absent when none is declared', () => {
    expect(
      policyFrom('## Max Parallelism\n\n3\nrisk:green: 5\nrisk:yellow: 2\n').read()
        .maxParallelismOverrides,
    ).toEqual({ 'risk:green': 5, 'risk:yellow': 2 })
    expect(policyFrom('## Max Parallelism\n\n3\n').read()).not.toHaveProperty(
      'maxParallelismOverrides',
    )
  })
})

describe('US-573 AC5: `## Stop Predicate` idle-timeout', () => {
  it('reads `idle-timeout: <seconds>` next to the predicate and max-iterations', () => {
    const policy = policyFrom(
      '## Stop Predicate\n\nroot ⇒ Done\nmax-iterations: 3\nidle-timeout: 600\n',
    ).read()
    expect(policy.idleTimeoutSeconds).toBe(600)
    expect(policy.maxIterations).toBe(3)
  })

  it('absent ⇒ undefined; a non-positive value HALTs', () => {
    expect(
      policyFrom('## Stop Predicate\n\nroot ⇒ Done\n').read().idleTimeoutSeconds,
    ).toBeUndefined()
    expect(() => policyFrom('## Stop Predicate\n\nidle-timeout: 0\n').read()).toThrow(
      /idle-timeout/,
    )
  })
})

describe('US-576 AC3: only `## Autonomy` declared', () => {
  it('prints no "automation is off" warning (the selection is `## Autonomy`\'s)', () => {
    const policy = policyFrom('# Automation\n\n## Autonomy\n\npreset: escalate-red\n').read()
    expect(policy.eligibility).toBeUndefined()
    expect(policy.warnings.join('\n')).not.toContain('automation is off')
  })

  it('still warns when neither `## Eligibility` nor `## Autonomy` is declared', () => {
    expect(
      policyFrom('# Automation\n\n## Max Parallelism\n\n1\n').read().warnings.join('\n'),
    ).toContain('automation is off')
  })
})
describe('US-576 AC6: no max-iterations declared ⇒ no iteration cap (the loop runs to a natural stop)', () => {
  it('absent file, absent `## Stop Predicate`, a predicate with no max-iterations: all uncapped', () => {
    expect(policyFrom().read().maxIterations).toBe(Number.POSITIVE_INFINITY)
    expect(policyFrom('# A\n\n## Autonomy\n\npreset: full\n').read().maxIterations).toBe(
      Number.POSITIVE_INFINITY,
    )
    expect(policyFrom('## Stop Predicate\n\ntag:risk:red ⇒ Done\n').read().maxIterations).toBe(
      Number.POSITIVE_INFINITY,
    )
  })

  it('a declared max-iterations still caps', () => {
    expect(policyFrom('## Stop Predicate\n\nmax-iterations: 4\n').read().maxIterations).toBe(4)
  })
})
