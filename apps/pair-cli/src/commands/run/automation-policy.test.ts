import { describe, it, expect } from 'vitest'
import { InMemoryFileSystemService } from '@pair/content-ops'
import {
  readAutomationPolicy,
  describeParallelism,
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

  it('accepts an ASCII `=>` predicate arrow', () => {
    const policy = policyFrom('## Stop Predicate\n\nroot => Done\n').read()

    expect(policy.stopPredicate).toBe('root => Done')
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
