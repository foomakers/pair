import { join } from 'path'
import type { FileSystemService } from '@pair/content-ops'
import { sectionBodies } from './policy-sections'
import type { CardReadiness } from './cycle-scripts'

/**
 * AC14 (US-487, review r0-1) — a card's readiness, read the way every pair skill reads item state:
 * through the adopted `## State Mapping` of `way-of-working.md`, then canonical-name matching, then
 * — only for the Draft/Ready boundary on a board with no Ready state — the Definition of Ready
 * evaluated against the card's own body. The grammar is the KB's, stated once in
 * `canonical-states.md` (Reading rules, Readiness Fallback, Edge Cases) and
 * `definition-of-ready-and-done.md` (the six criteria and the inline task-breakdown signal); this
 * module applies it and owns no rule of its own.
 */

export const WAY_OF_WORKING_PATH = '.pair/adoption/tech/way-of-working.md'
const SCHEMA_POINTER =
  '.pair/knowledge/guidelines/collaboration/project-management-tool/canonical-states.md § State-Mapping Schema'

export const MACROSTATES = ['Draft', 'Ready', 'In Progress', 'Review', 'Done'] as const
export type Macrostate = (typeof MACROSTATES)[number]

export interface StateMappingRow {
  readonly boardState: string
  readonly macrostate: Macrostate
}

/** `undefined` ⇒ no `## State Mapping` section: the canonical names resolve 1:1 (Example 1). */
export type StateMapping = readonly StateMappingRow[] | undefined

/** The card as the tracker returned it: the board-state literal is `undefined` when none is declared. */
export interface CardDocument {
  readonly title: string
  readonly body: string
  readonly boardState: string | undefined
}

export interface ReadinessVerdict {
  readonly readiness: CardReadiness
  /** One line an operator can check the routing against: the literal, the macrostate, the signal. */
  readonly explanation: string
}

/**
 * The card is outside macrostate-based routing — an unmapped board state (Reading rule 4: ignored,
 * "the skill proceeds without error"), no board state at all, or `Done`. A clean skip, never a
 * failure: the caller reports it and spawns nothing.
 */
export class CardOutOfScopeError extends Error {
  override readonly name = 'CardOutOfScopeError'
}

const sameLiteral = (a: string, b: string): boolean =>
  a.trim().toLowerCase() === b.trim().toLowerCase()

function canonicalName(literal: string): Macrostate | undefined {
  return MACROSTATES.find(name => sameLiteral(name, literal))
}

function malformed(detail: string): never {
  throw new Error(
    `state-mapping-malformed: ${WAY_OF_WORKING_PATH} \`## State Mapping\` — ${detail}. ` +
      `See ${SCHEMA_POINTER}; fix the table, then re-run.`,
  )
}

function cellsOf(row: string): string[] {
  return row
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map(cell => cell.trim())
}

const isSeparator = (row: string): boolean => cellsOf(row).every(cell => /^:?-{3,}:?$/.test(cell))

function tableRows(lines: readonly string[]): string[] {
  const rows = lines.map(line => line.trim()).filter(line => line.startsWith('|'))
  if (rows.length < 2 || !isSeparator(rows[1]!)) malformed('no parseable two-column table')
  if (rows.length === 2) malformed('the table declares no board state')
  return rows.slice(2)
}

function mappingRow(row: string): StateMappingRow {
  const cells = cellsOf(row)
  if (cells.length !== 2 || cells[0] === '') {
    malformed(`row ${JSON.stringify(row)} is not \`| Board State | Macrostate |\``)
  }
  const macrostate = canonicalName(cells[1]!)
  if (macrostate === undefined) {
    malformed(
      `\`${cells[0]}\` maps to ${JSON.stringify(cells[1])}, which is not one of ${MACROSTATES.join(', ')}`,
    )
  }
  return { boardState: cells[0]!, macrostate }
}

/**
 * The `## State Mapping` table, or `undefined` when the section is absent. Malformed — unparseable,
 * a macrostate outside the five, or one board state under two macrostates — HALTs (Edge Cases).
 */
export function parseStateMapping(markdown: string): StateMapping {
  const bodies = sectionBodies(markdown, 'State Mapping')
  if (bodies.length === 0) return undefined
  if (bodies.length > 1) malformed(`the section is declared ${bodies.length} times`)
  const rows: StateMappingRow[] = []
  for (const row of tableRows(bodies[0]!).map(mappingRow)) {
    const prior = rows.find(seen => sameLiteral(seen.boardState, row.boardState))
    if (prior === undefined) rows.push(row)
    else if (prior.macrostate !== row.macrostate) {
      malformed(
        `board state \`${row.boardState}\` is listed under two macrostates (${prior.macrostate} and ${row.macrostate})`,
      )
    }
  }
  return rows
}

/** The project's mapping, READ from its own adoption file — never assumed. */
export function readStateMapping(fs: FileSystemService, projectRoot: string): StateMapping {
  const path = join(projectRoot, WAY_OF_WORKING_PATH)
  if (!fs.existsSync(path)) return undefined
  return parseStateMapping(fs.readFileSync(path))
}

/** Reading rules 1–4: the map (case-insensitive), then the canonical names, else unmapped. */
export function resolveMacrostate(literal: string, mapping: StateMapping): Macrostate | undefined {
  const mapped = mapping?.find(row => sameLiteral(row.boardState, literal))
  return mapped?.macrostate ?? canonicalName(literal)
}

/** "No board state anywhere in the map is mapped to Ready" — the one board the DoR fallback is for. */
function boardHasReady(mapping: StateMapping): boolean {
  return mapping === undefined || mapping.some(row => row.macrostate === 'Ready')
}

// ── Definition of Ready (definition-of-ready-and-done.md) ───────────────────────────────────────

const PLACEHOLDER = /^\[[^\]]*\]$/

function filled(value: string | undefined): boolean {
  const text = (value ?? '').trim()
  return text.length > 0 && !PLACEHOLDER.test(text)
}

function section(body: string, heading: string): string | undefined {
  const bodies = sectionBodies(body, heading)
  return bodies.length === 0 ? undefined : bodies.map(lines => lines.join('\n')).join('\n')
}

function labelled(text: string | undefined, label: string): string | undefined {
  const match = new RegExp(`^\\s*\\**${label}\\**\\s*:?\\**\\s*(.*)$`, 'im').exec(text ?? '')
  return match?.[1]
}

/** The inline signal: a `## Task Breakdown` with at least one checklist item. */
export function hasTaskBreakdown(body: string): boolean {
  return /^\s*[-*]\s+\[[ xX]\]\s+\S/m.test(section(body, 'Task Breakdown') ?? '')
}

function hasStoryStatement(body: string): boolean {
  const statement = section(body, 'Story Statement')
  return ['As an?', 'I want', 'So that'].every(label => filled(labelled(statement, label)))
}

function hasGivenWhenThen(body: string): boolean {
  return /\bGiven\b[\s\S]*?\bWhen\b[\s\S]*?\bThen\b/i.test(
    section(body, 'Acceptance Criteria') ?? '',
  )
}

function hasEstimate(body: string): boolean {
  return filled(labelled(section(body, 'Story Sizing and Sprint Readiness'), 'Final Story Points'))
}

function hasDependencies(body: string): boolean {
  return /Story Dependencies/i.test(section(body, 'Dependencies and Coordination') ?? '')
}

function hasDesignFlag(body: string): boolean {
  return /\bDesign\b\**\s*:\s*\**\s*(not required|required\s*[—–-]+\s*reference)/i.test(
    section(body, 'Technical Analysis') ?? '',
  )
}

/**
 * Every unmet DoR criterion, by name — never a subset guessed into Ready. The task-breakdown
 * signal covers criteria 3–5 and never 1–2.
 */
export function unmetReadinessCriteria(card: Pick<CardDocument, 'title' | 'body'>): string[] {
  const breakdown = hasTaskBreakdown(card.body)
  const criteria: ReadonlyArray<readonly [string, boolean]> = [
    ['Clear title', filled(card.title)],
    ['Problem/goal', hasStoryStatement(card.body)],
    ['Verifiable AC', breakdown || hasGivenWhenThen(card.body)],
    ['Estimate', breakdown || hasEstimate(card.body)],
    ['Dependencies', breakdown || hasDependencies(card.body)],
    ['Design flag', hasDesignFlag(card.body)],
  ]
  return criteria.filter(([, met]) => !met).map(([name]) => name)
}

// ── the verdict ─────────────────────────────────────────────────────────────────────────────────

function readyVerdict(card: CardDocument, via: string): ReadinessVerdict {
  return hasTaskBreakdown(card.body)
    ? { readiness: 'ready', explanation: `${via}, task breakdown present` }
    : { readiness: 'refined-no-breakdown', explanation: `${via}, no task breakdown yet` }
}

/** Draft by the board; Ready only through the DoR fallback, and only on a board with no Ready state. */
function draftVerdict(card: CardDocument, mapping: StateMapping, via: string): ReadinessVerdict {
  if (boardHasReady(mapping)) return { readiness: 'draft', explanation: via }
  const unmet = unmetReadinessCriteria(card)
  const fallback = `${via}; no board state maps to Ready, so the Definition of Ready decides`
  if (unmet.length > 0) {
    return { readiness: 'draft', explanation: `${fallback} — unmet: ${unmet.join(', ')}` }
  }
  return readyVerdict(card, `${fallback} — all six criteria met`)
}

function outOfScope(card: CardDocument, why: string): never {
  throw new CardOutOfScopeError(
    `card-out-of-scope: board state ${JSON.stringify(card.boardState ?? null)} ${why} — nothing ` +
      `to prepare or drive, so nothing was spawned`,
  )
}

/**
 * The routing verdict for one card. `Ready`/`In Progress` need the task breakdown to enter the
 * cycle (otherwise planning is due); `Review` re-enters the cycle, whose handoffs decide the step;
 * an unmapped literal or `Done` is out of scope.
 */
export function resolveCardReadiness(card: CardDocument, mapping: StateMapping): ReadinessVerdict {
  if (card.boardState === undefined) outOfScope(card, 'is not declared by the card')
  const macrostate = resolveMacrostate(card.boardState, mapping)
  if (macrostate === undefined) {
    outOfScope(
      card,
      'is neither mapped in `## State Mapping` nor a canonical macrostate: unmapped, ignored ' +
        'for macrostate-based routing (canonical-states.md, Reading rule 4)',
    )
  }
  if (macrostate === 'Done') outOfScope(card, 'resolves to Done (delivered)')
  const via = `board state \`${card.boardState}\` ⇒ ${macrostate}`
  if (macrostate === 'Draft') return draftVerdict(card, mapping, via)
  if (macrostate === 'Review') return { readiness: 'ready', explanation: via }
  return readyVerdict(card, via)
}
