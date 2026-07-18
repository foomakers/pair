import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

// Conformance guard for story #227: pair-capability-assess-security is composed by
// /pair-process-review (Phase 2) and the deterministic secret-scanning layer it never
// re-implements is provisioned by /pair-capability-setup-gates instead — grep-verifiable,
// not an aspirational claim (same convention as adr-012's Callers Matrix).

const DATASET_SKILLS = join(__dirname, '../../dataset/.skills')
const MIRROR_SKILLS = join(__dirname, '../../../../.claude/skills')

const ASSESS_SECURITY_DATASET = readFileSync(
  join(DATASET_SKILLS, 'capability/assess-security/SKILL.md'),
  'utf-8',
)
const ASSESS_SECURITY_MIRROR = readFileSync(
  join(MIRROR_SKILLS, 'pair-capability-assess-security/SKILL.md'),
  'utf-8',
)
const REVIEW_DATASET = readFileSync(join(DATASET_SKILLS, 'process/review/SKILL.md'), 'utf-8')
const REVIEW_MIRROR = readFileSync(join(MIRROR_SKILLS, 'pair-process-review/SKILL.md'), 'utf-8')
const SETUP_GATES_DATASET = readFileSync(
  join(DATASET_SKILLS, 'capability/setup-gates/SKILL.md'),
  'utf-8',
)
const SETUP_GATES_MIRROR = readFileSync(
  join(MIRROR_SKILLS, 'pair-capability-setup-gates/SKILL.md'),
  'utf-8',
)

describe('assess-security.md — structure (#227)', () => {
  for (const [label, content] of [
    ['dataset', ASSESS_SECURITY_DATASET],
    ['mirror', ASSESS_SECURITY_MIRROR],
  ] as const) {
    it(`${label} exposes a $mode argument with review and audit branches`, () => {
      expect(content).toMatch(/\|\s*`\$mode`/)
      expect(content).toContain('review')
      expect(content).toContain('audit')
    })

    it(`${label} never scans for secrets itself (D24) — delegates to the CI layer`, () => {
      expect(content.toLowerCase()).toContain('never scans for secrets')
    })

    it(`${label} feeds the security relevance dimension with a 1-line verdict (D22)`, () => {
      expect(content).toContain('D22')
    })

    it(`${label} writes only the audit report directly — no adoption self-write`, () => {
      expect(content).toMatch(/writes exactly one kind of file itself/i)
    })
  }
})

describe('/pair-process-review composes assess-security in Phase 2 (AC1, AC4 — #227)', () => {
  for (const [label, content, skillRef] of [
    ['dataset', REVIEW_DATASET, '/assess-security'],
    ['mirror', REVIEW_MIRROR, '/pair-capability-assess-security'],
  ] as const) {
    it(`${label} lists assess-security as a required Composed Skill`, () => {
      const tableRow = content
        .split('\n')
        .find(line => line.includes(`\`${skillRef}\``) && line.includes('Capability'))
      expect(tableRow).toBeDefined()
      expect(tableRow).toMatch(/Yes/)
    })

    it(`${label} has a Security Assessment step composing assess-security with $mode: review`, () => {
      expect(content).toMatch(/Security Assessment/)
      expect(content).toContain(`Compose \`${skillRef}\` with \`$mode: review\``)
    })

    it(`${label} ties an introduced red finding to CHANGES-REQUESTED (AC4)`, () => {
      expect(content).toMatch(/introduced\*\* red security finding/)
      expect(content).toContain('CHANGES-REQUESTED')
    })
  }
})

describe('/pair-capability-setup-gates provisions the deterministic secret-scanning layer (AC2 — #227)', () => {
  for (const [label, content] of [
    ['dataset', SETUP_GATES_DATASET],
    ['mirror', SETUP_GATES_MIRROR],
  ] as const) {
    it(`${label} reads secret-scanning.md and cites R6.5/D24`, () => {
      expect(content).toContain('secret-scanning.md')
      expect(content).toContain('R6.5')
      expect(content).toContain('D24')
    })

    it(`${label} writes the secret-scanning job as required, never continue-on-error`, () => {
      expect(content).toMatch(/required` job/)
      // Matches the YAML key form (continue-on-error: true|false), not prose mentioning
      // the option by name (e.g. "Never write the job with `continue-on-error`").
      expect(content).not.toMatch(/continue-on-error\s*:/)
    })

    it(`${label} provisions a starting .gitleaks.toml`, () => {
      expect(content).toContain('.gitleaks.toml')
    })
  }
})
