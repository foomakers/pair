import { spawn, type ChildProcess } from 'child_process'
import { createHash } from 'crypto'
import { createInterface } from 'readline'
import type { CardLock, LockAcquirer } from './card-lock'
import { isInterrupted, trackEngine } from './interrupt'
import type { RunCommandConfig } from './parser'
import type { RootCandidate } from './root-plan'

/**
 * The `--root --parallel` process pool (US-491 T-4/T-5).
 *
 * The unit of concurrency is ONE `pair-cli run --card <id>` process (#487) — a genuinely separate
 * OS process, never a worker thread, so the context isolation #486/#487 guarantee per card holds.
 * The pool adds no policy: it starts at most `limit` of the planned cards at once, starts the next
 * when a slot frees, and records each card's own exit. One card failing, crashing or timing out
 * (its own per-process timeout, #487) never stops the others (AC4). Merge is not here (AC5): each
 * card reaches — or does not reach — its own `merge` stage inside its own process.
 */

export type CardOutcomeKind = 'completed' | 'failed' | 'crashed' | 'skipped' | 'interrupted'

export interface CardOutcome {
  readonly id: string
  readonly outcome: CardOutcomeKind
  readonly detail: string
  readonly startedAt?: string
  readonly endedAt?: string
}

/** How one card process ended — the child's exit, as the OS reports it. */
export interface CardProcessExit {
  readonly exitCode: number | null
  readonly signal: string | null
  /** Set when the process could not be spawned at all. */
  readonly error?: string
}

export type CardProcessRunner = (input: {
  readonly card: RootCandidate
  readonly args: readonly string[]
  readonly cwd: string
}) => Promise<CardProcessExit>

/** Exit → outcome: 0 is the card's own terminal (its audit line says which), anything else is not. */
export function outcomeOfExit(id: string, exit: CardProcessExit): Omit<CardOutcome, 'startedAt'> {
  if (exit.error !== undefined)
    return { id, outcome: 'crashed', detail: `spawn failed: ${exit.error}` }
  if (exit.signal !== null) return { id, outcome: 'crashed', detail: `killed by ${exit.signal}` }
  if (exit.exitCode === 0) return { id, outcome: 'completed', detail: 'exit 0' }
  return { id, outcome: 'failed', detail: `exit ${String(exit.exitCode)}` }
}

// ── the pool ───────────────────────────────────────────────────────────────────────────────────

export interface PoolInput<T> {
  readonly items: readonly T[]
  readonly limit: number
  readonly worker: (item: T) => Promise<CardOutcome>
  /** Whether a NOT-yet-started item may still start (false once the driver was signalled). */
  readonly mayStart?: () => boolean
  /** Outcome of an item the pool never started (interrupted before its turn). */
  readonly notStarted: (item: T) => CardOutcome
  /** Outcome of a worker that threw — isolation: the pool never rejects on one card (AC4). */
  readonly onWorkerError: (item: T, error: unknown) => CardOutcome
}

/** At most `limit` workers in flight; results in input order; never rejects. */
export async function runPool<T>(input: PoolInput<T>): Promise<CardOutcome[]> {
  const results: CardOutcome[] = new Array(input.items.length)
  const mayStart = input.mayStart ?? (() => true)
  let next = 0
  const lane = async (): Promise<void> => {
    while (next < input.items.length) {
      const index = next
      next += 1
      const item = input.items[index]!
      if (!mayStart()) {
        results[index] = input.notStarted(item)
        continue
      }
      try {
        results[index] = await input.worker(item)
      } catch (error) {
        results[index] = input.onWorkerError(item, error)
      }
    }
  }
  const lanes = Math.max(0, Math.min(input.limit, input.items.length))
  await Promise.all(Array.from({ length: lanes }, lane))
  return results
}

// ── card-lock over mutex resources (AC3) ───────────────────────────────────────────────────────

/**
 * The lock id of a mutex resource: `card-lock` takes a safe id (it is a directory name), and a
 * resource is a free string (a path, a skill name), so the resource is keyed by its digest. The
 * mechanism is `card-lock`'s own exclusive `mkdir` — no new lock semantics (AC3).
 */
export function resourceLockId(resource: string): string {
  return `mutex-${createHash('sha256').update(resource).digest('hex').slice(0, 16)}`
}

export type ResourceLockOutcome =
  | { readonly kind: 'acquired'; readonly release: () => void }
  | {
      readonly kind: 'held'
      readonly resource: string
      readonly path: string
      readonly since?: string
    }

/**
 * Takes every mutex resource of one card through `card-lock`, all or nothing.
 *
 * Within one batch the plan never admits two cards sharing a resource; the lock is what holds the
 * same guarantee ACROSS processes — a second `--parallel` run, or a single `run --card` another
 * driver started, cannot run a conflicting card while this one holds the resource.
 */
export function acquireResourceLocks(input: {
  readonly card: RootCandidate
  readonly workingArea: string
  readonly acquireLock: LockAcquirer
}): ResourceLockOutcome {
  const held: CardLock[] = []
  const releaseAll = (): void => {
    for (const lock of held.reverse()) lock.release()
  }
  for (const resource of [...new Set(input.card.mutexResources)]) {
    const outcome = input.acquireLock({
      workingArea: input.workingArea,
      card: resourceLockId(resource),
    })
    if (outcome.kind === 'held') {
      releaseAll()
      return {
        kind: 'held',
        resource,
        path: outcome.path,
        ...(outcome.since !== undefined && { since: outcome.since }),
      }
    }
    held.push(outcome.lock)
  }
  return { kind: 'acquired', release: releaseAll }
}

// ── one card process ───────────────────────────────────────────────────────────────────────────

/**
 * The `run --card` argv for one planned card: the card, the labels `pair-next` observed on it (so
 * its own mapping and `## Eligibility` gates see exactly what a trigger would pass), and the
 * operator's own opt-ins forwarded VERBATIM — never widened, never added (#487 unchanged).
 */
export function buildCardProcessArgs(
  config: RunCommandConfig,
  card: RootCandidate,
  cwd: string,
): string[] {
  const labels = card.labels ?? []
  return [
    'run',
    '--card',
    card.id,
    ...(labels.length > 0 ? ['--card-tags', labels.join(',')] : []),
    ...(config.engine !== undefined ? ['--engine', config.engine] : []),
    '--cwd',
    cwd,
    ...(config.autonomous ? ['--autonomous'] : []),
    ...(config.approveProjectTrust ? ['--approve-project-trust'] : []),
    ...(config.approveIneligible ? ['--approve-ineligible'] : []),
    '--iteration-timeout',
    String(config.iterationTimeoutSeconds),
  ]
}

/** The line a card's output is shown under; `DISPATCH-RECORD:` lines stay verbatim (they name the card). */
export function prefixLine(id: string, line: string): string {
  return line.startsWith('DISPATCH-RECORD:') ? line : `  [#${id}] ${line}`
}

function relay(child: ChildProcess, id: string): void {
  for (const stream of [child.stdout, child.stderr]) {
    if (stream === null) continue
    createInterface({ input: stream }).on('line', line => console.log(prefixLine(id, line)))
  }
}

/**
 * The shipped runner: this same `pair-cli`, re-invoked as `run --card` in a child process.
 *
 * `process.execPath` + `process.execArgv` + `process.argv[1]` is how the running CLI was started, so
 * the child runs the same installed version with the same loader flags. Tracked through
 * `interrupt.ts` so a SIGTERM/SIGINT on the pool reaches every running card, which then writes its
 * own `end` record and releases its own lock (#487's handler).
 */
export const spawnCardProcess: CardProcessRunner = ({ card, args, cwd }) =>
  new Promise(resolve => {
    const entry = process.argv[1]
    if (entry === undefined) {
      resolve({
        exitCode: null,
        signal: null,
        error: 'the running pair-cli entry point is unknown',
      })
      return
    }
    let child: ChildProcess
    try {
      child = spawn(process.execPath, [...process.execArgv, entry, ...args], {
        cwd,
        stdio: ['ignore', 'pipe', 'pipe'],
      })
    } catch (error) {
      resolve({ exitCode: null, signal: null, error: String(error) })
      return
    }
    trackEngine(child)
    relay(child, card.id)
    child.once('error', error => resolve({ exitCode: null, signal: null, error: error.message }))
    child.once('close', (exitCode, signal) => resolve({ exitCode, signal }))
  })

// ── one planned card, locked and run ───────────────────────────────────────────────────────────

export interface RunPlannedCardInput {
  readonly card: RootCandidate
  readonly config: RunCommandConfig
  readonly cwd: string
  readonly workingArea: string
  readonly acquireLock: LockAcquirer
  readonly runCardProcess: CardProcessRunner
  readonly now?: () => string
}

export async function runPlannedCard(input: RunPlannedCardInput): Promise<CardOutcome> {
  const now = input.now ?? (() => new Date().toISOString())
  const { card } = input
  const locks = acquireResourceLocks({
    card,
    workingArea: input.workingArea,
    acquireLock: input.acquireLock,
  })
  if (locks.kind === 'held') {
    return {
      id: card.id,
      outcome: 'skipped',
      detail:
        `mutex resource ${locks.resource} is held by another run (${locks.path}` +
        `${locks.since !== undefined ? `, since ${locks.since}` : ''})`,
    }
  }
  const startedAt = now()
  try {
    console.log(`  Started #${card.id}: pair-cli run --card ${card.id}`)
    const exit = await input.runCardProcess({
      card,
      args: buildCardProcessArgs(input.config, card, input.cwd),
      cwd: input.cwd,
    })
    const outcome = isInterrupted()
      ? { id: card.id, outcome: 'interrupted' as const, detail: 'the driver was signalled' }
      : outcomeOfExit(card.id, exit)
    return { ...outcome, startedAt, endedAt: now() }
  } finally {
    locks.release()
  }
}

// ── the batch audit line (T-5) ─────────────────────────────────────────────────────────────────

export interface BatchSummary {
  readonly at: string
  readonly startedAt: string
  readonly root: string
  readonly requested: number
  readonly effective: number
  readonly outcomes: readonly CardOutcome[]
  readonly excluded: readonly { readonly id: string }[]
}

const oneLine = (value: string): string => value.replace(/[\r\n]+/g, ' ').trim()

/**
 * ONE line per batch, in the audit trail's own `<at> key=value …` shape (`dispatch-audit.ts`),
 * next to — never instead of — each card's own `start`/`end` lines written by its own process.
 */
export function renderBatchAuditLine(summary: BatchSummary): string {
  const attempted = summary.outcomes.map(o => o.id)
  const fields: Array<[string, string]> = [
    ['event', 'batch'],
    ['root', summary.root],
    ['started', summary.startedAt],
    ['parallel', String(summary.requested)],
    ['effective', String(summary.effective)],
    ['attempted', attempted.length > 0 ? attempted.join(',') : '(none)'],
    [
      'outcomes',
      summary.outcomes.length > 0
        ? summary.outcomes.map(o => `${o.id}:${o.outcome}(${oneLine(o.detail)})`).join(',')
        : '(none)',
    ],
    [
      'excluded',
      summary.excluded.length > 0 ? summary.excluded.map(e => e.id).join(',') : '(none)',
    ],
  ]
  return `${summary.at} ${fields.map(([k, v]) => `${k}=${oneLine(v)}`).join(' ')}`
}

/** The batch's exit code: partial outcome ⇒ 1 when any card failed or crashed, else 0. */
export function batchExitCode(outcomes: readonly CardOutcome[]): number {
  return outcomes.some(o => o.outcome === 'failed' || o.outcome === 'crashed') ? 1 : 0
}
