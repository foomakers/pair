import { basename, dirname, join } from 'path'
import { logger as log, type FileSystemService } from '@pair/content-ops'
import {
  expectedManifestName,
  getSourceCachePath,
  officialSource,
  type KBSource,
} from './cache-slot-key'

/**
 * CACHE SLOT LIFECYCLE: what is inside a slot and how it is replaced (inspect, purge,
 * backup/restore). Which directory a source owns is derived in `cache-slot-key.ts`.
 */

/** State of a cache slot relative to the source that is supposed to own it. */
export type SlotState =
  | { status: 'empty' }
  | { status: 'ready' }
  | { status: 'contaminated'; expected: string; found: string }

type ManifestRead = { present: false } | { present: true; name: string | null }

async function readManifest(slotPath: string, fs: FileSystemService): Promise<ManifestRead> {
  const manifestPath = join(slotPath, 'manifest.json')
  if (!fs.existsSync(manifestPath)) return { present: false }
  try {
    const parsed = JSON.parse(await fs.readFile(manifestPath)) as { name?: unknown }
    return { present: true, name: typeof parsed.name === 'string' ? parsed.name : null }
  } catch {
    return { present: true, name: null }
  }
}

/**
 * Whether a slot holds what its source claims (AC5). Three outcomes, three distinct
 * signals:
 *
 * - **contaminated** — the manifest names a DIFFERENT KB: the caller must purge and
 *   re-fetch instead of serving foreign content.
 * - **empty** — no slot, or a slot with no `manifest.json` at all where one is expected.
 *   The official KB always ships a manifest, so its absence means a half-written download
 *   (aborted extraction), not a legacy cache: re-fetch. `empty` deletes nothing.
 * - **ready** — including a manifest that is present but unreadable or nameless: that is
 *   inconclusive, not foreign, and caches predating the `name` field must stay usable.
 */
export async function inspectSlot(source: KBSource, fs: FileSystemService): Promise<SlotState> {
  const slotPath = getSourceCachePath(source)
  if (!fs.existsSync(slotPath)) return { status: 'empty' }

  const expected = expectedManifestName(source)
  if (!expected) return { status: 'ready' }

  const manifest = await readManifest(slotPath, fs)
  if (!manifest.present) return { status: 'empty' }
  if (manifest.name === null || manifest.name === expected) return { status: 'ready' }
  return { status: 'contaminated', expected, found: manifest.name }
}

/** Removes a slot entirely, so foreign or stale files cannot survive a re-install. */
export async function purgeSlot(source: KBSource, fs: FileSystemService): Promise<void> {
  await fs.rm(getSourceCachePath(source), { recursive: true, force: true })
}

/**
 * True when the official KB for `version` is cached AND not contaminated (AC3/AC5).
 *
 * DIAGNOSTIC PREDICATE, not a gate: its only production caller (`config/kb-resolver.ts`)
 * uses it to decide whether to print a `[diag]` line, then calls `ensureKBAvailable`
 * unconditionally. Serving a contaminated slot is prevented by `ensureKBAvailable`'s own
 * `inspectSlot` call, not by this function — which is why this one may safely swallow
 * errors and return false.
 */
export async function isKBCached(version: string, fs: FileSystemService): Promise<boolean> {
  try {
    const state = await inspectSlot(officialSource(version), fs)
    return state.status === 'ready'
  } catch {
    return false
  }
}

export async function ensureCacheDirectory(
  cachePath: string,
  fs: FileSystemService,
): Promise<void> {
  await fs.mkdir(cachePath, { recursive: true })
}

const BACKUP_SUFFIX = '.bak'

/**
 * Sets a slot aside before it is rewritten, so a failed install can put it back. Returns
 * false when there was nothing to set aside.
 */
export async function backupCachedKB(source: KBSource, fs: FileSystemService): Promise<boolean> {
  const cachePath = getSourceCachePath(source)
  if (fs.existsSync(cachePath)) {
    await fs.rm(cachePath + BACKUP_SUFFIX, { recursive: true, force: true })
    await fs.rename(cachePath, cachePath + BACKUP_SUFFIX)
    return true
  }
  return false
}

/**
 * Puts the set-aside slot back after a failed install. Two properties, both of them the
 * same rule as `removeBackupKB` — a cleanup must neither undo nor speak over the work it
 * follows — applied to the other half of the sequence:
 *
 * - **rename-first, delete afterwards.** Deleting the half-written slot first and only then
 *   renaming the backup back means a failing recursive delete (EBUSY/EPERM on a just-written
 *   tree) leaves BOTH the `.bak` and the half-written slot on disk — and the next install's
 *   `backupCachedKB` deletes that `.bak` to make room, so a second failure hands the user
 *   the half-written slot and no backup at all. The invariant is the opposite: a failing
 *   re-fetch must leave the user with the cache they had, not with none.
 * - **BEST-EFFORT by contract.** Both call sites run this inside a `catch` whose error is
 *   the one the user needs ("Network error downloading KB… check connectivity", a 404 with
 *   the manual-download URL). A throw here would replace that diagnosis with an unrelated fs
 *   message, so the failure is logged and swallowed and the ORIGINAL error is rethrown.
 *   Callers therefore never need a try/catch of their own — the rule lives in one place.
 *
 * Best-effort is not the same as silent, and the difference is the whole invariant. When the
 * rename back cannot be made to work, the user's only good copy is at `<slot>.bak` — a name
 * nothing points them at — while the slot itself is gone: indistinguishable, from their side,
 * from having lost the cache. So the give-up path is a **warning naming the recoverable copy
 * and where to move it**, not a debug line, and it is only reached after the old order
 * (delete the half-written slot outright, then retry) has been tried too, so a transient hold
 * on the set-aside rename is not terminal.
 */
export async function restoreCachedKB(source: KBSource, fs: FileSystemService): Promise<void> {
  const cachePath = getSourceCachePath(source)
  const backupPath = cachePath + BACKUP_SUFFIX
  if (!fs.existsSync(backupPath)) return

  let setAside: string | null = null
  try {
    if (fs.existsSync(cachePath)) {
      setAside = supersededPath(cachePath)
      await fs.rename(cachePath, setAside)
    }
    await fs.rename(backupPath, cachePath)
  } catch (err) {
    try {
      // Second chance in the OLD order: whatever is still occupying the slot is deleted
      // outright and the rename retried once. A recursive delete and a rename fail on
      // different things (a held handle on one tree vs. the other), so the retry is not a
      // repeat of the same attempt.
      await fs.rm(cachePath, { recursive: true, force: true })
      await fs.rename(backupPath, cachePath)
    } catch {
      log.warn(
        `Could not restore the previous KB cache (${String(err)}). Your previous copy is ` +
          `kept at ${backupPath} — move it back to ${cachePath} to recover it.`,
      )
      return
    }
  }

  if (setAside) await discard(setAside, fs)
}

/**
 * Name for a copy this module is about to replace. Monotonic within the process on top of
 * the timestamp: `Date.now()` alone is millisecond-resolution, so two restores of the same
 * source in one millisecond collided on the rename and both took the give-up path. (Two
 * concurrent PROCESSES on one source remain out of scope — #428.)
 */
let supersededCount = 0
function supersededPath(cachePath: string): string {
  return `${cachePath}.discarded-${Date.now().toString(36)}-${(supersededCount++).toString(36)}`
}

/** Deletes a directory this module has already replaced; a leftover copy is inert. */
async function discard(path: string, fs: FileSystemService): Promise<void> {
  try {
    await fs.rm(path, { recursive: true, force: true })
  } catch (err) {
    log.debug(`Could not remove the superseded KB cache at ${path}: ${String(err)}`)
  }
}

/**
 * Discards the set-aside slot once the install that replaced it has SUCCEEDED. BEST-EFFORT
 * by contract, for two reasons that both end in "a cleanup must not undo the work it is
 * cleaning up after":
 *
 * - `force` — the `existsSync` guard is check-then-act, and a concurrent install of the
 *   same source (#428) can delete the `.bak` in between; without `force`, `rm` then throws
 *   ENOENT for a state that is exactly what this function wanted.
 * - the catch — a leftover `.bak` is inert (the next `backupCachedKB` overwrites it),
 *   while a throw here propagates into the caller's failure path, which RESTORES the
 *   backup: the KB just installed correctly would be deleted and the previous slot — a
 *   contaminated one, in the AC5 self-heal — put back, over an unrelated fs error
 *   (EPERM/EBUSY from an antivirus handle on a just-renamed tree, on Windows).
 */
export async function removeBackupKB(source: KBSource, fs: FileSystemService): Promise<void> {
  const cachePath = getSourceCachePath(source)
  const backupPath = cachePath + BACKUP_SUFFIX
  if (!fs.existsSync(backupPath)) return
  await discard(backupPath, fs)
}

/** `<slot>.tmp-<pid>-<n>`: the pid is what the orphan sweep interrogates; the counter keeps two stages of one slot in one process apart. */
const STAGE_INFIX = '.tmp-'
let stageCount = 0
function stagePathFor(slotPath: string): string {
  return `${slotPath}${STAGE_INFIX}${process.pid}-${(stageCount++).toString(36)}`
}

/**
 * True when `pid` is a running process. Signal 0 performs the permission check without
 * sending anything; EPERM means the process exists but belongs to someone else — alive
 * for our purposes. Any other failure (ESRCH, ERANGE) means no such process.
 */
function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === 'EPERM'
  }
}

/**
 * Removes stages of THIS slot left by processes that no longer exist (an interrupted
 * extraction, #428 AC). A live process's stage is a concurrent install in flight, not an
 * orphan — deleting it would yank the directory out from under a running extraction.
 */
async function sweepOrphanedStages(slotPath: string, fs: FileSystemService): Promise<void> {
  const parent = dirname(slotPath)
  if (!fs.existsSync(parent)) return
  const prefix = `${basename(slotPath)}${STAGE_INFIX}`
  for (const entry of await fs.readdir(parent)) {
    if (!entry.name.startsWith(prefix)) continue
    const pid = Number.parseInt(entry.name.slice(prefix.length), 10)
    if (Number.isNaN(pid) || !isProcessAlive(pid)) {
      await discard(join(parent, entry.name), fs)
    }
  }
}

/**
 * Populates a slot ATOMICALLY (US-395/#428): `populate` writes into a `<slot>.tmp-<pid>-<n>`
 * stage next to the slot (same filesystem, so the swap is a single `rename`), and the slot
 * is renamed into existence only once the stage is COMPLETE. A concurrent reader therefore
 * sees the slot either absent (⇒ re-fetch) or whole — never half-written, which is what the
 * earlier purge-then-extract-in-place sequence exposed to every other process on the machine.
 *
 * - Orphaned stages from DEAD processes are swept first; a live process's stage is left
 *   alone (see `sweepOrphanedStages`).
 * - A failing `populate` removes its own stage and rethrows the ORIGINAL error: nothing new
 *   exists, nothing old was touched.
 * - An occupied slot is replaced WHOLE at swap time. `rename` onto a non-empty directory
 *   fails (ENOTEMPTY), so the swap deletes the occupant and retries once — the loser of a
 *   same-slot race supersedes the winner's identical content instead of merging with it.
 */
export async function writeSlotAtomically(
  slotPath: string,
  fs: FileSystemService,
  populate: (stagePath: string) => Promise<void>,
): Promise<string> {
  await sweepOrphanedStages(slotPath, fs)

  const stage = stagePathFor(slotPath)
  await fs.mkdir(stage, { recursive: true })
  try {
    await populate(stage)
    await swapStageOntoSlot(stage, slotPath, fs)
  } catch (err) {
    await discard(stage, fs)
    throw err
  }
  return slotPath
}

/** The atomic swap: delete-then-rename only when the plain rename cannot win. */
async function swapStageOntoSlot(
  stage: string,
  slotPath: string,
  fs: FileSystemService,
): Promise<void> {
  if (fs.existsSync(slotPath)) await fs.rm(slotPath, { recursive: true, force: true })
  try {
    await fs.rename(stage, slotPath)
  } catch {
    // Lost a race: another process re-created the slot between the rm and the rename
    // (ENOTEMPTY/EEXIST/EPERM depending on platform). Its content is the same source's —
    // slots are content/identity-keyed — but a merge is still not a swap, so replace whole.
    await fs.rm(slotPath, { recursive: true, force: true })
    await fs.rename(stage, slotPath)
  }
}

export default {
  inspectSlot,
  purgeSlot,
  isKBCached,
  ensureCacheDirectory,
  backupCachedKB,
  restoreCachedKB,
  removeBackupKB,
  writeSlotAtomically,
}
