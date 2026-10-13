import { readFileSync } from 'fs'
import { hostname } from 'os'
import { join } from 'path'

/**
 * Who holds a lock, read off its own `holder.json` (`{ card, pid, host?, acquiredAt }`), and whether that
 * holder is still alive. A lock outlives a SIGKILLed driver (nothing ran its release), so a holder pid that is
 * not alive ON THIS HOST marks the lock STALE: reclaimable. Anything uncertain — no pid, a different host,
 * an unreadable note — is `unknown` and the lock is respected: a guess must never hand two runs one card.
 */
export interface HolderNote {
  readonly pid?: number
  readonly host?: string
  readonly acquiredAt?: string
}

export type Liveness =
  | { readonly state: 'alive'; readonly pid: number }
  | { readonly state: 'dead'; readonly pid: number }
  | { readonly state: 'unknown'; readonly pid?: number }

export function readHolder(path: string): HolderNote {
  try {
    const raw = JSON.parse(readFileSync(join(path, 'holder.json'), 'utf-8')) as Record<
      string,
      unknown
    >
    return {
      ...(typeof raw['pid'] === 'number' && Number.isInteger(raw['pid']) && { pid: raw['pid'] }),
      ...(typeof raw['host'] === 'string' && { host: raw['host'] }),
      ...(typeof raw['acquiredAt'] === 'string' && { acquiredAt: raw['acquiredAt'] }),
    }
  } catch {
    return {}
  }
}

/** `process.kill(pid, 0)`: ESRCH ⇒ gone; EPERM ⇒ exists (another user's process). */
export function pidIsAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return (error as NodeJS.ErrnoException).code !== 'ESRCH'
  }
}

export function livenessOf(path: string, isAlive: (pid: number) => boolean = pidIsAlive): Liveness {
  const { pid, host } = readHolder(path)
  if (pid === undefined) return { state: 'unknown' }
  // No host recorded (older locks) ⇒ same host; a different host's pid says nothing about this one.
  if (host !== undefined && host !== hostname()) return { state: 'unknown', pid }
  return { state: isAlive(pid) ? 'alive' : 'dead', pid }
}
