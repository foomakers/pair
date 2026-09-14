import { isAbsolute, join, posix, win32 } from 'path'
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
 *   <cacheRoot>/<version>/                        official KB only
 *   <cacheRoot>/external/url-<label>-<hash12>/    one slot per remote-URL source
 *   <cacheRoot>/external/git-<hash>/              one slot per git url#ref
 *   <cacheRoot>/external/zip-<contentHash12>/     one slot per local-ZIP CONTENT (#429)
 *
 * Disk: one slot per distinct external source. Slots are plain directories with no
 * hidden state — `rm -rf <cacheRoot>/external` is always safe and the next install
 * re-populates. Automatic eviction is deliberately not implemented (no LRU/TTL); the
 * explicit `pair-cli kb-cache list` / `prune` reclaims the stale leftovers instead — old CLI
 * versions, pre-#395 git clones, and abandoned `.bak`/`.tmp-*` — sparing every `external/`
 * slot and anything an install in flight owns (`commands/kb-cache/inventory.ts`).
 * `.discarded-*` is left to the user. See the US-395 ADL and the source-resolution spec.
 */

/** `name` carried by the manifest.json of the KB published by this project. */
export const OFFICIAL_KB_NAME = 'knowledge-base'

/**
 * Directory under the cache root that holds every non-official source's slot. Module-private:
 * nothing outside derives a slot path by hand (that is what `getSourceCachePath` is for), and
 * the tests assert the literal `external/` layout a user sees on disk.
 */
const EXTERNAL_NAMESPACE = 'external'

/**
 * Identity of a KB source that OWNS a cache slot. A local directory is deliberately not
 * here: it is used in place, never copied into the cache (see `LocalKBSource`), so it has
 * no identity to key a slot with.
 */
export type KBSource =
  | { kind: 'official'; version: string }
  | { kind: 'remote'; url: string }
  | { kind: 'git'; url: string }
  /**
   * A local ZIP's identity is its CONTENT — `contentHash` is the lowercase-hex sha256
   * of the archive's bytes, produced ONLY by `zipKBSource` (byte-mode read, #429). The
   * path is kept for messages and for the extraction source, never for the slot key.
   */
  | { kind: 'zip'; path: string; contentHash: string }

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
 * Absolute under EITHER convention, for a SOURCE path only — `path.isAbsolute` follows the
 * host platform, so on POSIX it calls `C:\kb\acme.zip` relative and the caller would join
 * it onto the cwd, producing a bogus path and a bogus slot.
 *
 * Deliberately NOT used for the cache root: there the dual check is backwards. Accepting a
 * foreign-convention path as a source only stops a join; accepting it as the ROOT means
 * `join('C:\\cache\\kb', '0.4.3')` — a relative path on POSIX — prefixes every slot. See
 * `getCacheRoot`, which uses the host's own `isAbsolute`.
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
 * `--source /kb`. Without canonicalization each spelling of a URL-less source resolves
 * to its own location. Normalized with the rules of whichever convention called the path
 * absolute, so a Windows path is not mangled by the POSIX normalizer. (A ZIP's slot no
 * longer depends on its path at all — content-keyed since #429 — but the canonical path
 * is still what error messages name and what the extractor reads.)
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

/**
 * Filesystem-safe, human-readable fragment used to make a slot recognizable. The trailing
 * separators are stripped AFTER the truncation as well: cutting at 32 characters can land
 * on a `-` or `.` and produce `zip-some-long-label--<hash>`, which defeats the only reason
 * the label exists (a user reading `~/.pair/kb/external/` should recognize the slot).
 */
function label(value: string): string {
  const cleaned = value
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '')
  return cleaned.slice(0, 32).replace(/[-.]+$/, '') || 'kb'
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
      // CONTENT-keyed (#429): the same archive at two paths is ONE slot, and two
      // archives with different bytes can never share one. No path-derived label —
      // a label would re-smuggle the path into the identity; a slot's own
      // `manifest.json` is what names it, when it has one.
      return `${EXTERNAL_NAMESPACE}/zip-${source.contentHash.slice(0, 12)}`
  }
}

/**
 * Name of the temporary file a download is STAGED into before it is extracted — keyed by
 * the source URL, like every slot in this module, and never by the CLI version alone.
 *
 * `installKB` serves the official release AND `--url <remote zip>`, so a version-keyed
 * staging file is shared by two different sources at the same CLI version. That is not only
 * a concurrency window: `resume-manager.shouldResume()` decides to resume from the
 * existence and SIZE of `<staging>.partial` alone, with no binding to the URL that produced
 * those bytes, then issues `Range: bytes=<n>-` against the NEW url. Interrupt an official
 * download and run `pair-cli install --url https://acme…/kb.zip` at the same version, and the
 * acme body is appended to the official KB's bytes and finalized as one archive.
 *
 * The version stays in the name because it is what makes a stray file in the temp directory
 * recognizable; the hash is what makes it unique.
 */
export function downloadStagingName(version: string, downloadUrl: string): string {
  return `kb-${cleanVersion(version)}-${shortHash(`download:${downloadUrl}`)}.zip`
}

/**
 * Root of the KB cache: `~/.pair/kb`, or `PAIR_KB_CACHE_DIR` when set.
 *
 * The override must be ABSOLUTE and must not climb with `..`, and that is enforced here
 * rather than documented: this value prefixes every slot path, and `purgeSlot` deletes a
 * slot with `rm -rf`. `PAIR_KB_CACHE_DIR=.cache/kb` would resolve slots against the
 * process cwd, so `pair-cli install --source x.zip` run inside a repository would create and
 * then recursively delete directories inside that repository.
 *
 * Absolute is judged by the HOST convention (`path.isAbsolute`), not by "either
 * convention" the way a source path is: on POSIX, `C:\cache\kb` is a relative NAME, so
 * `join` would produce `C:\cache\kb/0.4.3` and reopen exactly the hole above under a
 * different spelling.
 */
export function getCacheRoot(): string {
  const override = process.env['PAIR_KB_CACHE_DIR']?.trim()
  if (!override) return join(homedir(), '.pair', 'kb')
  if (!isAbsolute(override)) {
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
 * An empty key would resolve to the cache ROOT, a `..` segment OUTSIDE it, and the bare
 * `external` namespace to the PARENT of every external slot — each is then deleted by
 * `purgeSlot`, so each is rejected rather than normalized away. Guarding here covers every
 * key producer, including the official version segment (today the CLI's own package
 * version, tomorrow whatever calls this).
 */
export function getCachedKBPath(key: string): string {
  const slot = key.trim()
  if (!slot) throw new Error('Cache slot key must not be empty (it would target the cache root)')
  if (hasParentSegment(slot)) {
    throw new Error(`Cache slot key must not escape the cache root with ".." (got "${key}")`)
  }
  if (isNamespaceItself(slot)) {
    throw new Error(
      `Cache slot key must not be the "${EXTERNAL_NAMESPACE}" namespace itself (got "${key}") — that directory holds every external slot`,
    )
  }
  return join(getCacheRoot(), slot)
}

/** True when the key names the external namespace DIRECTORY rather than a slot inside it. */
function isNamespaceItself(slot: string): boolean {
  const segments = slot.split(/[\\/]+/).filter(Boolean)
  return segments.length === 1 && segments[0] === EXTERNAL_NAMESPACE
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
  downloadStagingName,
  getCacheRoot,
  getCachedKBPath,
  getSourceCachePath,
  expectedManifestName,
}
