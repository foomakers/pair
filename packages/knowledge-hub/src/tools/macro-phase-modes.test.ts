import { describe, expect, it } from 'vitest'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  MACRO_PHASE_MODES,
  checkModeTable,
  checkModesInCorpus,
  MODES_FILE as MODES_REL,
  manualSequence,
  parseCascadeRowMap,
  parseModeTable,
  runModeSession,
  type Unit,
} from './macro-phase-modes'
import { parseStepCatalogue, runChecks } from './skills-conformance-check'

const DATASET = join(__dirname, '../../dataset')
const MODES_FILE = join(
  DATASET,
  '.pair/knowledge/guidelines/technical-standards/ai-development/macro-phase-modes.md',
)
const CATALOGUE_FILE = join(
  DATASET,
  '.pair/knowledge/guidelines/technical-standards/ai-development/step-catalogue.md',
)
const NEXT_FILE = join(DATASET, '.skills/next/SKILL.md')

const read = (p: string): string => readFileSync(p, 'utf-8')

const MODE_DOC = `# Macro-phase modes

## The Mode Table

| Mode             | Rows          | Steps                               | Fallback-only | Exit              |
| ---------------- | ------------- | ----------------------------------- | ------------- | ----------------- |
| \`analysis\`       | 1–5, 10, 11   | \`specify-prd\`, \`refine-story\`       | \`brainstorm\`  | story is Ready    |
| \`implementation\` | 7, 8, 9       | \`implement\`                         | —             | story in Review   |
| \`review\`         | 6             | \`review\`                            | —             | verdict published |

## Outside the modes

| Step                | Why                      |
| ------------------- | ------------------------ |
| \`define-subdomains\` | composed inside a step   |
`

describe('parseModeTable', () => {
  const table = parseModeTable(MODE_DOC)

  it('reads every mode with its rows (ranges expanded), steps, fallback-only steps and exit', () => {
    expect(table.modes.map(m => m.mode)).toEqual(['analysis', 'implementation', 'review'])
    const analysis = table.modes[0]
    expect(analysis?.rows).toEqual([1, 2, 3, 4, 5, 10, 11])
    expect(analysis?.steps).toEqual(['specify-prd', 'refine-story'])
    expect(analysis?.fallbackSteps).toEqual(['brainstorm'])
    expect(analysis?.exit).toBe('story is Ready')
    expect(table.modes[1]?.fallbackSteps).toEqual([])
  })

  it('reads the steps that sit outside every mode', () => {
    expect(table.outside).toEqual(['define-subdomains'])
  })

  it('reads nothing from a document without the table (fail closed, not a quiet default)', () => {
    expect(parseModeTable('# nothing here')).toEqual({ modes: [], outside: [] })
  })
})

describe('parseCascadeRowMap', () => {
  const NEXT = `
| Cascade row | Step id |
| --- | --- |
| 1 \`/specify-prd\` | \`specify-prd\` |
| 6 \`/review\` | \`review\` |
| 7 \`/checkpoint\` | *(none — not a step, therefore never filtered)* |
| 8, 9 \`/implement\` | \`implement\` |
| 12–14 | *(none — not steps, therefore never filtered)* |
`
  it('expands lists and ranges and maps non-steps to null', () => {
    expect(parseCascadeRowMap(NEXT)).toEqual([
      { rows: [1], step: 'specify-prd' },
      { rows: [6], step: 'review' },
      { rows: [7], step: null },
      { rows: [8, 9], step: 'implement' },
      { rows: [12, 13, 14], step: null },
    ])
  })
})

describe('checkModeTable', () => {
  const catalogue = [
    'specify-prd',
    'refine-story',
    'brainstorm',
    'implement',
    'review',
    'define-subdomains',
  ]
  const cascade = [
    { rows: [1, 2, 3, 4, 5], step: 'specify-prd' },
    { rows: [6], step: 'review' },
    { rows: [7], step: null },
    { rows: [8, 9], step: 'implement' },
    { rows: [10], step: null },
    { rows: [11], step: 'refine-story' },
    { rows: [12, 13], step: null },
  ]
  const ok = {
    modes: [
      {
        mode: 'analysis',
        rows: [1, 2, 3, 4, 5, 10, 11],
        steps: ['specify-prd', 'refine-story'],
        fallbackSteps: ['brainstorm'],
        exit: 'x',
      },
      {
        mode: 'implementation',
        rows: [7, 8, 9],
        steps: ['implement'],
        fallbackSteps: [],
        exit: 'x',
      },
      { mode: 'review', rows: [6], steps: ['review'], fallbackSteps: [], exit: 'x' },
    ],
    outside: ['define-subdomains'],
  }

  it('passes a table that partitions the catalogue and rows 1–11', () => {
    expect(checkModeTable(ok, catalogue, cascade)).toEqual([])
  })

  it('fails when a catalogue step is in no mode and not declared outside (facade drift)', () => {
    const drift = checkModeTable({ ...ok, outside: [] }, catalogue, cascade)
    expect(drift.join('\n')).toMatch(/define-subdomains/)
  })

  it('fails when a step id is not in the catalogue', () => {
    const bad = structuredClone(ok)
    ;(bad.modes[1] as { steps: string[] }).steps = ['implement', 'ship-it']
    expect(checkModeTable(bad, catalogue, cascade).join('\n')).toMatch(/ship-it/)
  })

  it('fails when a step sits in two modes', () => {
    const bad = structuredClone(ok)
    ;(bad.modes[2] as { steps: string[] }).steps = ['review', 'implement']
    expect(checkModeTable(bad, catalogue, cascade).join('\n')).toMatch(
      /implement.*more than one|more than one.*implement/,
    )
  })

  it('fails when a cascade row 1–11 belongs to no mode, or to two', () => {
    const missing = structuredClone(ok)
    ;(missing.modes[0] as { rows: number[] }).rows = [1, 2, 3, 4, 5, 10]
    expect(checkModeTable(missing, catalogue, cascade).join('\n')).toMatch(/row 11/)
    const twice = structuredClone(ok)
    ;(twice.modes[2] as { rows: number[] }).rows = [6, 7]
    expect(checkModeTable(twice, catalogue, cascade).join('\n')).toMatch(
      /row 7.*more than one|more than one.*row 7/,
    )
  })

  it('fails when a row sits in a mode that does not list the row step', () => {
    const bad = structuredClone(ok)
    ;(bad.modes[0] as { rows: number[] }).rows = [1, 2, 3, 4, 5, 6, 10, 11]
    ;(bad.modes[2] as { rows: number[] }).rows = []
    expect(checkModeTable(bad, catalogue, cascade).join('\n')).toMatch(
      /row 6.*review|review.*row 6/,
    )
  })

  it('fails when the mode names are not exactly the three macro-phases', () => {
    const bad = structuredClone(ok)
    ;(bad.modes[2] as { mode: string }).mode = 'ship'
    expect(checkModeTable(bad, catalogue, cascade).join('\n')).toMatch(
      /analysis, implementation, review/,
    )
  })

  it('fails closed on an empty table', () => {
    expect(checkModeTable({ modes: [], outside: [] }, catalogue, cascade).length).toBeGreaterThan(0)
  })
})

describe('the shipped mode table', () => {
  const table = parseModeTable(read(MODES_FILE))
  const catalogue = parseStepCatalogue(read(CATALOGUE_FILE)).map(s => s.id)
  const cascade = parseCascadeRowMap(read(NEXT_FILE))

  it('declares exactly the three macro-phases', () => {
    expect(table.modes.map(m => m.mode)).toEqual([...MACRO_PHASE_MODES])
  })

  it('partitions the step catalogue and the /next cascade rows 1–11 (no step, no row left without a mode)', () => {
    expect(checkModeTable(table, catalogue, cascade)).toEqual([])
  })

  it('puts the refinement and brainstorm family in analysis, implement in implementation, review in review', () => {
    const by = Object.fromEntries(table.modes.map(m => [m.mode, m]))
    expect(by.analysis?.steps).toEqual(expect.arrayContaining(['refine-story', 'plan-tasks']))
    expect(by.analysis?.fallbackSteps).toContain('brainstorm')
    expect(by.implementation?.steps).toEqual(['implement'])
    expect(by.review?.steps).toEqual(['review'])
  })
})

// --- Reference model: a mode session vs the equivalent manual step sequence -------------------
//
// One fixture project with a story at each stage. The "manual" path is the unmoded cascade
// (`/next` re-evaluated after every step, the user running what it recommends); a mode session
// must produce the same steps, in the same order, for the part of that path inside its rows.

const table = parseModeTable(read(MODES_FILE))
const ALL = [
  'specify-prd',
  'bootstrap',
  'plan-initiatives',
  'plan-epics',
  'plan-stories',
  'refine-story',
  'plan-tasks',
  'implement',
  'review',
]
const draft: Unit = { id: 'S1', macrostate: 'Draft', tasks: false, checkpoint: false }
const readyNoTasks: Unit = { id: 'S2', macrostate: 'Ready', tasks: false, checkpoint: false }
const ready: Unit = { id: 'S3', macrostate: 'Ready', tasks: true, checkpoint: false }
const inProgress: Unit = { id: 'S4', macrostate: 'In Progress', tasks: true, checkpoint: true }
const inReview: Unit = { id: 'S5', macrostate: 'Review', tasks: true, checkpoint: false }

describe('mode session = manual step sequence (fixture project)', () => {
  it('analysis on a Draft story chains refine-story then plan-tasks and stops at Ready with a breakdown', () => {
    const run = runModeSession(table, 'analysis', draft, { enabled: ALL })
    expect(run.steps).toEqual(['refine-story', 'plan-tasks'])
    expect(run.exit).toBe('exit')
    expect(run.unit).toMatchObject({ macrostate: 'Ready', tasks: true })
    expect(manualSequence(table, draft, ALL).slice(0, 2)).toEqual(run.steps)
  })

  it('implementation on a Ready story runs implement end to end and stops at Review', () => {
    const run = runModeSession(table, 'implementation', ready, { enabled: ALL })
    expect(run.steps).toEqual(['implement'])
    expect(run.unit).toMatchObject({ macrostate: 'Review' })
  })

  it('implementation resumes an In Progress story through its checkpoint (row 7) before implement', () => {
    const run = runModeSession(table, 'implementation', inProgress, { enabled: ALL })
    expect(run.steps).toEqual(['checkpoint', 'implement'])
  })

  it('review on a story in Review drives /review once and stops (no loop on an unchanged PR)', () => {
    const run = runModeSession(table, 'review', inReview, { enabled: ALL })
    expect(run.steps).toEqual(['review'])
    expect(run.exit).toBe('exit')
  })

  it('the three modes in order walk the whole manual path from Draft to a reviewed PR', () => {
    const a = runModeSession(table, 'analysis', draft, { enabled: ALL })
    const i = runModeSession(table, 'implementation', a.unit, { enabled: ALL })
    const r = runModeSession(table, 'review', i.unit, { enabled: ALL })
    expect([...a.steps, ...i.steps, ...r.steps]).toEqual(manualSequence(table, draft, ALL))
  })

  it('a mode never acts on a story outside its macrostates (DoR / macrostate gates still hold)', () => {
    expect(runModeSession(table, 'implementation', draft, { enabled: ALL }).steps).toEqual([])
    expect(runModeSession(table, 'implementation', readyNoTasks, { enabled: ALL }).steps).toEqual(
      [],
    )
    expect(runModeSession(table, 'review', ready, { enabled: ALL }).steps).toEqual([])
  })

  it('wrong context: reports what is missing and suggests the mode whose rows match', () => {
    const none = runModeSession(table, 'review', ready, { enabled: ALL })
    expect(none.exit).toBe('wrong-context')
    expect(none.suggest).toBe('implementation')
    const early = runModeSession(table, 'implementation', draft, { enabled: ALL })
    expect(early.suggest).toBe('analysis')
  })

  it('profile: a disabled step is skipped inside the phase, the enabled steps still chain', () => {
    const noTasks = ALL.filter(s => s !== 'plan-tasks')
    const run = runModeSession(table, 'analysis', draft, { enabled: noTasks })
    expect(run.steps).toEqual(['refine-story'])
    expect(run.skipped).toEqual(['plan-tasks'])
    const noRefine = ALL.filter(s => s !== 'refine-story')
    const run2 = runModeSession(table, 'analysis', readyNoTasks, { enabled: noRefine })
    expect(run2.steps).toEqual(['plan-tasks'])
  })

  it('profile: a mode whose every step is disabled reports it instead of falling through to another mode', () => {
    const noImplement = ALL.filter(s => s !== 'implement')
    const run = runModeSession(table, 'implementation', ready, { enabled: noImplement })
    expect(run.steps).toEqual([])
    expect(run.exit).toBe('all-disabled')
  })

  it('a step HALT surfaces as-is and ends the session (no swallow, no retry)', () => {
    const run = runModeSession(table, 'analysis', draft, { enabled: ALL, haltOn: 'plan-tasks' })
    expect(run.steps).toEqual(['refine-story', 'plan-tasks'])
    expect(run.exit).toBe('halt')
    expect(run.halted).toBe('plan-tasks')
    expect(run.unit).toMatchObject({ macrostate: 'Ready', tasks: false })
  })
})

describe('skills:conformance binds the mode table to the corpus', () => {
  const NEXT_WITH_MODES = [
    '# /next',
    'Accepts `--mode`.',
    '| Cascade row | Step id |',
    '| --- | --- |',
    '| 1 `/a` | `a` |',
  ].join('\n')

  const corpus = (next: string, table?: string): { skills: string; root: string } => {
    const root = mkdtempSync(join(tmpdir(), 'modes-'))
    const skills = join(root, 'dataset', '.skills')
    mkdirSync(join(skills, 'next'), { recursive: true })
    writeFileSync(join(skills, 'next', 'SKILL.md'), next)
    if (table !== undefined) {
      const file = join(root, MODES_REL)
      mkdirSync(join(file, '..'), { recursive: true })
      writeFileSync(file, table)
    }
    return { skills, root }
  }

  it('the real corpus passes the mode checks', () => {
    const { errors } = runChecks(join(__dirname, '../../dataset/.skills'))
    expect(errors.filter(e => e.includes('macro-phase-modes'))).toEqual([])
  })

  it('a /next that documents --mode without a mode table fails closed', () => {
    const { skills, root } = corpus(NEXT_WITH_MODES)
    expect(checkModesInCorpus(skills, root, ['a']).join('\n')).toMatch(/missing/)
  })

  it('a /next without --mode and without a table has nothing to bind (an adopter on an older corpus)', () => {
    const { skills, root } = corpus('# /next\n')
    expect(checkModesInCorpus(skills, root, ['a'])).toEqual([])
  })

  it('a catalogue step placed in no mode fails the gate', () => {
    const { skills, root } = corpus(NEXT_WITH_MODES, MODE_DOC)
    const errors = checkModesInCorpus(skills, root, [
      'a',
      'specify-prd',
      'refine-story',
      'implement',
      'review',
      'plan-tasks',
    ])
    expect(errors.join('\n')).toMatch(/plan-tasks/)
  })
})
