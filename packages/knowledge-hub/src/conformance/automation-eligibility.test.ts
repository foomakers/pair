import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

// Conformance guard for story #216: auto-development eligibility is an
// ADOPTION-DECLARED FILTER over the classification tags `classify` already emits
// — a SINGLE LITERAL LABEL in `tech/automation.md`'s `## Eligibility` section —
// never a dedicated eligibility tag (ADR-013 Q2b / D18) and never a boolean
// grammar (`pair-next --filter` takes one literal label, #249).
//
// The story ships NO runtime code: `pair-next` stays frozen (ADR-017 §1) and no
// consumer exists yet (#217/#250). So the normative content IS the deliverable,
// and this markdown conformance test is the tested production artifact standing
// in for its acceptance checks — the project's established mechanism for
// KB-normative content (precedents: `pair-next-scoping.test.ts`,
// `quality-model.test.ts`; ADL 2026-07-13 — gate/tooling logic lives in tested
// modules, never in unit-tested scripts).
//
// Every assertion runs over BOTH the dataset source of record and the installed
// root `.pair/knowledge` mirror, because the mirror is what an adopting project
// actually reads.

const REPO_ROOT = join(__dirname, '../../../..')
const DATASET_KB = join(__dirname, '../../dataset/.pair/knowledge')
const MIRROR_KB = join(REPO_ROOT, '.pair/knowledge')

const read = (p: string): string => readFileSync(p, 'utf-8')

const POLICY_REL = 'guidelines/collaboration/automation/automation-policy.md'
const README_REL = 'guidelines/collaboration/automation/README.md'
const QUALITY_MODEL_REL = 'guidelines/quality-assurance/quality-model.md'

const policySources: Array<[string, string]> = [
  ['dataset', read(join(DATASET_KB, POLICY_REL))],
  ['mirror', read(join(MIRROR_KB, POLICY_REL))],
]

const qualityModelSources: Array<[string, string]> = [
  ['dataset', read(join(DATASET_KB, QUALITY_MODEL_REL))],
  ['mirror', read(join(MIRROR_KB, QUALITY_MODEL_REL))],
]

const readmeSources: Array<[string, string]> = [
  ['dataset', read(join(DATASET_KB, README_REL))],
  ['mirror', read(join(MIRROR_KB, README_REL))],
]

const DOCS = join(REPO_ROOT, 'apps/website/content/docs')
const docsSources: Array<[string, string]> = [
  ['reference/quality-model.mdx', read(join(DOCS, 'reference/quality-model.mdx'))],
  [
    'reference/quality-gates-configuration.mdx',
    read(join(DOCS, 'reference/quality-gates-configuration.mdx')),
  ],
  ['concepts/adoption-files.mdx', read(join(DOCS, 'concepts/adoption-files.mdx'))],
]

// A boolean operator applied TO A LABEL — `risk:green AND team:ui`. Deliberately
// NOT a bare / (AND|OR|NOT) / grep: prose legitimately contains "What is NOT
// optional" (quality-gates-configuration.mdx §30), and a guard that trips on
// English would be disabled the first time it cried wolf. What must not exist is
// an example FILTER carrying an operator, since `--filter` cannot express one.
const LABEL_BOOLEAN_OPERATOR = /(?:[a-z][a-z-]*:[a-z]+\s+(?:AND|OR|NOT)\s|\s(?:AND|OR|NOT)\s+[a-z][a-z-]*:[a-z]+)/

describe.each(policySources)('automation-policy.md — %s (AC1: the declaration)', (_, content) => {
  it('names the adoption file and the section that holds the declaration', () => {
    expect(content).toContain('tech/automation.md')
    expect(content).toContain('## Eligibility')
  })

  it('states the declaration is a single literal label', () => {
    expect(content.toLowerCase()).toMatch(/single literal label|exactly one label/)
  })

  it('states there is no boolean grammar and defers the matching rule to pair-next', () => {
    expect(content).toMatch(/no AND\/OR\/NOT grammar/)
    expect(content).toMatch(/string equality|string-equality/)
    // The matching rule has ONE owner. This guideline must point at it rather
    // than restate it, or the two drift (the story's top technical risk).
    expect(content).toContain('pair-next')
    expect(content).toContain('SKILL.md')
  })

  it('tells consumers to pass the declared label verbatim — no tag name in code (D18)', () => {
    expect(content).toMatch(/verbatim/)
    expect(content).toMatch(/D18/)
  })
})

describe.each(policySources)('automation-policy.md — %s (AC2: default + caveats)', (_, content) => {
  it('documents `risk:green` as the recommended default', () => {
    expect(content).toMatch(/recommended default/i)
    expect(content).toContain('risk:green')
  })

  it('states yellow and red never match it, so business-critical work is never auto-developed', () => {
    expect(content).toContain('risk:yellow')
    expect(content).toContain('risk:red')
    expect(content.toLowerCase()).toMatch(/never auto-developed|never match/)
  })

  it('carries the tag-projection caveat: no projection ⇒ nothing eligible', () => {
    expect(content).toContain('## Tag Projection')
    expect(content).toContain('tech/risk-matrix.md')
    expect(content).toContain('Active: risk')
    expect(content).toContain('Active: none')
    expect(content.toLowerCase()).toMatch(/nothing is eligible|nothing eligible/)
  })

  it('warns that a renamed tag family must be declared by its EMITTED label', () => {
    expect(content).toContain('priority:green')
  })
})

describe.each(policySources)('automation-policy.md — %s (AC3/AC4: fail-safes)', (_, content) => {
  it('states absent file or absent section ⇒ empty eligibility set, as a MUST', () => {
    expect(content).toMatch(/MUST treat the eligibility set as empty/)
    expect(content).toMatch(/MUST NOT[^.\n]*all cards/)
    // Absence is a documented state, not an error (D21, same shape as tech/risk-matrix.md).
    expect(content).toMatch(/D21/)
    expect(content.toLowerCase()).toMatch(/never an error/)
  })

  it('states a value that is not exactly one label ⇒ HALT, as a MUST', () => {
    expect(content).toMatch(/MUST HALT/)
    expect(content).toMatch(/adoption-fix message/)
    // The halt message has to be actionable: it names the file AND the value.
    expect(content.toLowerCase()).toMatch(/naming the file and the offending value/)
    expect(content).toMatch(/MUST NOT[^.\n]*(all eligible|silently pick)/)
  })
})

describe.each(policySources)('automation-policy.md — %s (AC5: re-evaluation)', (_, content) => {
  it('states the declaration is re-read every run and every step, never cached', () => {
    expect(content.toLowerCase()).toMatch(/every run and every step/)
    expect(content.toLowerCase()).toMatch(/never cached/)
  })

  it('states an untagged card never matches, so untagged work is never eligible', () => {
    expect(content.toLowerCase()).toMatch(/untagged/)
    expect(content).toMatch(/ADR-013/)
  })
})

describe.each(policySources)('automation-policy.md — %s (boundaries)', (_, content) => {
  it('does not restate the per-tier gate/approval policy — it points at quality-model §4', () => {
    expect(content).toContain('quality-model.md')
    expect(content.toLowerCase()).toMatch(/which cards/)
    expect(content.toLowerCase()).toMatch(/never which gates|not which gates/)
  })

  it('scopes itself to `## Eligibility` and defers the rest of the file to #250', () => {
    expect(content).toContain('max_parallelism')
    expect(content).toContain('#250')
  })

  it('states there is no dedicated eligibility tag', () => {
    expect(content.toLowerCase()).toContain('no dedicated eligibility tag')
  })
})

describe('automation framework README — index entry', () => {
  it.each(readmeSources)('%s lists automation-policy.md in Directory Contents', (_, content) => {
    const directoryContents = content.split('## Directory Contents')[1] ?? ''
    expect(directoryContents).toContain('automation-policy.md')
  })
})

describe('quality-model.md §5 — reconciled with the single-label filter (AC6)', () => {
  it.each(qualityModelSources)('%s no longer promises a tag COMBINATION', (_, content) => {
    // The pre-#216 wording — "optionally combined with project tags" — described a
    // filter grammar `pair-next --filter` deliberately never shipped (#249).
    expect(content).not.toMatch(/optionally combined with project tags/)
  })

  it.each(qualityModelSources)('%s keeps the no-dedicated-eligibility-tag rule', (_, content) => {
    expect(content).toMatch(/No dedicated eligibility tag/)
  })

  it.each(qualityModelSources)('%s states the single-label rule and links the schema', (_, content) => {
    expect(content.toLowerCase()).toMatch(/single literal label/)
    expect(content).toContain('automation-policy.md')
    expect(content).toContain('tech/automation.md')
  })
})

describe('docs site — the same rule from every surface (AC6)', () => {
  it.each(docsSources)('%s states the single-label rule', (_, content) => {
    expect(content.toLowerCase()).toMatch(/single literal label|exactly one label/)
  })

  it.each(docsSources)('%s names the adoption file that holds it', (_, content) => {
    expect(content).toContain('tech/automation.md')
  })
})

describe('no example filter anywhere carries a boolean operator (AC6)', () => {
  const everySurface: Array<[string, string]> = [
    ...policySources.map(([k, v]) => [`policy:${k}`, v] as [string, string]),
    ...qualityModelSources.map(([k, v]) => [`quality-model:${k}`, v] as [string, string]),
    ...docsSources,
  ]

  it.each(everySurface)('%s', (_, content) => {
    expect(content).not.toMatch(LABEL_BOOLEAN_OPERATOR)
  })
})
