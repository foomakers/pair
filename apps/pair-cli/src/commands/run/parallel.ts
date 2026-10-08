import { spawn, type ChildProcess } from 'child_process'
import { createHash } from 'crypto'
import { createInterface } from 'readline'
import type { CardLock, LockAcquirer } from './card-lock'
import { isInterrupted, trackEngine } from './interrupt'
import type { RunCommandConfig } from './parser'
import type { RootCandidate } from './root-plan'
import { parsePrepareResult, type PrepareResult } from './card-prepare'

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
  /** US-523: how the card's prepare phase ended, when it ran or was parked (`PREPARE-RESULT:` line of the child). */
  readonly prepare?: PrepareResult
  /** AD: the delivery-cycle status the child reported (`Cycle status: <s>`); absent ⇒ it never got to report one (a crash, an engine/API error). */
  readonly cycleStatus?: string
}

/** How one card process ended — the child's exit, as the OS reports it. */
export interface CardProcessExit {
  readonly exitCode: number | null
  readonly signal: string | null
  /** Set when the process could not be spawned at all. */
  readonly error?: string
  /** US-523: the prepare outcome the child printed (`PREPARE-RESULT: <result>`), when it printed one. */
  readonly prepare?: PrepareResult
  /** AD: the cycle status the child printed, when it printed one. */
  readonly cycleStatus?: string
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
  const prepare = exit.prepare !== undefined ? { prepare: exit.prepare } : {}
  if (exit.exitCode === 0) return { id, outcome: 'completed', detail: 'exit 0', ...prepare }
  const cycle = exit.cycleStatus !== undefined ? { cycleStatus: exit.cycleStatus } : {}
  return { id, outcome: 'failed', detail: `exit ${String(exit.exitCode)}`, ...prepare, ...cycle }
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
  | {
      readonly kind: 'acquired'
      readonly release: () => void
      /** Stale locks (dead holder pid) reclaimed to take these. */
      readonly reclaimed: ReadonlyArray<{ readonly id: string; readonly pid: number }>
    }
  | {
      readonly kind: 'held'
      readonly resource: string
      readonly path: string
      readonly since?: string
      readonly pid?: number
      readonly alive?: boolean
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
  const reclaimed: Array<{ id: string; pid: number }> = []
  // Once only: the interrupt path may release before the card's own `finally` does, and a second
  // release must never remove a lock another run acquired in between.
  let released = false
  const releaseAll = (): void => {
    if (released) return
    released = true
    for (const lock of [...held].reverse()) lock.release()
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
        ...(outcome.pid !== undefined && { pid: outcome.pid }),
        ...(outcome.alive !== undefined && { alive: outcome.alive }),
      }
    }
    held.push(outcome.lock)
    if (outcome.reclaimed !== undefined) {
      reclaimed.push({ id: resourceLockId(resource), pid: outcome.reclaimed.pid })
    }
  }
  return { kind: 'acquired', release: releaseAll, reclaimed }
}

// ── one card process ───────────────────────────────────────────────────────────────────────────

/** The autonomy arguments the operator passed, each a separate argv element (never shell-joined). */
function autonomyArgv(config: RunCommandConfig): string[] {
  // The parser builds the object in until, prepare, merge order — kept as given.
  return Object.entries(config.autonomy ?? {}).flatMap(([key, value]) => [`--${key}`, value])
}

/**
 * The `run --card` argv for one planned card: the card, the labels `pair-next` observed on it (so
 * its own mapping and `## Eligibility` gates see exactly what a trigger would pass), and the
 * operator's own opt-ins forwarded VERBATIM — never widened, never added (#487 unchanged).
 */
export function buildCardProcessArgs(
  config: RunCommandConfig,
  card: RootCandidate,
  cwd: string,
  /** The loop's effective filter when it came from an argument or `## Autonomy` — the child's eligibility input. */
  eligibilityFilter?: string,
): string[] {
  const labels = card.labels ?? []
  return [
    'run',
    '--card',
    card.id,
    ...(labels.length > 0 ? ['--card-tags', labels.join(',')] : []),
    ...(config.engine !== undefined ? ['--engine', config.engine] : []),
    ...(eligibilityFilter !== undefined ? ['--eligibility-filter', eligibilityFilter] : []),
    '--cwd',
    cwd,
    ...(config.autonomous ? ['--autonomous'] : []),
    ...(config.approveProjectTrust ? ['--approve-project-trust'] : []),
    ...(config.approveIneligible ? ['--approve-ineligible'] : []),
    ...autonomyArgv(config),
    '--iteration-timeout',
    String(config.iterationTimeoutSeconds),
  ]
}

/** The line a card's output is shown under; `DISPATCH-RECORD:` lines stay verbatim (they name the card). */
export function prefixLine(id: string, line: string): string {
  return line.startsWith('DISPATCH-RECORD:') ? line : `  [#${id}] ${line}`
}

/** The delivery-cycle status line a `run --card` child prints (`  Cycle status: failed-contract (…)`). */
export function parseCycleStatus(line: string): string | undefined {
  return /^\s*Cycle status: (\S+)/.exec(line)?.[1]
}

function relay(
  child: ChildProcess,
  id: string,
  onPrepare: (result: PrepareResult) => void,
  onCycle: (status: string) => void,
): void {
  for (const stream of [child.stdout, child.stderr]) {
    if (stream === null) continue
    createInterface({ input: stream }).on('line', line => {
      const prepare = parsePrepareResult(line)
      if (prepare !== undefined) onPrepare(prepare)
      const cycle = parseCycleStatus(line)
      if (cycle !== undefined) onCycle(cycle)
      console.log(prefixLine(id, line))
    })
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
    let prepare: PrepareResult | undefined
    let cycleStatus: string | undefined
    relay(
      child,
      card.id,
      result => (prepare = result),
      status => (cycleStatus = status),
    )
    child.once('error', error => resolve({ exitCode: null, signal: null, error: error.message }))
    child.once('close', (exitCode, signal) =>
      resolve({
        exitCode,
        signal,
        ...(prepare !== undefined && { prepare }),
        ...(cycleStatus !== undefined && { cycleStatus }),
      }),
    )
  })

// ── one planned card, locked and run ───────────────────────────────────────────────────────────

export interface RunPlannedCardInput {
  readonly card: RootCandidate
  readonly config: RunCommandConfig
  readonly eligibilityFilter?: string
  readonly cwd: string
  readonly workingArea: string
  readonly acquireLock: LockAcquirer
  readonly runCardProcess: CardProcessRunner
  /** Told of every stale lock reclaimed to run this card (audited by the caller). */
  readonly onReclaim?: (lock: string, pid: number) => void
  readonly now?: () => string
  /**
   * The driver's registry of resource locks still held by a running card: the release is added
   * once acquired and removed once released, so an interrupted driver releases exactly the locks
   * it acquired — before it exits, without waiting on the child's streams.
   */
  readonly heldLocks?: Set<() => void>
}

function holderNote(held: { pid?: number; alive?: boolean }): string {
  if (held.pid === undefined) return ''
  return `; locked by pid ${held.pid}${held.alive === true ? ' (alive)' : ''}`
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
        `${locks.since !== undefined ? `, since ${locks.since}` : ''}${holderNote(locks)})`,
    }
  }
  for (const r of locks.reclaimed) {
    console.log(`  Reclaimed stale lock ${r.id} (pid ${r.pid} dead) for #${card.id}`)
    input.onReclaim?.(r.id, r.pid)
  }
  input.heldLocks?.add(locks.release)
  const startedAt = now()
  try {
    console.log(`  Started #${card.id}: pair-cli run --card ${card.id}`)
    const exit = await input.runCardProcess({
      card,
      args: buildCardProcessArgs(input.config, card, input.cwd, input.eligibilityFilter),
      cwd: input.cwd,
    })
    const outcome = isInterrupted()
      ? { id: card.id, outcome: 'interrupted' as const, detail: 'the driver was signalled' }
      : outcomeOfExit(card.id, exit)
    return { ...outcome, startedAt, endedAt: now() }
  } finally {
    locks.release()
    input.heldLocks?.delete(locks.release)
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
