/**
 * Macro-phase modes of `/next` (story #252): the mode ↔ step mapping as declared DATA, plus the
 * checks that keep it from drifting and a small reference model of a mode session.
 *
 * The mapping lives in ONE place — the KB guideline `macro-phase-modes.md`, next to the step
 * catalogue — and nowhere else is it restated: `/next`'s SKILL.md links to it, the docs page is
 * asserted equal to it, the granular skills do not know it exists (they are unchanged: modes are
 * facades, never new skills — D24). This module is the executable statement of that table:
 *
 * - `parseModeTable` reads it (fail closed on a document without the table);
 * - `checkModeTable` binds it to the two sources it must agree with — the step catalogue (every
 *   step is in exactly one mode or declared outside the modes) and `/next`'s cascade (rows 1–11
 *   each belong to exactly one mode, and the mode lists the row's step) — so adding a step or a
 *   row without placing it fails a gate instead of silently falling out of every facade;
 * - `runModeSession` / `manualSequence` model "what a mode session does" against "what the user
 *   would run by hand" over a fixture board, so the transcript-equality acceptance check is a test.
 *
 * The reference model owns no process rule: row predicates mirror `/next`'s Step 3 table, and
 * which rows a mode runs always comes from the parsed table.
 */

import { existsSync, readFileSync } from 'fs'
import { join } from 'path'

export const MACRO_PHASE_MODES = ['analysis', 'implementation', 'review'] as const
export type MacroPhaseMode = (typeof MACRO_PHASE_MODES)[number]

export interface ModeEntry {
  mode: string
  /** `/next` cascade rows the mode may select, ascending. */
  rows: number[]
  /** Step ids the mode runs (catalogue ids; row 7's `/checkpoint` is a capability, not listed). */
  steps: string[]
  /** Steps reachable only through `/next`'s Step 5 fallback — the mode never invents them. */
  fallbackSteps: string[]
  /** Phase exit condition, as stated in the table. */
  exit: string
}

export interface ModeTable {
  modes: ModeEntry[]
  /** Catalogue steps that belong to no mode (composed inside another step). */
  outside: string[]
}

export interface CascadeRow {
  rows: number[]
  /** Step id the row proposes, or null for a capability that is not a step. */
  step: string | null
}

function sectionBody(content: string, heading: string): string {
  const lines = content.replace(/\r\n/g, '\n').split('\n')
  const start = lines.findIndex(l => l.trim() === `## ${heading}`)
  if (start === -1) return ''
  const out: string[] = []
  for (const line of lines.slice(start + 1)) {
    if (/^#{1,2} /.test(line)) break
    out.push(line)
  }
  return out.join('\n')
}

function tableCells(section: string): string[][] {
  return section
    .split('\n')
    .filter(l => l.trim().startsWith('|'))
    .map(l =>
      l
        .trim()
        .replace(/^\||\|$/g, '')
        .split('|')
        .map(c => c.trim()),
    )
    .filter(cells => !cells.every(c => /^:?-{3,}:?$/.test(c)))
    .slice(1) // header row
}

function backticked(cell: string): string[] {
  return [...cell.matchAll(/`([^`]+)`/g)].map(m => m[1] as string)
}

/** `1–5, 10, 11` / `8, 9` / `7` → ascending row numbers (en dash or hyphen ranges). */
function parseRowSet(cell: string): number[] {
  const rows: number[] = []
  for (const part of cell.split(',')) {
    const range = part.trim().match(/^(\d+)\s*[–-]\s*(\d+)$/)
    if (range) {
      for (let n = Number(range[1]); n <= Number(range[2]); n += 1) rows.push(n)
      continue
    }
    const single = part.trim().match(/^\d+$/)
    if (single) rows.push(Number(single[0]))
  }
  return rows
}

export function parseModeTable(content: string): ModeTable {
  const modes: ModeEntry[] = []
  for (const cells of tableCells(sectionBody(content, 'The Mode Table'))) {
    if (cells.length < 5) continue
    const mode = backticked(cells[0] as string)[0]
    if (!mode) continue
    modes.push({
      mode,
      rows: parseRowSet(cells[1] as string),
      steps: backticked(cells[2] as string),
      fallbackSteps: backticked(cells[3] as string),
      exit: cells[4] as string,
    })
  }
  const outside = tableCells(sectionBody(content, 'Outside the modes'))
    .map(cells => backticked(cells[0] ?? '')[0])
    .filter((id): id is string => Boolean(id))
  return { modes, outside }
}

/** Reads `/next`'s `Row → step id` lookup table — the one place a cascade row names its step. */
export function parseCascadeRowMap(nextSkill: string): CascadeRow[] {
  const out: CascadeRow[] = []
  for (const line of nextSkill.replace(/\r\n/g, '\n').split('\n')) {
    const m = line.match(
      /^\|\s*(\d+(?:\s*[–-]\s*\d+|(?:,\s*\d+)*))\s*(?:`[^`]*`)?\s*\|\s*([^|]+?)\s*\|\s*$/,
    )
    if (!m) continue
    const rows = parseRowSet(m[1] as string)
    if (rows.length === 0) continue
    const id = backticked(m[2] as string)[0]
    out.push({ rows, step: id ?? null })
  }
  return out
}

const FIRST_STEP_ROW = 1
const LAST_STEP_ROW = 11

const PREFIX = 'macro-phase-modes:'

function checkModeNames(table: ModeTable): string[] {
  const names = table.modes.map(m => m.mode)
  return names.join(',') === MACRO_PHASE_MODES.join(',')
    ? []
    : [
        `${PREFIX} modes must be exactly ${MACRO_PHASE_MODES.join(', ')} (in that order), found ${names.join(', ') || 'none'}`,
      ]
}

/** Every catalogue step in exactly one mode (or fallback list), or declared outside. */
function checkStepPlacement(table: ModeTable, catalogueIds: string[]): string[] {
  const errors: string[] = []
  const placement = new Map<string, string[]>()
  const place = (id: string, where: string): void => {
    placement.set(id, [...(placement.get(id) ?? []), where])
  }
  for (const m of table.modes) {
    for (const id of [...m.steps, ...m.fallbackSteps]) place(id, m.mode)
  }
  for (const id of table.outside) place(id, 'outside the modes')
  for (const [id, where] of placement) {
    if (!catalogueIds.includes(id)) {
      errors.push(`${PREFIX} step \`${id}\` (${where.join(', ')}) is not in the step catalogue`)
    }
    if (where.length > 1) {
      errors.push(`${PREFIX} step \`${id}\` is placed in more than one place: ${where.join(', ')}`)
    }
  }
  for (const id of catalogueIds) {
    if (!placement.has(id)) {
      errors.push(
        `${PREFIX} catalogue step \`${id}\` is in no mode and not declared under "Outside the modes" — place it`,
      )
    }
  }
  return errors
}

function rowOwners(table: ModeTable): Map<number, string[]> {
  const owner = new Map<number, string[]>()
  for (const m of table.modes) {
    for (const r of m.rows) owner.set(r, [...(owner.get(r) ?? []), m.mode])
  }
  return owner
}

/** Rows 1–11 each in exactly one mode; nothing else is a mode row. */
function checkRowOwnership(owner: Map<number, string[]>): string[] {
  const errors: string[] = []
  for (let row = FIRST_STEP_ROW; row <= LAST_STEP_ROW; row += 1) {
    const modes = owner.get(row) ?? []
    if (modes.length === 0) errors.push(`${PREFIX} cascade row ${row} belongs to no mode`)
    if (modes.length > 1) {
      errors.push(`${PREFIX} cascade row ${row} belongs to more than one mode: ${modes.join(', ')}`)
    }
  }
  for (const [row, modes] of owner) {
    if (row < FIRST_STEP_ROW || row > LAST_STEP_ROW) {
      errors.push(
        `${PREFIX} row ${row} (${modes.join(', ')}) is not a step row — only rows ${FIRST_STEP_ROW}–${LAST_STEP_ROW} belong to a mode`,
      )
    }
  }
  return errors
}

/** A row's owner lists the row's step; `/next`'s Row → step id table has every row 1–11. */
function checkRowSteps(
  table: ModeTable,
  owner: Map<number, string[]>,
  cascade: CascadeRow[],
): string[] {
  const errors: string[] = []
  for (const c of cascade) {
    for (const row of c.rows) {
      const modes = owner.get(row)
      const entry = modes?.length === 1 ? table.modes.find(m => m.mode === modes[0]) : undefined
      if (entry && c.step !== null && !entry.steps.includes(c.step)) {
        errors.push(
          `${PREFIX} row ${row} proposes \`${c.step}\` but mode ${entry.mode} does not list it among its steps`,
        )
      }
    }
  }
  const known = new Set(cascade.flatMap(c => c.rows))
  for (let row = FIRST_STEP_ROW; row <= LAST_STEP_ROW; row += 1) {
    if (!known.has(row)) errors.push(`${PREFIX} /next's Row → step id table has no row ${row}`)
  }
  return errors
}

export function checkModeTable(
  table: ModeTable,
  catalogueIds: string[],
  cascade: CascadeRow[],
): string[] {
  if (table.modes.length === 0) {
    return [`${PREFIX} no \`## The Mode Table\` rows found — the mapping is missing`]
  }
  const owner = rowOwners(table)
  return [
    ...checkModeNames(table),
    ...checkStepPlacement(table, catalogueIds),
    ...checkRowOwnership(owner),
    ...checkRowSteps(table, owner, cascade),
  ]
}

/** Where the one mode table lives, relative to the knowledge-hub package root. */
export const MODES_FILE =
  'dataset/.pair/knowledge/guidelines/technical-standards/ai-development/macro-phase-modes.md'

/**
 * The corpus-level gate (`skills:conformance`): the table, the step catalogue and `/next`'s cascade
 * must agree. A `/next` that documents `--mode` while the table is missing fails CLOSED — a facade
 * with no mapping is the one state in which no mode can run and nothing says so; a corpus that
 * claims no modes (an older one) has nothing to bind.
 */
export function checkModesInCorpus(
  skillsDir: string,
  proseRoot: string,
  catalogueIds: string[],
): string[] {
  const nextFile = join(skillsDir, 'next', 'SKILL.md')
  const next = existsSync(nextFile) ? readFileSync(nextFile, 'utf-8') : ''
  const modesPath = join(proseRoot, MODES_FILE)
  if (!existsSync(modesPath)) {
    return /`--mode`/.test(next)
      ? [`${MODES_FILE}: missing — /next documents \`--mode\` but no mode ↔ step table exists`]
      : []
  }
  return checkModeTable(
    parseModeTable(readFileSync(modesPath, 'utf-8')),
    catalogueIds,
    parseCascadeRowMap(next),
  )
}

// --- Reference model ---------------------------------------------------------------------------

export interface Unit {
  id: string
  macrostate: 'Draft' | 'Ready' | 'In Progress' | 'Review' | 'Done'
  /** A task breakdown exists. */
  tasks: boolean
  /** A checkpoint file exists. */
  checkpoint: boolean
  /** The checkpoint has been resumed in this session (row 7 done; row 8 then applies). */
  resumed?: boolean
}

interface ModelRow {
  row: number
  step: string
  when: (u: Unit) => boolean
  effect: (u: Unit) => Unit
}

/** `/next` Step 3 rows 6–11 over one story. Order = cascade order = delivery proximity. */
const MODEL_ROWS: ModelRow[] = [
  { row: 6, step: 'review', when: u => u.macrostate === 'Review', effect: u => u },
  {
    row: 7,
    step: 'checkpoint',
    when: u => u.macrostate === 'In Progress' && u.checkpoint && !u.resumed,
    effect: u => ({ ...u, resumed: true }),
  },
  {
    row: 8,
    step: 'implement',
    when: u => u.macrostate === 'In Progress' && (!u.checkpoint || Boolean(u.resumed)),
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

/** `checkpoint` is a capability, never filtered by a profile (row 7 is not a step). */
const isEnabled = (step: string, enabled: string[]): boolean =>
  step === 'checkpoint' || enabled.includes(step)

export interface ModeSession {
  steps: string[]
  exit: 'exit' | 'halt' | 'wrong-context' | 'all-disabled' | 'nothing-to-do'
  unit: Unit
  skipped: string[]
  suggest?: string
  halted?: string
}

export interface SessionOptions {
  /** Enabled step ids (the resolved process profile). */
  enabled: string[]
  /** A step whose invocation HALTs. */
  haltOn?: string
}

const signature = (step: string, u: Unit): string => `${step}|${JSON.stringify(u)}`

function modeOfRow(table: ModeTable, row: number): string | undefined {
  return table.modes.find(m => m.rows.includes(row))?.mode
}

/** Why a session that ran nothing ended: a profile gap, another mode's row, or nothing at all. */
function endWithoutSteps(
  table: ModeTable,
  unit: Unit,
  enabled: string[],
  skipped: string[],
): ModeSession {
  if (skipped.length > 0) return { steps: [], exit: 'all-disabled', unit, skipped }
  const elsewhere = MODEL_ROWS.find(r => r.when(unit) && isEnabled(r.step, enabled))
  const suggest = elsewhere ? modeOfRow(table, elsewhere.row) : undefined
  return suggest
    ? { steps: [], exit: 'wrong-context', unit, skipped, suggest }
    : { steps: [], exit: 'nothing-to-do', unit, skipped }
}

/** First matching row whose step is enabled; every matching row whose step is disabled is recorded. */
function pickRow(
  rows: ModelRow[],
  unit: Unit,
  enabled: string[],
  skipped: string[],
): ModelRow | undefined {
  const matching = rows.filter(r => r.when(unit))
  for (const r of matching) {
    if (!isEnabled(r.step, enabled) && !skipped.includes(r.step)) skipped.push(r.step)
  }
  return matching.find(r => isEnabled(r.step, enabled))
}

/**
 * One mode session over one work unit: select within the mode's rows, run the step, re-select
 * against the new state, until the rows select nothing (the phase exit), a step HALTs, or the same
 * step would run again on an unchanged unit (a step that leaves the state as it was is not repeated).
 */
export function runModeSession(
  table: ModeTable,
  mode: string,
  start: Unit,
  opts: SessionOptions,
): ModeSession {
  const entry = table.modes.find(m => m.mode === mode)
  if (!entry)
    throw new Error(`unknown mode \`${mode}\` — valid modes: ${MACRO_PHASE_MODES.join(', ')}`)
  const rows = MODEL_ROWS.filter(r => entry.rows.includes(r.row))
  const steps: string[] = []
  const skipped: string[] = []
  const seen = new Set<string>()
  let unit = start

  for (;;) {
    const next = pickRow(rows, unit, opts.enabled, skipped)
    if (!next || seen.has(signature(next.step, unit))) break
    seen.add(signature(next.step, unit))
    steps.push(next.step)
    if (opts.haltOn === next.step) return { steps, exit: 'halt', unit, skipped, halted: next.step }
    unit = next.effect(unit)
  }

  return steps.length > 0
    ? { steps, exit: 'exit', unit, skipped }
    : endWithoutSteps(table, unit, opts.enabled, skipped)
}

/** The steps the user would run by hand: the unmoded cascade, re-evaluated after every step. */
export function manualSequence(_table: ModeTable, start: Unit, enabled: string[]): string[] {
  const steps: string[] = []
  const seen = new Set<string>()
  let unit = start
  for (;;) {
    const next = MODEL_ROWS.find(r => r.when(unit) && isEnabled(r.step, enabled))
    if (!next) break
    const sig = signature(next.step, unit)
    if (seen.has(sig)) break
    seen.add(sig)
    steps.push(next.step)
    unit = next.effect(unit)
  }
  return steps
}
