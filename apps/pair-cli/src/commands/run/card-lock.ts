import { mkdirSync, readFileSync, rmSync, statSync, writeFileSync, type Stats } from 'fs'
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

/**
 * How the acquirer inspects a path its own `mkdir` just refused. `undefined` ⇒ nothing is there.
 *
 * A seam, not a filesystem abstraction: the real one is `statSync` and every caller uses it. It is
 * injectable because this is exactly where the burst's interleaving lands — the holder's `finally`
 * firing between our `mkdir` and our `stat` — and reproducing that any other way means racing two
 * processes on a microsecond window.
 */
export type PathInspector = (path: string) => Stats | undefined

/**
 * `stat`, with "it is not there" as an ANSWER rather than an exception.
 *
 * ENOENT here is not a failure: it means the lock was released between our create and our probe.
 * Every other error still throws — a permission failure reported as "free" would hand two triggers
 * the same card.
 */
const inspectPath: PathInspector = path => {
  try {
    return statSync(path)
  } catch (error) {
    if (isMissing(error)) return undefined
    throw error
  }
}

export function createCardLockAcquirer(inspect: PathInspector = inspectPath): LockAcquirer {
  return ({ workingArea, card }) => {
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
    if (createExclusively(path)) return acquired(path, card)

    const holder = inspect(path)
    // Nothing is there: the holder released in the window between our create and our probe — the
    // interleaving a trigger burst produces on a persistent daemon, where the two triggers share
    // one working area. The lock is FREE, so take it; letting the ENOENT escape would turn a
    // normal burst into a red job with a filesystem error.
    if (holder === undefined) return afterHolderVanished(path, card, inspect)
    return heldBy(path, holder)
  }
}

export const acquireCardLock: LockAcquirer = createCardLockAcquirer()

/** One exclusive create: `true` when this caller made the directory, `false` when it already existed. */
function createExclusively(path: string): boolean {
  try {
    // NOT recursive: with `recursive: true`, mkdir succeeds on an existing directory — which would
    // turn the lock into a no-op and hand every concurrent trigger the same card.
    mkdirSync(path)
    return true
  } catch (error) {
    if (!isAlreadyExists(error)) throw error
    return false
  }
}

/**
 * The lock vanished between our create and our probe: retry the exclusive create ONCE.
 *
 * Once, not in a loop — the retry either wins (the burst resolves, this trigger runs the card) or
 * loses to the next trigger, and losing is a clean skip, never an error: the card is still tagged,
 * so the following trigger picks it up. A path that keeps existing for `mkdir` while existing for
 * nothing else is neither of those — a dangling symlink, or a working area being written by
 * something else — and that is a broken working area, reported as one.
 */
function afterHolderVanished(path: string, card: string, inspect: PathInspector): CardLockOutcome {
  if (createExclusively(path)) return acquired(path, card)
  const holder = inspect(path)
  if (holder === undefined) {
    throw new Error(
      `Lock path ${path} exists for mkdir but not for stat (a dangling symlink, or a path being ` +
        `created and removed under the run): the working area is broken`,
    )
  }
  return heldBy(path, holder)
}

/** The refusal — or the broken working area the refusal would otherwise hide. */
function heldBy(path: string, holder: Stats): CardLockOutcome {
  // EEXIST also covers "a FILE is sitting where the lock directory goes", which is a broken
  // working area rather than contention. Reporting that as held would park every dispatch on this
  // card forever, with nothing to release it.
  if (!holder.isDirectory()) {
    throw new Error(`Lock path ${path} exists but is not a directory: the working area is broken`)
  }
  const since = heldSince(path)
  return { kind: 'held', path, ...(since !== undefined && { since }) }
}

function acquired(path: string, card: string): CardLockOutcome {
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

function isMissing(error: unknown): boolean {
  return (error as NodeJS.ErrnoException | undefined)?.code === 'ENOENT'
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
