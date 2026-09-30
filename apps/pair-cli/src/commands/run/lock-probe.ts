import { readFileSync, statSync } from 'fs'
import { join } from 'path'
import { LOCK_DIRECTORY, type CardLockRequest } from './card-lock'
import { resourceLockId } from './parallel'
import { isSafeId } from './prompt-safety'
import type { RootCandidate } from './root-plan'

/**
 * Non-acquiring lock probes (US-522 T-3): a read-only view of `automation/locks/<id>`, so the loop
 * can skip a locked card BEFORE spawning it. Advisory only — the atomic `mkdir` in `card-lock.ts`
 * stays the real guard (a race falls to the child's `run-in-progress` skip). Nothing is created,
 * and `acquireCardLock` / `acquireResourceLocks` are untouched.
 */

export type LockProbe =
  | { readonly kind: 'free' }
  | { readonly kind: 'held'; readonly path: string; readonly since?: string }

export type ResourceLockProbe =
  | { readonly kind: 'free' }
  | {
      readonly kind: 'held'
      readonly resource: string
      readonly path: string
      readonly since?: string
    }

export function probeCardLock({ workingArea, card }: CardLockRequest): LockProbe {
  // The id is a PATH SEGMENT: same rule the acquirer applies where the path is built.
  if (!isSafeId(card)) {
    throw new Error(
      `Cannot probe card '${card}': a card id must be a plain identifier (it is used as a directory name)`,
    )
  }
  return probePath(join(workingArea, LOCK_DIRECTORY, card))
}

/** The first held mutex resource of the card, else free. Ids are `mutex-<digest>`, always safe. */
export function probeResourceLocks(input: {
  readonly card: RootCandidate
  readonly workingArea: string
}): ResourceLockProbe {
  for (const resource of new Set(input.card.mutexResources)) {
    const probe = probePath(join(input.workingArea, LOCK_DIRECTORY, resourceLockId(resource)))
    if (probe.kind === 'held') return { ...probe, resource }
  }
  return { kind: 'free' }
}

function probePath(path: string): LockProbe {
  let stats
  try {
    stats = statSync(path)
  } catch (error) {
    if ((error as NodeJS.ErrnoException | undefined)?.code === 'ENOENT') return { kind: 'free' }
    // Any other failure reported as "free" would hand two drivers the same card.
    throw error
  }
  if (!stats.isDirectory()) {
    throw new Error(`Lock path ${path} exists but is not a directory: the working area is broken`)
  }
  const since = heldSince(path)
  return { kind: 'held', path, ...(since !== undefined && { since }) }
}

/** Best-effort, as in `card-lock.ts`: an unreadable note means age unknown, never free. */
function heldSince(path: string): string | undefined {
  try {
    const holder: unknown = JSON.parse(readFileSync(join(path, 'holder.json'), 'utf-8'))
    const acquiredAt = (holder as { acquiredAt?: unknown })?.acquiredAt
    return typeof acquiredAt === 'string' ? acquiredAt : undefined
  } catch {
    return undefined
  }
}
