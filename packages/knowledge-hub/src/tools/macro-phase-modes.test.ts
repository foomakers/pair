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
  type SessionOptions,
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

// --- US-252 r0-1: the session runs over /next's LITERAL row predicates ---------------------------
//
// `/next` Step 3 rows 7 and 8 are mutually exclusive on the checkpoint file (row 7: In Progress AND
// the file exists; row 8: In Progress and NO file). A mode session that starts a story on row 7 can
// only reach `implement` through a documented hand-off in Step 6 — never through a flag the unit
// invents for itself. The oracle below is an independent transcription of the Step 3 predicates
// plus that hand-off; the unit it produces carries ONLY `/next`'s own inputs.

interface LiteralRow {
  row: number
  step: string
  when: (u: Unit) => boolean
  effect: (u: Unit) => Unit
}

const LITERAL_ROWS: LiteralRow[] = [
  { row: 6, step: 'review', when: u => u.macrostate === 'Review', effect: u => u },
  {
    row: 7,
    step: 'checkpoint',
    when: u => u.macrostate === 'In Progress' && u.checkpoint,
    effect: u => u,
  },
  {
    row: 8,
    step: 'implement',
    when: u => u.macrostate === 'In Progress' && !u.checkpoint,
    effect: u => ({ ...u, macrostate: 'Review' }),
  },
  {
    row: 9,
    step: 'implement',
    when: u => u.macrostate === 'Ready' && u.tasks,
    effect: u => ({ ...u, macrostate: 'Review' }),
  },
  {
    row: 10,
    step: 'plan-tasks',
    when: u => u.macrostate === 'Ready' && !u.tasks,
    effect: u => ({ ...u, tasks: true }),
  },
  {
    row: 11,
    step: 'refine-story',
    when: u => u.macrostate === 'Draft',
    effect: u => ({ ...u, macrostate: 'Ready' }),
  },
]

function literalSession(mode: string, start: Unit): { steps: string[]; unit: Unit } {
  const rows = table.modes.find(m => m.mode === mode)?.rows ?? []
  const steps: string[] = []
  const seen = new Set<string>()
  let resumedInSession = false // session-local: never part of the unit
  let unit: Unit = { ...start }
  for (;;) {
    let row = LITERAL_ROWS.find(r => rows.includes(r.row) && r.when(unit))
    // Step 6 hand-off: after the read-only /checkpoint resume ran for this unit, row 8's step.
    if (row?.row === 7 && resumedInSession) row = LITERAL_ROWS.find(r => r.row === 8)
    if (!row) break
    const signature = `${row.step}|${JSON.stringify(unit)}`
    if (seen.has(signature)) break
    seen.add(signature)
    steps.push(row.step)
    if (row.row === 7) resumedInSession = true
    unit = row.effect(unit)
  }
  return { steps, unit }
}

describe('r0-1: row 7 hands over to row 8 without a session flag on the unit', () => {
  it('implementation on In Progress + checkpoint runs checkpoint then implement and leaves a unit with only /next inputs', () => {
    const run = runModeSession(table, 'implementation', inProgress, { enabled: ALL })
    expect(run.steps).toEqual(['checkpoint', 'implement'])
    expect(run.unit).toEqual({ id: 'S4', macrostate: 'Review', tasks: true, checkpoint: true })
  })

  it('the session equals /next literal Step 3 predicates + the Step 6 hand-off over every unit in every mode', () => {
    const macrostates: Unit['macrostate'][] = ['Draft', 'Ready', 'In Progress', 'Review', 'Done']
    const units: Unit[] = macrostates.flatMap(macrostate =>
      [false, true].flatMap(tasks =>
        [false, true].map(checkpoint => ({ id: 'G', macrostate, tasks, checkpoint })),
      ),
    )
    const diffs = MACRO_PHASE_MODES.flatMap(mode =>
      units.flatMap(unit => {
        const run = runModeSession(table, mode, unit, { enabled: ALL })
        const actual = JSON.stringify({ steps: run.steps, unit: run.unit })
        const expected = JSON.stringify(literalSession(mode, unit))
        return actual === expected
          ? []
          : [`${mode} ${JSON.stringify(unit)}: expected ${expected}, got ${actual}`]
      }),
    )
    expect(diffs).toEqual([])
  })

  it('control: In Progress without a checkpoint file is row 8 directly', () => {
    const noFile: Unit = { id: 'S6', macrostate: 'In Progress', tasks: true, checkpoint: false }
    const run = runModeSession(table, 'implementation', noFile, { enabled: ALL })
    expect(run.steps).toEqual(['implement'])
  })

  it('control: with implement disabled the checkpoint resume still runs (not a step) and implement is reported skipped', () => {
    const noImplement = ALL.filter(s => s !== 'implement')
    const run = runModeSession(table, 'implementation', inProgress, { enabled: noImplement })
    expect(run.steps).toEqual(['checkpoint'])
    expect(run.skipped).toEqual(['implement'])
  })

  it('control: /next Step 3 still states rows 7 and 8 as mutually exclusive on the checkpoint file (the transcription above is current)', () => {
    const next = read(NEXT_FILE)
    const row7 = next.split('\n').find(l => /^\|\s*7\s*\|/.test(l)) ?? ''
    const row8 = next.split('\n').find(l => /^\|\s*8\s*\|/.test(l)) ?? ''
    expect(row7).toMatch(/In Progress[^|]*AND[^|]*checkpoint file exists/)
    expect(row8).toMatch(/In Progress[^|]*NO checkpoint file/)
  })
})

// --- US-252 r0-2 / r0-4: rows 1–5 and the Step 5 fallback ---------------------------------------
//
// Rows 1–5 are project-level (PRD, bootstrap, backlog shape), not story-level: a session takes them
// as `project` facts next to the story unit. Without `project` a session is story-scoped (rows
// 6–11 only), exactly as under `--root <story>`.

interface ProjectFacts {
  prd: 'template' | 'populated'
  /** How many of the tech adoption files are still templates. */
  techTemplates: number
  initiatives: number
  epics: number
  stories: number
}
type ProjectSessionOptions = SessionOptions & { project?: ProjectFacts }

const done: Unit = { id: 'S0', macrostate: 'Done', tasks: false, checkpoint: false }
const ALL_STEPS = [...ALL, 'brainstorm']
const POC = [
  'specify-prd',
  'bootstrap',
  'brainstorm',
  'plan-stories',
  'refine-story',
  'plan-tasks',
  'implement',
  'review',
]
const facts = (over: Partial<ProjectFacts>): ProjectFacts => ({
  prd: 'populated',
  techTemplates: 0,
  initiatives: 1,
  epics: 1,
  stories: 1,
  ...over,
})
const analysisOn = (
  project: ProjectFacts,
  enabled: string[],
  haltOn?: string,
  unit: Unit = done,
): ReturnType<typeof runModeSession> => {
  const opts: ProjectSessionOptions = { enabled, project, ...(haltOn ? { haltOn } : {}) }
  return runModeSession(table, 'analysis', unit, opts)
}

describe('r0-2: the model covers cascade rows 1–5', () => {
  it.each([
    [
      'row 1: PRD is a template',
      facts({ prd: 'template', techTemplates: 5, initiatives: 0, epics: 0, stories: 0 }),
      'specify-prd',
    ],
    [
      'row 2: PRD populated and 3 tech files are templates',
      facts({ techTemplates: 3, initiatives: 0, epics: 0, stories: 0 }),
      'bootstrap',
    ],
    [
      'row 2 boundary: only 2 templates is not row 2 (row 3 instead)',
      facts({ techTemplates: 2, initiatives: 0, epics: 0, stories: 0 }),
      'plan-initiatives',
    ],
    [
      'row 3: no initiatives or epics',
      facts({ initiatives: 0, epics: 0, stories: 0 }),
      'plan-initiatives',
    ],
    [
      'row 4: initiatives exist but no epics',
      facts({ initiatives: 1, epics: 0, stories: 0 }),
      'plan-epics',
    ],
    [
      'row 5: epics exist but no stories',
      facts({ initiatives: 1, epics: 1, stories: 0 }),
      'plan-stories',
    ],
    [
      'row 3 boundary: epics without initiatives is not row 3 (row 5 instead)',
      facts({ initiatives: 0, epics: 1, stories: 0 }),
      'plan-stories',
    ],
  ] as Array<[string, ProjectFacts, string]>)('analysis selects %s', (_name, project, step) => {
    const run = analysisOn(project, ALL_STEPS, step)
    expect(run.steps).toEqual([step])
    expect(run.exit).toBe('halt')
  })

  it('control: an established project does not let rows 1–5 pre-empt the story rows (a Draft story is row 11)', () => {
    const run = analysisOn(facts({}), ALL_STEPS, 'refine-story', draft)
    expect(run.steps).toEqual(['refine-story'])
  })

  it('implementation and review never select a planning row: a template PRD is a wrong-context report suggesting analysis', () => {
    const project = facts({
      prd: 'template',
      techTemplates: 5,
      initiatives: 0,
      epics: 0,
      stories: 0,
    })
    for (const mode of ['implementation', 'review'] as const) {
      const opts: ProjectSessionOptions = { enabled: ALL_STEPS, project }
      const run = runModeSession(table, mode, done, opts)
      expect(run.steps, mode).toEqual([])
      expect(run.exit, mode).toBe('wrong-context')
      expect(run.suggest, mode).toBe('analysis')
    }
  })

  it('profile: a planning row whose step is disabled is skipped and reported, never run', () => {
    const noPrd = ALL.filter(s => s !== 'specify-prd')
    const project = facts({ prd: 'template', techTemplates: 4 })
    const run = analysisOn(project, noPrd)
    expect(run.steps).toEqual([])
    expect(run.exit).toBe('all-disabled')
    expect(run.skipped).toEqual(['specify-prd'])
  })

  // Interaction of the planning rows (1–5) with the story rows (6–11): first match wins across the
  // whole cascade order, and a skipped (disabled) row continues at the next row (Step 0.6 item 3).
  // An orphan Draft story under an empty initiative/epic backlog satisfies row 3 AND row 11.
  const orphanDraft = facts({ initiatives: 0, epics: 0, stories: 1 })

  it('R02-I1a: an orphan Draft story under an empty initiative/epic backlog selects row 3 before row 11 (first match wins across rows 1–5 and 6–11)', () => {
    const run = analysisOn(orphanDraft, ALL_STEPS, 'plan-initiatives', draft)
    expect(run.steps).toEqual(['plan-initiatives'])
    expect(run.exit).toBe('halt')
    expect(run.halted).toBe('plan-initiatives')
  })

  it('R02-I1b: the same orphan Draft story under poc skips the disabled row 3 and continues at rows 10–11 (a skipped row continues, never ends the evaluation)', () => {
    const run = analysisOn(orphanDraft, POC, undefined, draft)
    expect(run.steps).toEqual(['refine-story', 'plan-tasks'])
    expect(run.skipped).toEqual(['plan-initiatives'])
    expect(run.exit).toBe('exit')
    expect(run.unit).toMatchObject({ macrostate: 'Ready', tasks: true })
  })
})

describe('r0-4: a fallback-only step is RUN once by its mode, under the profile', () => {
  const emptyBacklog = facts({ initiatives: 0, epics: 0, stories: 0 })

  it('analysis under poc on an empty backlog runs brainstorm once (rows 3–4 disabled, row 5 needs epics)', () => {
    const run = analysisOn(emptyBacklog, POC)
    expect(run.steps).toEqual(['brainstorm'])
    expect(run.exit).toBe('exit')
    expect(run.skipped).toContain('plan-initiatives')
  })

  it('analysis under poc with initiatives but no epics also runs brainstorm once (row 4 disabled, no epics for row 5)', () => {
    const run = analysisOn(facts({ initiatives: 1, epics: 0, stories: 0 }), POC)
    expect(run.steps).toEqual(['brainstorm'])
    expect(run.skipped).toContain('plan-epics')
  })

  it('control: an established backlog with nothing to select runs nothing: the fallback names row steps (plan-stories, review) as advice and a mode never runs those', () => {
    const run = analysisOn(facts({}), ALL_STEPS)
    expect(run.steps).toEqual([])
    expect(run.exit).not.toBe('exit')
  })

  it('under the default profile row 3 fires first, brainstorm is never the answer', () => {
    const run = analysisOn(emptyBacklog, ALL_STEPS, 'plan-initiatives')
    expect(run.steps).toEqual(['plan-initiatives'])
  })

  it('under poc with epics but no stories row 5 fires, the fallback is not reached', () => {
    const run = analysisOn(facts({ initiatives: 0, epics: 1, stories: 0 }), POC, 'plan-stories')
    expect(run.steps).toEqual(['plan-stories'])
  })

  it('control: implementation and review have no fallback-only step, so the same empty backlog runs nothing', () => {
    for (const mode of ['implementation', 'review'] as const) {
      const opts: ProjectSessionOptions = { enabled: POC, project: emptyBacklog }
      const run = runModeSession(table, mode, done, opts)
      expect(run.steps, mode).toEqual([])
      expect(run.exit, mode).not.toBe('exit')
    }
  })

  it('control: a profile without brainstorm leaves analysis nothing to run on an empty backlog (reported, not another mode)', () => {
    const run = analysisOn(
      emptyBacklog,
      POC.filter(s => s !== 'brainstorm'),
    )
    expect(run.steps).toEqual([])
    expect(run.exit).not.toBe('exit')
  })

  // Step 5 rule 2: the fallback-only step stands in when the backlog has NO EPICS (the input of
  // /plan-stories cannot exist) — not when it merely has no stories.
  it('R04-B3: with epics but no stories and /plan-stories disabled the fallback is not reached: nothing runs and the disabled row is reported', () => {
    const noPlanStories = POC.filter(s => s !== 'plan-stories')
    expect(noPlanStories).toContain('brainstorm')
    const run = analysisOn(facts({ initiatives: 1, epics: 1, stories: 0 }), noPlanStories)
    expect(run.steps).toEqual([])
    expect(run.exit).toBe('all-disabled')
    expect(run.skipped).toEqual(['plan-stories'])
  })

  // The fallback-only step is a step run with no cascade row: a HALT it raises is surfaced as-is
  // and ends the session (Step 6 item 4), exactly like a row step's.
  it('R04-I1: a HALT raised by the fallback-only step is surfaced as-is and ends the session', () => {
    const run = analysisOn(emptyBacklog, POC, 'brainstorm')
    expect(run.steps).toEqual(['brainstorm'])
    expect(run.exit).toBe('halt')
    expect(run.halted).toBe('brainstorm')
  })

  // Precedence, decided: the mode's own fallback-only step is run BEFORE a wrong-context report,
  // even when another mode's row holds for the unit. Backlog shape: no epics, one story, Ready with
  // a task breakdown (row 9 belongs to `implementation`); under poc row 3 is skipped.
  it('R04-I2: no row of the mode selects while another mode row holds (Ready + tasks, stories but no epics): the mode runs its fallback-only step instead of a wrong-context report', () => {
    const readyWithTasks: Unit = { id: 'S3', macrostate: 'Ready', tasks: true, checkpoint: false }
    const run = analysisOn(
      facts({ initiatives: 0, epics: 0, stories: 1 }),
      POC,
      undefined,
      readyWithTasks,
    )
    expect(run.steps).toEqual(['brainstorm'])
    expect(run.exit).toBe('exit')
    expect(run.skipped).toEqual(['plan-initiatives'])
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
