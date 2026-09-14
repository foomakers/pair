import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'

// Conformance guard for story #263: pair-capability-assess-coupling assesses
// architecture coupling against the THREE-DIMENSIONAL model (integration strength ×
// socio-technical distance × volatility + balance rule). Two scopes: `diff` (composed
// by /review, output-only, 1-line Architecture verdict + collapsed findings, D22,
// never blocks) and `full` (codebase audit — flags only unbalanced+volatile
// integrations, writes a report under .pair/working/reports/architecture/, hands
// findings to /write-issue for tech-debt, #224). The model lives ONLY in the KB
// guideline coupling-balance.md (D37); the skill references it, never restates it.
// Review-side wiring (compose into /review step 2.3 + the Architecture row in the
// review template) lands separately (#228) and is deliberately NOT asserted here.

const DATASET_SKILLS = join(__dirname, '../../dataset/.skills')
const MIRROR_SKILLS = join(__dirname, '../../../../.claude/skills')
const DATASET_KB = join(__dirname, '../../dataset/.pair/knowledge')
const MIRROR_KB = join(__dirname, '../../../../.pair/knowledge')

const GUIDELINE_REL = 'guidelines/architecture/design-patterns/coupling-balance.md'

const SKILL_DATASET = readFileSync(
  join(DATASET_SKILLS, 'capability/assess-coupling/SKILL.md'),
  'utf-8',
)
const SKILL_MIRROR = readFileSync(
  join(MIRROR_SKILLS, 'pair-capability-assess-coupling/SKILL.md'),
  'utf-8',
)
const GUIDELINE_DATASET = readFileSync(join(DATASET_KB, GUIDELINE_REL), 'utf-8')
const GUIDELINE_MIRROR = readFileSync(join(MIRROR_KB, GUIDELINE_REL), 'utf-8')
const NEXT_DATASET = readFileSync(join(DATASET_SKILLS, 'next/SKILL.md'), 'utf-8')
const NEXT_MIRROR = readFileSync(join(MIRROR_SKILLS, 'pair-next/SKILL.md'), 'utf-8')
const GUIDE_DATASET = readFileSync(join(DATASET_KB, 'skills-guide.md'), 'utf-8')
const GUIDE_MIRROR = readFileSync(join(MIRROR_KB, 'skills-guide.md'), 'utf-8')

describe('assess-coupling — skill structure (#263)', () => {
  for (const [label, content] of [
    ['dataset', SKILL_DATASET],
    ['mirror', SKILL_MIRROR],
  ] as const) {
    it(`${label} declares the $scope: diff | full contract`, () => {
      expect(content).toMatch(/\$scope/)
      expect(content.toLowerCase()).toContain('diff')
      expect(content.toLowerCase()).toContain('full')
    })

    it(`${label} evaluates all three dimensions (a <3 finding is invalid)`, () => {
      expect(content.toLowerCase()).toContain('integration strength')
      expect(content.toLowerCase()).toContain('distance')
      expect(content.toLowerCase()).toContain('volatility')
      expect(content.toLowerCase()).toMatch(/fewer than three|all three/)
    })

    it(`${label} keeps the model in the guideline, never in the skill (D37)`, () => {
      expect(content).toContain('coupling-balance.md')
      expect(content).toContain('D37')
    })

    it(`${label} sources volatility from subdomain classification, never commit history alone`, () => {
      expect(content.toLowerCase()).toContain('subdomain')
      expect(content.toLowerCase()).toMatch(/commit (frequency|history)/)
    })

    it(`${label} uses the critical/significant/tolerable severity scale; tolerable never blocks`, () => {
      expect(content.toLowerCase()).toContain('critical')
      expect(content.toLowerCase()).toContain('significant')
      expect(content.toLowerCase()).toContain('tolerable')
      expect(content.toLowerCase()).toMatch(/never block/)
    })

    it(`${label} never recommends a single-dimension "decouple"`, () => {
      expect(content.toLowerCase()).toMatch(/never.*decouple|no.*single-dimension|reduce strength/)
      expect(content.toLowerCase()).toContain('decomposition raises distance')
    })

    it(`${label} emits a 1-line verdict + collapsed details (D22) and degrades to "not assessed"`, () => {
      expect(content).toContain('D22')
      expect(content.toLowerCase()).toContain('<details>')
      expect(content.toLowerCase()).toContain('not assessed')
    })

    it(`${label} degrades on no-DDD (estimate volatility) and never HALTs on adoption absence`, () => {
      expect(content.toLowerCase()).toMatch(/estimate/)
      expect(content.toLowerCase()).toMatch(/never halt/)
    })

    it(`${label} full scope writes the architecture report + hands off tech-debt via write-issue (#224)`, () => {
      expect(content).toContain('.pair/working/reports/architecture/')
      expect(content).toContain('write-issue')
      expect(content).toContain('#224')
    })

    it(`${label} reads real integration points, never structure alone`, () => {
      expect(content.toLowerCase()).toMatch(/never structure alone|structure alone/)
      expect(content.toLowerCase()).toContain('imports')
    })

    it(`${label} handles the single-module edge case as balanced / not applicable`, () => {
      expect(content.toLowerCase()).toContain('not applicable')
    })
  }
})

describe('coupling-balance.md — guideline (#263 T1)', () => {
  for (const [label, content] of [
    ['dataset', GUIDELINE_DATASET],
    ['mirror', GUIDELINE_MIRROR],
  ] as const) {
    it(`${label} defines the four integration-strength levels`, () => {
      for (const level of ['intrusive', 'functional', 'model', 'contract']) {
        expect(content.toLowerCase()).toContain(level)
      }
    })

    it(`${label} defines socio-technical distance and essential/accidental volatility`, () => {
      expect(content.toLowerCase()).toContain('socio-technical distance')
      expect(content.toLowerCase()).toContain('essential')
      expect(content.toLowerCase()).toContain('accidental')
    })

    it(`${label} states the balance rule (both-high cascading / both-low low-cohesion; volatility neutralises)`, () => {
      expect(content.toLowerCase()).toContain('balance rule')
      expect(content.toLowerCase()).toMatch(/cascading/)
      expect(content.toLowerCase()).toMatch(/low cohesion/)
      expect(content.toLowerCase()).toMatch(/neutralis/)
    })

    it(`${label} defines the severity criteria`, () => {
      for (const sev of ['critical', 'significant', 'tolerable']) {
        expect(content.toLowerCase()).toContain(sev)
      }
    })

    it(`${label} maps to DDD patterns (bounded contexts, ACL, open-host, aggregates)`, () => {
      expect(content.toLowerCase()).toContain('bounded context')
      expect(content.toLowerCase()).toMatch(/anticorruption|anti-corruption/)
      expect(content.toLowerCase()).toContain('open-host')
      expect(content.toLowerCase()).toContain('aggregate')
    })

    it(`${label} applies fractally and states the test implications (contract + boundary)`, () => {
      expect(content.toLowerCase()).toContain('fractal')
      expect(content.toLowerCase()).toContain('contract test')
      expect(content.toLowerCase()).toMatch(/boundary test|encapsulation/)
    })

    it(`${label} includes the coupling.dev bibliographic reference`, () => {
      expect(content.toLowerCase()).toContain('coupling.dev')
    })
  }
})

describe('assess-coupling catalog registration (#263)', () => {
  it('dataset skill directory exists', () => {
    expect(existsSync(join(DATASET_SKILLS, 'capability/assess-coupling/SKILL.md'))).toBe(true)
  })

  for (const [label, next, guide] of [
    ['dataset', NEXT_DATASET, GUIDE_DATASET],
    ['mirror', NEXT_MIRROR, GUIDE_MIRROR],
  ] as const) {
    it(`${label} next catalog lists assess-coupling and states 32 capability / 44 total`, () => {
      expect(next).toMatch(/assess-coupling/)
      expect(next).toContain('32 capability')
      expect(next).toContain('44 skills')
    })

    it(`${label} skills-guide lists assess-coupling and states 32 capability / 44 total`, () => {
      expect(guide).toMatch(/assess-coupling/)
      expect(guide).toContain('32 capability')
      // Round-3 nit: the title promised the total too, but only the capability
      // count was asserted (the guide states it as "Total: 44").
      expect(guide).toMatch(/Total: 44/)
    })
  }
})
