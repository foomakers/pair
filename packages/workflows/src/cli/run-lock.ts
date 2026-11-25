import { linkSync, readFileSync, renameSync, rmSync, unlinkSync, writeFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { hostname } from 'node:os'
import { join } from 'node:path'
import type { StepLaunch } from '../engine'
import { pidIsAlive, takeGuard } from './lock-support'
import type { ApprovalTarget } from './workflow-approval'

/** One driver per run directory (#691 AC5, #696 AC-4), regardless of host. */
export const RUN_LOCK_FILE = 'run.lock'
const LEASE_MS = 60 * 60_000

type Owner = { readonly pid: number; readonly host: string }
type Locked = { readonly kind: 'run-locked'; readonly pid?: number; readonly host?: string }

export type RunLockOutcome =
  | {
      readonly kind: 'acquired'
      readonly release: () => void
      readonly takenOver?: Owner
    }
  | Locked

export type SessionApproval = ApprovalTarget & { readonly step: string; readonly question: string }

export interface SessionLease {
  readonly token: string
  readonly engine: string
  readonly expiresAt: number
  readonly worktree?: string
  readonly launch?: StepLaunch | undefined
  readonly launchStartedAt?: number | undefined
  readonly approval?: SessionApproval | undefined
  telemetryWarned?: true
}

interface LockNote {
  readonly host?: string
  readonly pid?: number
  readonly startedAt?: string
  readonly ownerId?: string
  readonly lease?: SessionLease
}

function readNote(file: string): LockNote | undefined {
  try {
    const note: unknown = JSON.parse(readFileSync(file, 'utf8'))
    return typeof note === 'object' && note !== null ? (note as LockNote) : {}
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
    return {} // An unreadable owner is never evidence of an orphan.
  }
}

const locked = ({ pid, host }: LockNote = {}): Locked => ({
  kind: 'run-locked',
  ...(typeof pid === 'number' && { pid }),
  ...(typeof host === 'string' && { host }),
})

function guarded<T>(runDir: string, transact: (file: string) => T): T | Locked {
  const file = join(runDir, RUN_LOCK_FILE)
  const guard = `${file}.reclaim`
  if (!takeGuard(guard)) return locked(readNote(file))
  try {
    return transact(file)
  } finally {
    rmSync(guard, { recursive: true, force: true })
  }
}

function publish(file: string, note: LockNote, exclusive = false): boolean {
  const temporary = `${file}.${randomUUID()}.tmp`
  try {
    writeFileSync(temporary, JSON.stringify(note), { flag: 'wx', mode: 0o600 })
    if (exclusive) linkSync(temporary, file)
    else renameSync(temporary, file)
    return true
  } catch (error) {
    if (!exclusive || (error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
    return false
  } finally {
    rmSync(temporary, { force: true })
  }
}

function orphaned(note: LockNote, isAlive: (pid: number) => boolean): boolean {
  if (note.host !== hostname()) return false
  if (note.pid !== undefined) {
    if (!Number.isSafeInteger(note.pid) || note.pid < 1 || isAlive(note.pid)) return false
    return true
  }
  const expiresAt = note.lease?.expiresAt
  return typeof expiresAt === 'number' && expiresAt <= Date.now()
}

/** A card reservation follows the run lease across short-lived session commands. */
export function sessionOwnerAlive(
  runDir: string,
  token: string,
  isAlive: (pid: number) => boolean,
) {
  const note = readNote(join(runDir, RUN_LOCK_FILE))
  if (note === undefined) return false
  if (note.lease === undefined) return note.host === undefined && note.pid === undefined
  return note.lease.token === token && !orphaned(note, isAlive)
}

const active = () => ({
  pid: process.pid,
  host: hostname(),
  startedAt: new Date().toISOString(),
})

export function acquireRunLock(
  runDir: string,
  isAlive: (pid: number) => boolean = pidIsAlive,
): RunLockOutcome {
  const seen = readNote(join(runDir, RUN_LOCK_FILE))
  if (seen !== undefined && !orphaned(seen, isAlive)) return locked(seen)
  return guarded(runDir, file => {
    const current = readNote(file)
    if (current !== undefined && JSON.stringify(current) !== JSON.stringify(seen))
      return locked(current)

    const owner = { ...active(), ownerId: randomUUID() }
    if (!publish(file, owner, current === undefined)) return locked(readNote(file))
    const release = () => {
      try {
        if (readNote(file)?.ownerId === owner.ownerId) unlinkSync(file)
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      }
    }
    return {
      kind: 'acquired',
      release,
      ...(seen?.pid !== undefined &&
        seen.host !== undefined && {
          takenOver: { pid: seen.pid, host: seen.host },
        }),
    }
  })
}

const renewed = (lease: SessionLease): SessionLease => ({
  ...lease,
  expiresAt: Date.now() + LEASE_MS,
})

function requireLease(lease: SessionLease | Locked): SessionLease {
  if ('kind' in lease)
    throw new Error(
      `run-locked: ${lease.host ?? 'another host'}${lease.pid ? ` (PID ${lease.pid})` : ''} holds this run`,
    )
  return lease
}

/** Claim the lease and mark the short command live before releasing the transaction guard. */
function claim(runDir: string, input: { engine: string } | { token: string }): SessionLease {
  return requireLease(
    guarded(runDir, file => {
      const note = readNote(file)
      const unused = note === undefined || orphaned(note, pidIsAlive)
      const lease =
        'engine' in input
          ? unused
            ? { token: randomUUID(), engine: input.engine, expiresAt: 0 }
            : undefined
          : idleLease(note, unused, input.token)
      if (lease === undefined) return locked(note)
      const refreshed = renewed(lease)
      return publish(file, { ...active(), lease: refreshed }, note === undefined)
        ? refreshed
        : locked(readNote(file))
    }),
  )
}

function idleLease(
  note: LockNote | undefined,
  unused: boolean,
  token: string,
): SessionLease | undefined {
  if (note?.lease?.token !== token || unused)
    throw new Error('invalid-lease: open the run again with resume')
  return note.host === hostname() && note.pid === undefined ? note.lease : undefined
}

/** Release the command's PID and renew the idle lease, or remove it on stop or failed open. */
function finish(runDir: string, lease: SessionLease, keep: boolean): void {
  const file = join(runDir, RUN_LOCK_FILE)
  const note = readNote(file)
  if (note?.lease?.token !== lease.token || note.pid !== process.pid)
    throw new Error('invalid-lease: session ownership changed')
  // Other commands cannot replace a live PID. Publish the renewed idle note in one rename.
  if (keep) publish(file, { host: hostname(), lease: renewed(lease) })
  else unlinkSync(file)
}

export async function withSessionLease<T>(
  runDir: string,
  input: { engine: string } | { token: string },
  command: (lease: SessionLease) => Promise<{
    result: T
    launch?: StepLaunch
    launchStartedAt?: number | undefined
    approval?: SessionApproval | undefined
    worktree?: string
    stop?: boolean
  }>,
): Promise<T> {
  const lease = claim(runDir, input)
  let outcome
  try {
    outcome = await command(lease)
  } catch (error) {
    finish(runDir, lease, 'token' in input)
    throw error
  }
  const { worktree, launch, launchStartedAt, approval, stop } = outcome
  finish(
    runDir,
    { ...lease, ...(worktree !== undefined && { worktree }), launch, launchStartedAt, approval },
    !stop,
  )
  return outcome.result
}
