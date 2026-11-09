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

export type CardProgress = number | readonly [board: number, pr: number, cycle: number]

export interface CardsRunInput {
  readonly cards: readonly string[]
  readonly maxPasses: number
  readonly runCard: CardsCardRunner
  /** Durable lifecycle rank of the card (higher = later); read from state, never from engine output. */
  readonly readRank: (id: string) => CardProgress
  /** The card is already at its target (closed/Done) — skipped, never run. */
  readonly atTarget: (id: string) => boolean
  /** One durable read supplies both progress and completion when the host can do so. */
  readonly readState?: (id: string) => Promise<{ progress: CardProgress; atTarget: boolean }>
  readonly interrupted: () => boolean
}

const AT_TARGET_STATUS = new Set(['merged', 'ready-for-merge', 'target-ready'])
const TERMINAL_STATUS = new Set([
  'escalated',
  'escalate',
  'needs-human',
  'merge-parked',
  'merged-closure-unfinished',
  'gate-red',
])

const isTerminalStatus = (status: string, detail: string): boolean =>
  TERMINAL_STATUS.has(status) ||
  status === 'not-found' ||
  status.startsWith('failed-') ||
  detail.startsWith('needs-human')

/** Terminal/human-blocked ends are never retried (AC6); an unfinished card with no such marker is retryable. */
export function classify(outcome: CardOutcome): CardResult {
  const { id, detail, cycleStatus } = outcome
  const status = cycleStatus ?? ''
  const reason = cycleStatus !== undefined ? `${cycleStatus} (${detail})` : detail
  const end = (e: CardEnd): CardResult => ({ id, end: e, reason })
  if (AT_TARGET_STATUS.has(status)) return end('at-target')
  if (isTerminalStatus(status, detail)) return end('terminal')
  if (outcome.outcome === 'skipped') return end('terminal')
  // A successful preparation can finish before the delivery cycle reports a status.
  if (outcome.outcome === 'completed')
    return end(outcome.prepare === 'prepared' ? 'retryable' : 'terminal')
  return end('retryable')
}

interface PassState {
  readonly results: Map<string, CardResult>
  readonly best: Map<string, CardProgress>
  readonly snapshots: Map<string, { progress: CardProgress; atTarget: boolean }>
}

async function current(
  input: CardsRunInput,
  id: string,
): Promise<{ progress: CardProgress; atTarget: boolean }> {
  return (
    (await input.readState?.(id)) ?? { progress: input.readRank(id), atTarget: input.atTarget(id) }
  )
}

function advanced(now: CardProgress, best: CardProgress): boolean {
  if (typeof now === 'number' && typeof best === 'number') return now > best
  if (typeof now === 'number' || typeof best === 'number') return false
  return now.some((value, index) => value > best[index]!)
}

function highWater(now: CardProgress, best: CardProgress): CardProgress {
  if (typeof now === 'number' && typeof best === 'number') return Math.max(now, best)
  if (typeof now === 'number' || typeof best === 'number') return best
  return [Math.max(now[0], best[0]), Math.max(now[1], best[1]), Math.max(now[2], best[2])]
}

async function refreshSnapshots(
  input: CardsRunInput,
  snapshots: PassState['snapshots'],
  pending: readonly string[],
  passes: number,
): Promise<void> {
  if (passes === 1) return
  for (const [id, snapshot] of await Promise.all(
    pending.map(async id => [id, await current(input, id)] as const),
  ))
    snapshots.set(id, snapshot)
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
  const before = await current(input, id)
  state.snapshots.set(id, before)
  if (before.atTarget) {
    results.set(id, { id, end: 'at-target', reason: 'already at target' })
    return { progress: false }
  }
  const { outcome, halt } = await input.runCard(id)
  if (halt !== undefined) {
    results.set(id, { id, end: 'terminal', reason: `halt: ${halt}` })
    return { progress: false, halt: `#${id}: ${halt}` }
  }
  const classified = classify(outcome)
  const after = await current(input, id)
  state.snapshots.set(id, after)
  results.set(
    id,
    classified.end !== 'terminal' && after.atTarget
      ? { id, end: 'at-target', reason: 'durably at target' }
      : classified,
  )
  const rank = after.progress
  // Progress = strictly later than the best state ever seen: a regression then a recovery is none.
  const progress = advanced(rank, best.get(id)!)
  best.set(id, highWater(rank, best.get(id)!))
  return { progress }
}

export async function runCardList(input: CardsRunInput): Promise<CardsReport> {
  const snapshots = new Map(
    await Promise.all(input.cards.map(async id => [id, await current(input, id)] as const)),
  )
  const state: PassState = {
    results: new Map(),
    best: new Map(input.cards.map(id => [id, snapshots.get(id)!.progress])),
    snapshots,
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
    await refreshSnapshots(input, snapshots, pending, passes)
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
