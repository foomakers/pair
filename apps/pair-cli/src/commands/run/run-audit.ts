import { existsSync, readFileSync } from 'fs'
import { appendAuditLine, type AuditAppender } from './dispatch-audit'
import type { RunEvent } from './run-events'

/**
 * The live run audit (US-573 T-6): the DRIVER writes the trail from the run events, one JSON line
 * per event, appended and flushed at once — a killed run keeps everything up to its last event, and
 * `tail -f` follows it. Same `## Audit Location` file and same `O_APPEND` primitive as the dispatch
 * records (`dispatch-audit.ts`); the shared-file schema choice is ADL 2026-10-23.
 */

export interface RunAuditInput {
  /** Absolute path of the resolved `## Audit Location`. */
  readonly path: string
  readonly runId: string
  readonly root: string
  /** The effective policy and the source of each value — data, recorded verbatim. */
  readonly policy: Readonly<Record<string, unknown>>
  readonly now?: () => string
  /** The `O_APPEND` writer (injected in tests). */
  readonly append?: AuditAppender
  /**
   * Told ONCE when a write fails; the audit then stops writing and the run goes on. An unwritable
   * trail must not kill cards already in flight — the failure is surfaced, never swallowed.
   */
  readonly onWriteError?: (error: unknown) => void
}

export interface RunAudit {
  readonly path: string
  record(event: RunEvent, iteration?: number): void
  /** The run's own `loop-end` — written once; a later call is a no-op. */
  end(status: string, reason: string): void
}

export function createRunAudit(input: RunAuditInput): RunAudit {
  const now = input.now ?? (() => new Date().toISOString())
  const append = input.append ?? appendAuditLine
  let broken = false
  const write = (event: string, card: string | null, iteration: number | null, detail: object) => {
    if (broken) return
    try {
      append(
        input.path,
        JSON.stringify({ ts: now(), runId: input.runId, iteration, card, event, detail }),
      )
    } catch (error) {
      broken = true
      if (input.onWriteError === undefined) throw error
      input.onWriteError(error)
    }
  }
  write('loop-start', null, null, { root: input.root, policy: input.policy })
  let ended = false
  return {
    path: input.path,
    record: ({ event, card, iteration: _own, extra, ...fields }, iteration) =>
      write(event, card ?? null, iteration ?? null, { ...fields, ...extra }),
    end: (status, reason) => {
      if (ended) return
      ended = true
      write('loop-end', null, null, { status, reason })
    },
  }
}

/** US-575 AC9: a card an earlier run of this audit ended on a durable terminal, as that run recorded it. */
export interface PreviousExclusion {
  readonly card: string
  readonly reason: string
  readonly runId: string
  readonly date: string
}

const DURABLE_END = (status: string): boolean =>
  status.startsWith('failed-') || status === 'needs-human' || status === 'escalate'

/**
 * Every card whose LATEST `card-end` in the audit is a durable terminal (`failed-*`, `needs-human`, `escalate`). Listed
 * at the start of a new run and never inherited: the run drives them again and `resolve` re-evaluates each one (a
 * failure recorded on heads that since moved is stale). Lines that are not this audit's JSON events are skipped.
 */
export function previousExclusions(path: string): PreviousExclusion[] {
  if (!existsSync(path)) return []
  const latest = new Map<string, PreviousExclusion | undefined>()
  for (const line of readFileSync(path, 'utf-8').split('\n')) {
    let entry: { ts?: string; runId?: string; card?: string; event?: string; detail?: { status?: string; reason?: string } }
    try {
      entry = JSON.parse(line) as typeof entry
    } catch {
      continue
    }
    if (entry.event !== 'card-end' || typeof entry.card !== 'string') continue
    const status = String(entry.detail?.status ?? '')
    const reason = entry.detail?.reason?.startsWith('needs-human') ? entry.detail.reason : status
    latest.set(
      entry.card,
      DURABLE_END(status)
        ? { card: entry.card, reason, runId: String(entry.runId ?? '?'), date: String(entry.ts ?? '').slice(0, 10) }
        : undefined,
    )
  }
  return [...latest.values()].filter((e): e is PreviousExclusion => e !== undefined)
}
