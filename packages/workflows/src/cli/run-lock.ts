import { readFileSync, rmSync, unlinkSync, writeFileSync } from 'node:fs'
import { hostname } from 'node:os'
import { join } from 'node:path'
import { pidIsAlive, takeGuard } from './lock-support'

/**
 * One driver per run directory (#691 AC5, #696 AC-4). `<runDir>/run.lock` ({ pid, host, startedAt })
 * is created exclusively (`wx`). A live holder or one on another machine keeps the lock.
 * A dead pid on this machine is taken over and reported.
 */
export const RUN_LOCK_FILE = 'run.lock'

export type RunLockOutcome =
  | {
      readonly kind: 'acquired'
      readonly release: () => void
      readonly takenOver?: { readonly pid: number; readonly host: string }
    }
  | { readonly kind: 'run-locked'; readonly pid?: number; readonly host?: string }

const readRaw = (file: string): string | undefined => {
  try {
    return readFileSync(file, 'utf8')
  } catch {
    return undefined
  }
}

const readNote = (file: string): { pid?: number; host?: string } => {
  try {
    const raw = JSON.parse(readFileSync(file, 'utf8')) as { pid?: unknown; host?: unknown }
    return {
      ...(Number.isInteger(raw.pid) && { pid: raw.pid as number }),
      ...(typeof raw.host === 'string' && { host: raw.host }),
    }
  } catch {
    return {}
  }
}

const isExists = (error: unknown) => (error as NodeJS.ErrnoException).code === 'EEXIST'

/**
 * Takeover under the exclusive sidecar guard: reclaimers are serialized, and the note is re-read inside
 * it — a lock that changed since it was read dead (another taker already took it) is never removed.
 */
function takeOver(file: string, seen: string | undefined, create: () => void): boolean {
  const guard = `${file}.reclaim`
  if (!takeGuard(guard)) return false
  try {
    const now = readRaw(file)
    if (now !== undefined && now !== seen) return false
    if (now !== undefined) unlinkSync(file)
    create()
    return true
  } catch (error) {
    if (!isExists(error)) throw error
    return false
  } finally {
    rmSync(guard, { recursive: true, force: true })
  }
}

export function acquireRunLock(
  runDir: string,
  isAlive: (pid: number) => boolean = pidIsAlive,
): RunLockOutcome {
  const file = join(runDir, RUN_LOCK_FILE)
  const create = () =>
    writeFileSync(
      file,
      JSON.stringify({ pid: process.pid, host: hostname(), startedAt: new Date().toISOString() }),
      { flag: 'wx' },
    )
  const release = () => {
    try {
      if (readNote(file).pid === process.pid) unlinkSync(file)
    } catch {
      // already gone: release is idempotent
    }
  }
  try {
    create()
    return { kind: 'acquired', release }
  } catch (error) {
    if (!isExists(error)) throw error
  }
  const seen = readRaw(file)
  const { pid, host } = readNote(file)
  if (pid === undefined || host !== hostname() || isAlive(pid))
    return {
      kind: 'run-locked',
      ...(pid !== undefined && { pid }),
      ...(host !== undefined && { host }),
    }
  if (!takeOver(file, seen, create)) return { kind: 'run-locked', ...readNote(file) }
  return { kind: 'acquired', release, takenOver: { pid, host } }
}
