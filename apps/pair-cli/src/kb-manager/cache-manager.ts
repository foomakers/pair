import { join } from 'path'
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
 */
export async function restoreCachedKB(source: KBSource, fs: FileSystemService): Promise<void> {
  const cachePath = getSourceCachePath(source)
  const backupPath = cachePath + BACKUP_SUFFIX
  if (!fs.existsSync(backupPath)) return

  try {
    let discarded: string | null = null
    if (fs.existsSync(cachePath)) {
      discarded = `${cachePath}.discarded-${Date.now().toString(36)}`
      await fs.rename(cachePath, discarded)
    }

    await fs.rename(backupPath, cachePath)

    if (discarded) await discard(discarded, fs)
  } catch (err) {
    log.debug(`Could not restore the previous KB cache at ${cachePath}: ${String(err)}`)
  }
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

export default {
  inspectSlot,
  purgeSlot,
  isKBCached,
  ensureCacheDirectory,
  backupCachedKB,
  restoreCachedKB,
  removeBackupKB,
}
