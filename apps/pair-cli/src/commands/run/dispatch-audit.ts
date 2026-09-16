import { appendFileSync, mkdirSync } from 'fs'
import { dirname, join } from 'path'
import type { DispatchDecision } from './dispatch'

/**
 * The dispatch audit trail (US-217 T-3) — and the boundary where host credentials are NOT.
 *
 * Every decision leaves two artifacts:
 *
 * 1. a line appended to the run's `## Audit Location` file, which is the durable trail an operator
 *    reads after an unattended night;
 * 2. a single `DISPATCH-RECORD:` line on stdout, which the **trigger's own host adapter** — the thin
 *    per-host piece that already runs under the credentials the trigger fired with — posts as a
 *    comment on the card (AC3's "recorded on the issue").
 *
 * The split is the design: this driver never holds a tracker token, so adding a code host is a new
 * adapter, never a change to the routing core. What it CAN do is write a file and print a line, and
 * that is exactly what it does.
 *
 * **Why `node:fs` directly, and not `FileSystemService`** (ADL 2026-08-30): appending is the
 * primitive that keeps two concurrent dispatches (different cards, one audit file) from clobbering
 * each other's history. `FileSystemService` offers `writeFile` only, so a read-concat-write would
 * reintroduce exactly the lost update the `O_APPEND` open exists to prevent. The writer is therefore
 * a leaf module over the real primitive, injected at the call site and tested against a real
 * temporary directory.
 */

export type AuditEvent = 'start' | 'skip' | 'end'

export interface DispatchAuditRecord {
  readonly at: string
  readonly event: AuditEvent
  readonly card: string
  readonly tag?: string
  readonly workflow?: string
  readonly reason?: string
  readonly outcome?: string
}

export interface AuditRecordOptions {
  /** The timestamp, injected so a record is reproducible in a test and honest in a run. */
  readonly at?: string
  /** How the run ended (`end`), or any extra qualifier worth keeping. */
  readonly outcome?: string
}

/** Builds the record for a decision — the audit says what the dispatcher decided, never more. */
export function auditRecordFor(
  decision: DispatchDecision,
  event: AuditEvent,
  options: AuditRecordOptions = {},
): DispatchAuditRecord {
  const at = options.at ?? new Date().toISOString()
  const outcome = options.outcome
  return {
    at,
    event,
    card: decision.card,
    ...(decision.kind === 'route' && { tag: decision.tag, workflow: decision.workflow }),
    ...(decision.kind === 'skip' && { reason: decision.reason }),
    ...(outcome !== undefined && { outcome }),
  }
}

/**
 * One record, one line — `key=value` pairs, greppable and stable.
 *
 * Every value is flattened to a single line: a record that spanned two lines would corrupt the very
 * trail it belongs to, and the audit file is read by line.
 */
export function renderAuditLine(record: DispatchAuditRecord): string {
  const fields: Array<[string, string | undefined]> = [
    ['event', record.event],
    ['card', record.card],
    ['tag', record.tag],
    ['workflow', record.workflow],
    ['reason', record.reason],
    ['outcome', record.outcome],
  ]
  const rendered = fields
    .filter((field): field is [string, string] => field[1] !== undefined)
    .map(([key, value]) => `${key}=${oneLine(value)}`)
    .join(' ')
  return `${record.at} ${rendered}`
}

/** The line a host adapter reads off stdout to post on the card. */
export function dispatchRecordLine(record: DispatchAuditRecord): string {
  return `DISPATCH-RECORD: ${renderAuditLine(record)}`
}

/** `<project>/<working_path>/<Audit Location>` — the location is project-relative by schema. */
export function resolveAuditPath(
  projectRoot: string,
  workingPath: string,
  auditLocation: string,
): string {
  return join(projectRoot, workingPath, auditLocation)
}

/** Appends one line, creating the destination's parents. Throws — an unaudited run is not a mode. */
export type AuditAppender = (path: string, line: string) => void

export const appendAuditLine: AuditAppender = (path, line) => {
  mkdirSync(dirname(path), { recursive: true })
  appendFileSync(path, `${line}\n`)
}

function oneLine(value: string): string {
  return value.replace(/[\r\n]+/g, ' ').trim()
}
