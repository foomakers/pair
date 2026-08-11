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

/**
 * Identity of a KB source that OWNS a cache slot. A local directory is deliberately not
 * here: it is used in place, never copied into the cache (see `LocalKBSource`), so it has
 * no identity to key a slot with.
 */
export type KBSource =
  | { kind: 'official'; version: string }
  | { kind: 'remote'; url: string }
  | { kind: 'git'; url: string }
  | { kind: 'zip'; path: string }

/**
 * A `--source` path on this machine, classified. A ZIP is extracted into its own slot
 * (hence it is also a `KBSource`); a DIRECTORY is read in place — the CLI never copies it
 * into the cache, so it owns no slot and edits to it are picked up by the next install.
 */
export type LocalKBSource = { kind: 'zip'; path: string } | { kind: 'directory'; path: string }

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

/** `/`, `C:\`, `\\` — a root has nothing to strip; `''` is not a path. */
const ROOT_LIKE = /^([\\/]+|[a-zA-Z]:[\\/]*)$/

function stripTrailingSeparator(path: string): string {
  if (ROOT_LIKE.test(path)) return path
  return path.replace(/[\\/]+$/, '') || path
}

/**
 * ONE filesystem location must map to ONE slot: `/kb/acme.zip`, `/kb/./acme.zip` and
 * `/kb/../kb/acme.zip` are the same file, and `--source /kb/` is the same directory as
 * `--source /kb`. Without canonicalization each spelling hashes to its own slot — a full
 * extra copy of the KB on disk and a needless re-extract. Normalized with the rules of
 * whichever convention called the path absolute, so a Windows path is not mangled by the
 * POSIX normalizer. (Distinct from #429, which is path-vs-content identity: two different
 * paths to the same bytes stay two slots, deliberately.)
 */
function canonicalize(path: string): string {
  const normalized = posix.isAbsolute(path) ? posix.normalize(path) : win32.normalize(path)
  return stripTrailingSeparator(normalized)
}

/**
 * Resolves a source path against the INJECTED cwd, so the caller that installs and the
 * caller that inspects the cache always derive the same slot for the same source.
 */
export function resolveSourcePath(rawPath: string, fs: FileSystemService): string {
  if (isAbsolutePath(rawPath)) return canonicalize(rawPath)
  // `join` normalizes as a side effect but keeps a trailing separator.
  return stripTrailingSeparator(join(fs.currentWorkingDirectory(), rawPath))
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
  }
}

/**
 * Root of the KB cache: `~/.pair/kb`, or `PAIR_KB_CACHE_DIR` when set.
 *
 * The override must be ABSOLUTE and must not climb with `..`, and that is enforced here
 * rather than documented: this value prefixes every slot path, and `purgeSlot` deletes a
 * slot with `rm -rf`. `PAIR_KB_CACHE_DIR=.cache/kb` would resolve slots against the
 * process cwd, so `pair install --source x.zip` run inside a repository would create and
 * then recursively delete directories inside that repository.
 */
export function getCacheRoot(): string {
  const override = process.env['PAIR_KB_CACHE_DIR']?.trim()
  if (!override) return join(homedir(), '.pair', 'kb')
  if (!isAbsolutePath(override)) {
    throw new Error(
      `PAIR_KB_CACHE_DIR must be an absolute path (got "${override}") — cache slots are deleted recursively and must never resolve against the current directory`,
    )
  }
  if (hasParentSegment(override)) {
    throw new Error(`PAIR_KB_CACHE_DIR must not contain ".." segments (got "${override}")`)
  }
  return override
}

/** True when any segment of the path is `..` (either separator convention). */
function hasParentSegment(path: string): boolean {
  return path.split(/[\\/]+/).includes('..')
}

/**
 * Absolute path of a cache slot from its key (the official KB's key is its version).
 * An empty key would resolve to the cache ROOT, and a `..` segment would resolve OUTSIDE
 * it — both are then deleted by `purgeSlot`, so both are rejected rather than normalized
 * away. Guarding here covers every key producer, including the official version segment
 * (today the CLI's own package version, tomorrow whatever calls this).
 */
export function getCachedKBPath(key: string): string {
  const slot = key.trim()
  if (!slot) throw new Error('Cache slot key must not be empty (it would target the cache root)')
  if (hasParentSegment(slot)) {
    throw new Error(`Cache slot key must not escape the cache root with ".." (got "${key}")`)
  }
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
