import { join } from 'path'
import type { FileSystemService } from '@pair/content-ops'
import {
  expectedManifestName,
  getCachedKBPath,
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

export async function restoreCachedKB(source: KBSource, fs: FileSystemService): Promise<void> {
  const cachePath = getSourceCachePath(source)
  const backupPath = cachePath + BACKUP_SUFFIX
  if (fs.existsSync(backupPath)) {
    await fs.rm(cachePath, { recursive: true, force: true })
    await fs.rename(backupPath, cachePath)
  }
}

export async function removeBackupKB(source: KBSource, fs: FileSystemService): Promise<void> {
  const cachePath = getSourceCachePath(source)
  const backupPath = cachePath + BACKUP_SUFFIX
  if (fs.existsSync(backupPath)) {
    await fs.rm(backupPath, { recursive: true })
  }
}

export default {
  getCachedKBPath,
  inspectSlot,
  purgeSlot,
  isKBCached,
  ensureCacheDirectory,
  backupCachedKB,
  restoreCachedKB,
  removeBackupKB,
}
