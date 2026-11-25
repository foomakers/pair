import { readFileSync } from 'node:fs'
import { hostname } from 'node:os'
import { dirname, join } from 'node:path'
import { pidIsAlive } from './lock-support'
import { sessionOwnerAlive } from './run-lock'

/**
 * Who holds a lock, read off its own `holder.json` (`{ card, pid, host?, acquiredAt }`), and whether that
 * holder is still alive. A lock outlives a SIGKILLed driver (nothing ran its release), so a holder pid that is
 * not alive ON THIS HOST marks the lock STALE: reclaimable. Anything uncertain — no pid, a different host,
 * an unreadable note — is `unknown` and the lock is respected: a guess must never hand two runs one card.
 */
export interface SessionOwner {
  readonly runId: string
  readonly token: string
}

function sessionOwner(value: unknown): SessionOwner | undefined {
  const owner = value as Partial<SessionOwner> | null | undefined
  if (
    typeof owner?.runId === 'string' &&
    /^[A-Za-z0-9][A-Za-z0-9._-]{0,199}$/.test(owner.runId) &&
    !owner.runId.includes('..') &&
    typeof owner.token === 'string'
  )
    return { runId: owner.runId, token: owner.token }
  return undefined
}

export interface HolderNote {
  readonly session?: SessionOwner
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
    const session = sessionOwner(raw['session'])
    return {
      ...(session !== undefined && { session }),
      ...(typeof raw['pid'] === 'number' && Number.isInteger(raw['pid']) && { pid: raw['pid'] }),
      ...(typeof raw['host'] === 'string' && { host: raw['host'] }),
      ...(typeof raw['acquiredAt'] === 'string' && { acquiredAt: raw['acquiredAt'] }),
    }
  } catch {
    return {}
  }
}

export function livenessOf(path: string, isAlive: (pid: number) => boolean = pidIsAlive): Liveness {
  const { pid, host, session } = readHolder(path)
  if (pid === undefined) return { state: 'unknown' }
  // No host recorded (older locks) ⇒ same host; a different host's pid says nothing about this one.
  if (host !== undefined && host !== hostname()) return { state: 'unknown', pid }
  const alive =
    session === undefined
      ? isAlive(pid)
      : sessionOwnerAlive(join(dirname(path), '../../runs', session.runId), session.token, isAlive)
  return { state: alive ? 'alive' : 'dead', pid }
}
