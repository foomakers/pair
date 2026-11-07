import { readdirSync } from 'fs'
import { join } from 'path'
import chalk from 'chalk'
import type { CardOutcome } from './parallel'

/**
 * `pair-cli run --cards a,b,c` (US-614): the listed cards run serially, in the user's order, each through its
 * own `run --card` lifecycle. Passes repeat over the still-unfinished retryable cards while the previous pass
 * made verifiable progress. Pure driver: the card runner, the state reader and the stop signals are injected.
 */

export type CardEnd = 'at-target' | 'retryable' | 'terminal'

export interface CardResult {
  readonly id: string
  readonly end: CardEnd
  readonly reason: string
}

export type CardsStop =
  | 'all-at-target'
  | 'no-progress'
  | 'pass-cap'
  | 'terminal'
  | 'halt'
  | 'interrupted'

export interface CardsReport {
  readonly cards: readonly CardResult[]
  readonly passes: number
  readonly stop: CardsStop
  readonly detail?: string
}

/** One card's run: its outcome, plus a safety-required global halt when the run could not even start. */
export type CardsCardRunner = (id: string) => Promise<{ outcome: CardOutcome; halt?: string }>

export interface CardsRunInput {
  readonly cards: readonly string[]
  readonly maxPasses: number
  readonly runCard: CardsCardRunner
  /** Durable lifecycle rank of the card (higher = later); read from state, never from engine output. */
  readonly readRank: (id: string) => number
  /** The card is already at its target (closed/Done) — skipped, never run. */
  readonly atTarget: (id: string) => boolean
  readonly interrupted: () => boolean
}

const AT_TARGET_STATUS = new Set(['merged', 'ready-for-merge', 'target-ready'])
const HUMAN_STATUS = new Set([
  'escalated',
  'escalate',
  'needs-human',
  'merge-parked',
  'merged-closure-unfinished',
])

/** Terminal/human-blocked ends are never retried (AC6); an unfinished card with no such marker is retryable. */
export function classify(outcome: CardOutcome): CardResult {
  const { id, detail, cycleStatus } = outcome
  const status = cycleStatus ?? ''
  const reason = cycleStatus !== undefined ? `${cycleStatus} (${detail})` : detail
  const end = (e: CardEnd): CardResult => ({ id, end: e, reason })
  if (AT_TARGET_STATUS.has(status)) return end('at-target')
  if (
    HUMAN_STATUS.has(status) ||
    status === 'not-found' ||
    status.startsWith('failed-') ||
    detail.startsWith('needs-human')
  )
    return end('terminal')
  if (outcome.outcome === 'skipped') return end('terminal')
  // exit 0 without a cycle status: nothing ran (locked, ineligible, off) — not at target, not retryable.
  if (outcome.outcome === 'completed') return end('terminal')
  return end('retryable')
}

interface PassState {
  readonly results: Map<string, CardResult>
  readonly best: Map<string, number>
}

/** One card of a pass: skipped at target, run, classified; `halt` set when the run must stop at once. */
async function runOne(
  input: CardsRunInput,
  state: PassState,
  id: string,
): Promise<{ progress: boolean; halt?: string }> {
  const { results, best } = state
  if (input.interrupted()) {
    results.set(id, { id, end: 'retryable', reason: 'interrupted' })
    return { progress: false }
  }
  if (input.atTarget(id)) {
    results.set(id, { id, end: 'at-target', reason: 'already at target' })
    return { progress: false }
  }
  const { outcome, halt } = await input.runCard(id)
  if (halt !== undefined) {
    results.set(id, { id, end: 'terminal', reason: `halt: ${halt}` })
    return { progress: false, halt: `#${id}: ${halt}` }
  }
  results.set(id, classify(outcome))
  const rank = input.readRank(id)
  // Progress = strictly later than the best state ever seen: a regression then a recovery is none.
  const progress = rank > best.get(id)!
  best.set(id, Math.max(best.get(id)!, rank))
  return { progress }
}

export async function runCardList(input: CardsRunInput): Promise<CardsReport> {
  const state: PassState = {
    results: new Map(),
    best: new Map(input.cards.map(id => [id, input.readRank(id)])),
  }
  let pending = [...input.cards]
  let passes = 0
  const report = (stop: CardsStop, detail?: string): CardsReport => ({
    cards: input.cards.map(
      id => state.results.get(id) ?? { id, end: 'retryable', reason: 'not run: global halt' },
    ),
    passes,
    stop,
    ...(detail !== undefined && { detail }),
  })
  while (pending.length > 0) {
    passes += 1
    let progress = false
    for (const id of pending) {
      const step = await runOne(input, state, id)
      if (step.halt !== undefined) return report('halt', step.halt)
      progress ||= step.progress
    }
    if (input.interrupted()) return report('interrupted')
    pending = pending.filter(id => state.results.get(id)!.end === 'retryable')
    if (pending.length === 0) break
    if (passes >= input.maxPasses) return report('pass-cap', `--max-iterations ${input.maxPasses}`)
    if (!progress) return report('no-progress')
  }
  const allDone = input.cards.every(id => state.results.get(id)!.end === 'at-target')
  return report(allDone ? 'all-at-target' : 'terminal')
}

/** AC9: 0 only when every card is at target, 1 otherwise (failed, escalated, stalled, halted). */
export const cardsExitCode = (report: CardsReport): number =>
  report.cards.every(c => c.end === 'at-target') ? 0 : 1

export function renderCardsReport(report: CardsReport): string[] {
  const lines = [chalk.bold('  Cards outcome:')]
  for (const c of report.cards) {
    const line = `    #${c.id}: ${c.end} — ${c.reason}`
    lines.push(c.end === 'at-target' ? line : chalk.red(line))
  }
  lines.push(`  Passes: ${report.passes}`)
  lines.push(`  Stop: ${report.stop}${report.detail !== undefined ? ` (${report.detail})` : ''}`)
  return lines
}

const STAGE_ORDER = [
  'red-spec',
  'red-contract',
  'red-verify',
  'implement-phase',
  'green-fix',
  'review-phase',
]
const HANDOFF = /^(?:a0(?:-rev\d+)?|r(\d+))(?:-g\d+)?-([a-z-]+?)(?:\.attempt-\d+)?\.json$/

/**
 * The card's lifecycle rank from its durable cycle handoffs (`.pair/working/runs/story-<id>/<id>/`): the latest
 * round, then the latest stage inside it. Absent directory ⇒ 0.
 */
export function readCardRank(main: string, id: string): number {
  let files: string[]
  try {
    files = readdirSync(join(main, '.pair', 'working', 'runs', `story-${id}`, id))
  } catch {
    return 0
  }
  let rank = 0
  for (const file of files) {
    const m = HANDOFF.exec(file)
    if (m === null) continue
    const round = m[1] === undefined ? 0 : Number(m[1]) + 1
    rank = Math.max(rank, round * 10 + Math.max(0, STAGE_ORDER.indexOf(m[2]!)))
  }
  return rank
}
