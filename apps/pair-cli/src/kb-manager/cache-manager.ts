import { basename, join } from 'path'
import { homedir } from 'os'
import { createHash } from 'crypto'
import type { FileSystemService } from '@pair/content-ops'
import { gitCacheKey } from './git-clone'

/**
 * Cache slots are keyed by SOURCE IDENTITY, not by CLI version (US-395).
 *
 * Keying by CLI version alone assumed one KB per machine: `install --source <zip>`
 * then extracted an external KB into `~/.pair/kb/<cliVersion>/` — the OFFICIAL KB's
 * slot — rewriting its manifest and contaminating every other project on the machine.
 *
 * Layout:
 *   ~/.pair/kb/<version>/                  official KB only
 *   ~/.pair/kb/external/<kind>-<label>-<hash>/   one slot per external source
 *
 * Disk: one slot per distinct external source. Slots are plain directories with no
 * hidden state — `rm -rf ~/.pair/kb/external` is always safe and the next install
 * re-populates. Automatic eviction is deliberately out of scope (see the US-395 ADL).
 */

/** `name` carried by the manifest.json of the KB published by this project. */
export const OFFICIAL_KB_NAME = 'knowledge-base'

/** Directory under `~/.pair/kb/` that holds every non-official source's slot. */
export const EXTERNAL_NAMESPACE = 'external'

/** Identity of the KB source a cache slot belongs to. */
export type KBSource =
  | { kind: 'official'; version: string }
  | { kind: 'remote'; url: string }
  | { kind: 'git'; url: string }
  | { kind: 'zip'; path: string }
  | { kind: 'directory'; path: string }

/** State of a cache slot relative to the source that is supposed to own it. */
export type SlotState =
  | { status: 'empty' }
  | { status: 'ready' }
  | { status: 'contaminated'; expected: string; found: string }

export function officialSource(version: string): KBSource {
  return { kind: 'official', version }
}

/**
 * Resolves a source path against the INJECTED cwd, so the caller that installs and the
 * caller that inspects the cache always derive the same slot for the same source.
 */
export function resolveSourcePath(rawPath: string, fs: FileSystemService): string {
  return rawPath.startsWith('/') ? rawPath : join(fs.currentWorkingDirectory(), rawPath)
}

/** Identity of a local source, classified by extension (ZIP vs directory). */
export function localKBSource(rawPath: string, fs: FileSystemService): KBSource {
  const path = resolveSourcePath(rawPath, fs)
  return path.toLowerCase().endsWith('.zip') ? { kind: 'zip', path } : { kind: 'directory', path }
}

function cleanVersion(version: string): string {
  return version.startsWith('v') ? version.slice(1) : version
}

function shortHash(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 12)
}

/** Filesystem-safe, human-readable fragment used to make a slot recognizable. */
function label(value: string): string {
  const cleaned = value
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '')
  return (cleaned || 'kb').slice(0, 32)
}

function labelFromPath(path: string): string {
  return label(basename(path).replace(/\.zip$/i, ''))
}

function labelFromUrl(url: string): string {
  const withoutQuery = url.split(/[?#]/)[0] ?? url
  const lastSegment = withoutQuery.split('/').filter(Boolean).pop() ?? url
  return label(lastSegment.replace(/\.zip$/i, ''))
}

/**
 * Cache slot key for a source. Two different sources can never produce the same key,
 * and the same source always produces the same key (AC4).
 */
export function cacheSlotKey(source: KBSource): string {
  switch (source.kind) {
    case 'official':
      return cleanVersion(source.version)
    case 'git':
      // Reuses the git key already used for clone caching (`git-<hash of url#ref>`).
      return `${EXTERNAL_NAMESPACE}/${gitCacheKey(source.url)}`
    case 'remote':
      return `${EXTERNAL_NAMESPACE}/url-${labelFromUrl(source.url)}-${shortHash(`remote:${source.url}`)}`
    case 'zip':
      return `${EXTERNAL_NAMESPACE}/zip-${labelFromPath(source.path)}-${shortHash(`zip:${source.path}`)}`
    case 'directory':
      return `${EXTERNAL_NAMESPACE}/dir-${labelFromPath(source.path)}-${shortHash(`dir:${source.path}`)}`
  }
}

/** Absolute path of a cache slot from its key (the official KB's key is its version). */
export function getCachedKBPath(key: string): string {
  return join(homedir(), '.pair', 'kb', cleanVersion(key))
}

/** Absolute path of the cache slot owned by a source. */
export function getSourceCachePath(source: KBSource): string {
  return getCachedKBPath(cacheSlotKey(source))
}

/** Manifest `name` a slot must carry to be trusted, or null when the source declares none. */
function expectedManifestName(source: KBSource): string | null {
  return source.kind === 'official' ? OFFICIAL_KB_NAME : null
}

async function readManifestName(slotPath: string, fs: FileSystemService): Promise<string | null> {
  const manifestPath = join(slotPath, 'manifest.json')
  if (!fs.existsSync(manifestPath)) return null
  try {
    const parsed = JSON.parse(await fs.readFile(manifestPath)) as { name?: unknown }
    return typeof parsed.name === 'string' ? parsed.name : null
  } catch {
    return null
  }
}

/**
 * Whether a slot holds what its source claims (AC5). A slot whose manifest names a
 * DIFFERENT KB is contaminated — the caller must purge and re-fetch instead of serving
 * foreign content. A missing/unreadable/nameless manifest is inconclusive, not foreign:
 * caches written before the manifest contract stay usable.
 */
export async function inspectSlot(source: KBSource, fs: FileSystemService): Promise<SlotState> {
  const slotPath = getSourceCachePath(source)
  if (!fs.existsSync(slotPath)) return { status: 'empty' }

  const expected = expectedManifestName(source)
  if (!expected) return { status: 'ready' }

  const found = await readManifestName(slotPath, fs)
  if (found === null || found === expected) return { status: 'ready' }
  return { status: 'contaminated', expected, found }
}

/** Removes a slot entirely, so foreign or stale files cannot survive a re-install. */
export async function purgeSlot(source: KBSource, fs: FileSystemService): Promise<void> {
  await fs.rm(getSourceCachePath(source), { recursive: true, force: true })
}

/** True when the official KB for `version` is cached AND not contaminated (AC3/AC5). */
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

export async function backupCachedKB(source: KBSource, fs: FileSystemService): Promise<boolean> {
  const cachePath = getSourceCachePath(source)
  if (fs.existsSync(cachePath)) {
    await fs.rename(cachePath, cachePath + BACKUP_SUFFIX)
    return true
  }
  return false
}

export async function restoreCachedKB(source: KBSource, fs: FileSystemService): Promise<void> {
  const cachePath = getSourceCachePath(source)
  const backupPath = cachePath + BACKUP_SUFFIX
  if (fs.existsSync(backupPath)) {
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
  getSourceCachePath,
  cacheSlotKey,
  localKBSource,
  resolveSourcePath,
  officialSource,
  inspectSlot,
  purgeSlot,
  isKBCached,
  ensureCacheDirectory,
  backupCachedKB,
  restoreCachedKB,
  removeBackupKB,
}
