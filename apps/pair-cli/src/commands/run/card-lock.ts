import { mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'fs'
import { join } from 'path'
import { isSafeId } from './prompt-safety'

/**
 * The per-card concurrency guard (US-217 T-3): never two runs on the same card.
 *
 * A trigger fires on card metadata, and metadata changes in bursts — a label added, removed and
 * re-added; a host job re-run. Two agent runs on one card would race on the same branch, the same PR
 * and the same board state, so a second dispatch while the first holds the lock is SKIPPED, never
 * queued: the card is still tagged, so the next trigger picks it up anyway.
 *
 * **Why `node:fs` directly, and not `FileSystemService`** (ADL 2026-08-30): the property this module
 * exists for is the ATOMICITY of an exclusive create — `mkdir` either creates the directory or fails
 * with `EEXIST`, with no window between the check and the create. `FileSystemService` exposes no
 * exclusive-create primitive, and the in-memory double models `mkdir` as "add to a set", which cannot
 * fail a second create at all. Testing this against the double would assert nothing; so the lock is
 * a leaf module over the real primitive, injected at the call site and tested against a real
 * temporary directory.
 */

/**
 * Where the locks live, under the working area. EXPORTED because the caller that reports a declined
 * acquisition has to name the same directory this module creates: a second literal at the call site
 * would keep printing the old path the day this one moves, sending an operator chasing a stale lock
 * to a directory that does not exist.
 */
export const LOCK_DIRECTORY = join('automation', 'locks')

export interface CardLock {
  /** The lock directory on disk — printed, so a stale lock is findable without guessing. */
  readonly path: string
  /** Idempotent: releasing an already-released lock is not an error. */
  release(): void
}

export interface CardLockRequest {
  /** The resolved working area (`working_path`), under which the lock directory lives. */
  readonly workingArea: string
  readonly card: string
}

/**
 * The acquisition, or the holder that refused it.
 *
 * A decline carries the holder's `path` and `since` rather than a bare `undefined`: a lock that
 * outlives its process (SIGKILL, an OOM kill, a host job timeout) leaves nothing to release it, and
 * a skip that reports only "run-in-progress" is indistinguishable from a healthy burst. The data was
 * already being written to `holder.json`; this is the path that reads it back.
 */
export type CardLockOutcome =
  | { readonly kind: 'acquired'; readonly lock: CardLock }
  | {
      readonly kind: 'held'
      /** The holder's lock directory — the thing an operator removes to clear a stale one. */
      readonly path: string
      /** The holder's `acquiredAt`, when it is readable. Best-effort: the LOCK is the directory. */
      readonly since?: string | undefined
    }

/** Acquires the card's lock, or reports the holder that already has it. */
export type LockAcquirer = (request: CardLockRequest) => CardLockOutcome

export const acquireCardLock: LockAcquirer = ({ workingArea, card }) => {
  // The card id is a PATH SEGMENT here, so it gets the same rule `--root` and `--skill` get. The
  // parser already applied it; a second check belongs where the path is actually built.
  if (!isSafeId(card)) {
    throw new Error(
      `Cannot lock card '${card}': a card id must be a plain identifier (it is used as a directory name)`,
    )
  }

  const directory = join(workingArea, LOCK_DIRECTORY)
  mkdirSync(directory, { recursive: true })

  const path = join(directory, card)
  try {
    // NOT recursive: with `recursive: true`, mkdir succeeds on an existing directory — which would
    // turn the lock into a no-op and hand every concurrent trigger the same card.
    mkdirSync(path)
  } catch (error) {
    if (!isAlreadyExists(error)) throw error
    // EEXIST also covers "a FILE is sitting where the lock directory goes", which is a broken
    // working area rather than contention. Reporting that as held would park every dispatch on this
    // card forever, with nothing to release it.
    if (!statSync(path).isDirectory()) {
      throw new Error(`Lock path ${path} exists but is not a directory: the working area is broken`)
    }
    const since = heldSince(path)
    return { kind: 'held', path, ...(since !== undefined && { since }) }
  }

  // Who holds it and since when — the lock is what an operator inspects after a killed run, and a
  // bare empty directory tells them nothing. Best-effort: the LOCK is the directory, not this file.
  try {
    writeFileSync(
      join(path, 'holder.json'),
      `${JSON.stringify({ card, pid: process.pid, acquiredAt: new Date().toISOString() }, null, 2)}\n`,
    )
  } catch {
    // A working area that cannot hold the holder note still holds the lock itself.
  }

  return {
    kind: 'acquired',
    lock: {
      path,
      release: () => rmSync(path, { recursive: true, force: true }),
    },
  }
}

function isAlreadyExists(error: unknown): boolean {
  return (error as NodeJS.ErrnoException | undefined)?.code === 'EEXIST'
}

/**
 * When the holder took the lock, read back off its own note.
 *
 * Best-effort in exactly the direction the write is: a holder note that is missing, truncated or
 * malformed means the age is unknown, never that the lock is free.
 */
function heldSince(path: string): string | undefined {
  try {
    const holder: unknown = JSON.parse(readFileSync(join(path, 'holder.json'), 'utf-8'))
    const acquiredAt = (holder as { acquiredAt?: unknown })?.acquiredAt
    return typeof acquiredAt === 'string' ? acquiredAt : undefined
  } catch {
    return undefined
  }
}
