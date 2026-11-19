import { readFileSync, unlinkSync, writeFileSync } from 'fs'
import { hostname } from 'os'
import { join } from 'path'
import { pidIsAlive } from './lock-holder'

/**
 * #691 AC5 — one driver per card run dir. The run-dir `.lock` mutex only spans a single write; two `pair run --card N`
 * would otherwise interleave whole stages over the same handoffs. `<runDir>/run.lock` ({ pid, host, startedAt }) is
 * created exclusively (`wx`), real `node:fs` for the same reason `card-lock.ts` gives (ADL 2026-08-30). A live holder,
 * or one on another host, is never broken; a dead pid on this host (a SIGKILLed run) is taken over and reported.
 */
export const RUN_LOCK_FILE = 'run.lock'

export type RunLockOutcome =
  | {
      readonly kind: 'acquired'
      readonly release: () => void
      readonly takenOver?: { readonly pid: number; readonly host: string }
    }
  | { readonly kind: 'run-locked'; readonly pid?: number; readonly host?: string }

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
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
  }
  const { pid, host } = readNote(file)
  if (pid === undefined || host !== hostname() || isAlive(pid))
    return {
      kind: 'run-locked',
      ...(pid !== undefined && { pid }),
      ...(host !== undefined && { host }),
    }
  // ponytail: unlink + wx retry; two takers racing the same dead lock ⇒ one wins, the other reports run-locked.
  unlinkSync(file)
  try {
    create()
  } catch {
    return { kind: 'run-locked', ...readNote(file) }
  }
  return { kind: 'acquired', release, takenOver: { pid, host } }
}
