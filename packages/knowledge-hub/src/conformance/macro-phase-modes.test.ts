import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync, readdirSync } from 'fs'
import { join } from 'path'
import { MACRO_PHASE_MODES, parseModeTable } from '../tools/macro-phase-modes'

// Conformance guard for story #252: `/next` gains three macro-phase MODES (analysis /
// implementation / review) — pure facades over the cascade (D24: zero new skills, zero
// duplicated logic). The mode ↔ step mapping lives ONLY in the KB guideline; everything else
// either links to it or is asserted equal to it. The executable half (table ↔ catalogue ↔
// cascade partition, mode session = manual sequence) lives in `tools/macro-phase-modes.test.ts`.

const PKG = join(__dirname, '../..')
const ROOT = join(PKG, '../..')
const DATASET = join(PKG, 'dataset')

const NEXT_DATASET = join(DATASET, '.skills/next/SKILL.md')
const NEXT_MIRROR = join(ROOT, '.claude/skills/pair-next/SKILL.md')
const GUIDELINE = join(
  DATASET,
  '.pair/knowledge/guidelines/technical-standards/ai-development/macro-phase-modes.md',
)
const GUIDELINES_README = join(
  DATASET,
  '.pair/knowledge/guidelines/technical-standards/ai-development/README.md',
)
const SKILLS_GUIDE = join(DATASET, '.pair/knowledge/skills-guide.md')
const SKILLS_GUIDE_MIRROR = join(ROOT, '.pair/knowledge/skills-guide.md')
const DOCS_PAGE = join(ROOT, 'apps/website/content/docs/reference/pair-next.mdx')
const ADL = join(
  ROOT,
  '.pair/adoption/decision-log/2026-10-06-macro-phase-modes-are-a-selection-facade.md',
)
const ADR_017 = join(ROOT, '.pair/adoption/tech/adr/adr-017-automation-loop-pair-loop-over-atom.md')

const read = (p: string): string => readFileSync(p, 'utf-8')

const nextSources: Array<[string, string]> = [
  ['dataset', read(NEXT_DATASET)],
  ['mirror', read(NEXT_MIRROR)],
]

describe.each(nextSources)('/next — %s SKILL.md documents the mode argument', (_, content) => {
  const lower = content.toLowerCase()

  it('accepts an optional --mode with the three macro-phases (AC1, AC2)', () => {
    expect(content).toMatch(/`--mode`/)
    for (const mode of MACRO_PHASE_MODES) expect(content).toContain(`\`${mode}\``)
    expect(lower).toMatch(/macro-phase/)
  })

  it('states a mode is a facade over the cascade — no new skill, no new step, no duplicated logic (AC3, D24)', () => {
    expect(lower).toMatch(/facade/)
    expect(content).toMatch(/D24/)
    expect(lower).toMatch(/no new (skill|process step)|zero new skills/)
  })

  it('points at the KB for the mode ↔ step mapping and does not restate it', () => {
    expect(content).toMatch(/macro-phase-modes\.md/)
    // No table of modes, and no line pairing a mode name with a process-step command.
    expect(content).not.toMatch(/\|\s*Mode\s*\|/)
    const stepCommand =
      /`\/(specify-prd|bootstrap|plan-initiatives|plan-epics|plan-stories|refine-story|plan-tasks|implement|review)`/
    const offenders = content
      .split('\n')
      .filter(l => /`(analysis|implementation)`/.test(l) && stepCommand.test(l))
    expect(offenders).toEqual([])
  })

  it('composes the mode with scope and profile: same cascade, same filters (AC4)', () => {
    expect(lower).toMatch(/intersection/)
    expect(lower).toMatch(/process profile/)
    expect(lower).toMatch(/skipped/)
  })

  it('keeps macrostates and DoR in force inside a mode', () => {
    expect(lower).toMatch(/macrostate/)
    expect(lower).toMatch(/definition of ready|readiness fallback|dor/)
  })

  it('reports a mode invoked in the wrong context and suggests the right mode', () => {
    expect(lower).toMatch(/wrong context/)
    expect(lower).toMatch(/suggest/)
  })

  it('surfaces a step HALT as-is (never swallowed)', () => {
    expect(lower).toMatch(/halt[^.]*as-is|as-is[^.]*halt|surface[sd]? (the|a) halt/)
  })

  it('an unknown mode HALTs listing the valid ones, never a quiet fallback', () => {
    expect(content).toMatch(/unknown mode/i)
  })

  it('drives one work unit per invocation (context isolation, ADR-017 §3)', () => {
    expect(lower).toMatch(/one (work )?unit/)
  })

  it('stays read-only without --mode and writes nothing itself with it', () => {
    expect(lower).toMatch(/read-only/)
    expect(lower).toMatch(/without `--mode`|plain `\/(pair-)?next`/)
  })

  it('keeps the selection atom: --mode is a row filter, not loop state, --steps or --until (ADR-017 §1)', () => {
    expect(content).toMatch(/ADR-017/)
    expect(content).not.toMatch(/`--steps`|`--until`\s*\|/)
  })
})

describe('KB guideline macro-phase-modes.md — the one home of the mapping', () => {
  const guideline = read(GUIDELINE)
  const lower = guideline.toLowerCase()
  const table = parseModeTable(guideline)

  it('declares the three modes, each with rows, steps and an exit condition', () => {
    expect(table.modes.map(m => m.mode)).toEqual([...MACRO_PHASE_MODES])
    for (const m of table.modes) {
      expect(m.rows.length).toBeGreaterThan(0)
      expect(m.steps.length).toBeGreaterThan(0)
      expect(m.exit.length).toBeGreaterThan(10)
    }
  })

  it('analysis chains the brainstorm / refinement family (AC1)', () => {
    const analysis = table.modes.find(m => m.mode === 'analysis')
    expect(analysis?.steps).toEqual(expect.arrayContaining(['refine-story']))
    expect(analysis?.fallbackSteps).toContain('brainstorm')
  })

  it('states the session rules: facade, one unit, re-evaluate, HALT as-is, wrong context, profile skip', () => {
    expect(lower).toMatch(/facade/)
    expect(lower).toMatch(/one unit per invocation/)
    expect(lower).toMatch(/re-evaluate/)
    expect(lower).toMatch(/halts? surface as-is|surface as-is/)
    expect(lower).toMatch(/wrong context/)
    expect(lower).toMatch(/skipped/)
    expect(lower).toMatch(/narration/)
  })

  it('is indexed from the ai-development README', () => {
    expect(read(GUIDELINES_README)).toMatch(/\]\(macro-phase-modes\.md\)/)
  })
})

describe('skills guide — the mode table sits next to the skills catalog (facade-drift mitigation)', () => {
  it.each([
    ['dataset', SKILLS_GUIDE],
    ['mirror', SKILLS_GUIDE_MIRROR],
  ])('%s skills-guide points at the table and carries the authoring checklist item', (_, file) => {
    const content = read(file)
    expect(content).toMatch(/Macro-Phase Modes/)
    expect(content).toMatch(/macro-phase-modes\.md/)
    expect(content.toLowerCase()).toMatch(
      /new (process )?step[^.]*mode table|mode table[^.]*new (process )?step/,
    )
  })
})

describe('granular skills are untouched — modes are facades, never skills (AC3)', () => {
  const skillFiles = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true, recursive: true })
      .filter(e => e.isFile() && e.name.endsWith('.md'))
      .map(e => join(e.parentPath, e.name))

  it('no other skill mentions macro-phase modes or --mode', () => {
    const skillsDir = join(DATASET, '.skills')
    const mentions = skillFiles(skillsDir)
      .filter(f => !f.startsWith(join(skillsDir, 'next')))
      .filter(f => /macro-phase modes?|`--mode`/i.test(read(f)))
    expect(mentions).toEqual([])
  })

  it('no skill directory was added for a mode', () => {
    const skillsDir = join(DATASET, '.skills')
    const dirs = readdirSync(skillsDir, { withFileTypes: true, recursive: true })
      .filter(e => e.isDirectory())
      .map(e => e.name)
    expect(dirs.filter(d => /mode|macro/.test(d))).toEqual([])
  })
})

describe('docs site — the three modes documented for end users', () => {
  const docs = read(DOCS_PAGE)
  const kb = parseModeTable(read(GUIDELINE))

  it('has a section per mode invocation', () => {
    expect(docs).toMatch(/^## Macro-phase modes/m)
    for (const mode of MACRO_PHASE_MODES) expect(docs).toContain(`/pair-next --mode ${mode}`)
  })

  it('lists the same steps per mode as the KB table (derived equality, not a second source)', () => {
    const rows = docs
      .split('\n')
      .filter(l => /^\|\s*`(analysis|implementation|review)`\s*\|/.test(l))
      .map(l => l.split('|').map(c => c.trim()))
    expect(rows.map(r => (r[1] as string).replace(/`/g, ''))).toEqual([...MACRO_PHASE_MODES])
    for (const r of rows) {
      const mode = (r[1] as string).replace(/`/g, '')
      const steps = [...(r[2] as string).matchAll(/`([^`]+)`/g)].map(m => m[1])
      expect(steps, `docs steps for ${mode}`).toEqual(kb.modes.find(m => m.mode === mode)?.steps)
    }
  })

  it('states the facade contract: granular skills unchanged, profile skipping, HALT as-is, wrong context', () => {
    const lower = docs.toLowerCase()
    expect(lower).toMatch(/granular skills? (is|are|stays?|remain)[^.]*unchanged|unchanged/)
    expect(lower).toMatch(/process profile/)
    expect(lower).toMatch(/halt/)
    expect(lower).toMatch(/wrong context|no open pr/)
    expect(docs).toMatch(/macro-phase-modes\.md/)
  })
})

describe('decision record', () => {
  it('records the facade decision and the ADR-017 §1 clarification', () => {
    expect(existsSync(ADL)).toBe(true)
    const adl = read(ADL)
    expect(adl).toMatch(/ADR-017/)
    expect(adl).toMatch(/--mode/)
    expect(read(ADR_017)).toMatch(/macro-phase-modes-are-a-selection-facade/)
  })
})
