import { basename, join, posix, win32 } from 'path'
import { homedir } from 'os'
import { createHash } from 'crypto'
import type { FileSystemService } from '@pair/content-ops'
import { gitCacheKey } from './git-clone'

/**
 * SOURCE IDENTITY → CACHE SLOT KEY. Pure derivation, no filesystem access: this module
 * answers "which directory does this source own", never "what is inside it" (that is
 * `cache-manager.ts`, the slot lifecycle).
 *
 * Cache slots are keyed by source identity, not by CLI version (US-395). Keying by CLI
 * version alone assumed one KB per machine: `install --source <zip>` then extracted an
 * external KB into `~/.pair/kb/<cliVersion>/` — the OFFICIAL KB's slot — rewriting its
 * manifest and contaminating every other project on the machine.
 *
 * Layout:
 *   <cacheRoot>/<version>/                  official KB only
 *   <cacheRoot>/external/<kind>-<label>-<hash>/   one slot per external source
 *
 * Disk: one slot per distinct external source. Slots are plain directories with no
 * hidden state — `rm -rf <cacheRoot>/external` is always safe and the next install
 * re-populates. Automatic eviction is deliberately out of scope (see the US-395 ADL).
 */

/** `name` carried by the manifest.json of the KB published by this project. */
export const OFFICIAL_KB_NAME = 'knowledge-base'

/** Directory under the cache root that holds every non-official source's slot. */
export const EXTERNAL_NAMESPACE = 'external'

/** Identity of the KB source a cache slot belongs to. */
export type KBSource =
  | { kind: 'official'; version: string }
  | { kind: 'remote'; url: string }
  | { kind: 'git'; url: string }
  | { kind: 'zip'; path: string }
  | { kind: 'directory'; path: string }

/** A source that lives on this machine's filesystem (the two forms `--source` accepts). */
export type LocalKBSource = Extract<KBSource, { kind: 'zip' | 'directory' }>

export function officialSource(version: string): KBSource {
  return { kind: 'official', version }
}

/**
 * Absolute under EITHER convention — `path.isAbsolute` follows the host platform, so on
 * POSIX it calls `C:\kb\acme.zip` relative and the caller would join it onto the cwd,
 * producing a bogus path and a bogus slot.
 */
function isAbsolutePath(rawPath: string): boolean {
  return posix.isAbsolute(rawPath) || win32.isAbsolute(rawPath)
}

/**
 * Resolves a source path against the INJECTED cwd, so the caller that installs and the
 * caller that inspects the cache always derive the same slot for the same source.
 */
export function resolveSourcePath(rawPath: string, fs: FileSystemService): string {
  return isAbsolutePath(rawPath) ? rawPath : join(fs.currentWorkingDirectory(), rawPath)
}

/**
 * Identity of a local source, classified by extension (ZIP vs directory). This is the
 * ONLY place a local path is classified: every caller dispatches on the resulting `kind`,
 * so the slot a source is given and the installer it is routed to can never disagree
 * (US-395 — `KB.ZIP` used to resolve as a zip slot and install as a directory).
 */
export function localKBSource(rawPath: string, fs: FileSystemService): LocalKBSource {
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
 * and the same source always produces the same key (AC4). Normalization of the official
 * version (`v0.2.0` → `0.2.0`) happens HERE and nowhere else — `getCachedKBPath` takes a
 * key, not a version.
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

/**
 * Root of the KB cache. `PAIR_KB_CACHE_DIR` (documented in the CLI configuration
 * reference) overrides it with an absolute path; otherwise `~/.pair/kb`.
 */
export function getCacheRoot(): string {
  const override = process.env['PAIR_KB_CACHE_DIR']?.trim()
  return override ? override : join(homedir(), '.pair', 'kb')
}

/**
 * Absolute path of a cache slot from its key (the official KB's key is its version).
 * An empty key would resolve to the cache ROOT, which `purgeSlot` would then delete —
 * so it is rejected rather than normalized away.
 */
export function getCachedKBPath(key: string): string {
  const slot = key.trim()
  if (!slot) throw new Error('Cache slot key must not be empty (it would target the cache root)')
  return join(getCacheRoot(), slot)
}

/** Absolute path of the cache slot owned by a source. */
export function getSourceCachePath(source: KBSource): string {
  return getCachedKBPath(cacheSlotKey(source))
}

/** Manifest `name` a slot must carry to be trusted, or null when the source declares none. */
export function expectedManifestName(source: KBSource): string | null {
  return source.kind === 'official' ? OFFICIAL_KB_NAME : null
}

export default {
  OFFICIAL_KB_NAME,
  officialSource,
  localKBSource,
  resolveSourcePath,
  cacheSlotKey,
  getCacheRoot,
  getCachedKBPath,
  getSourceCachePath,
  expectedManifestName,
}
