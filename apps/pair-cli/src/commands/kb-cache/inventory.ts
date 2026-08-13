import { join } from 'path'
import type { FileSystemService } from '@pair/content-ops'
import { getCacheRoot } from '../../kb-manager/cache-slot-key'

/**
 * What a cache entry IS, from its name alone.
 *
 * The layout is `<cacheRoot>/<version>/` for the official KB and
 * `<cacheRoot>/external/<kind>-…/` for everything else, so the name is the only evidence
 * available without reading each slot — and the classification decides what `prune` may
 * delete. Deliberately conservative: anything unrecognised is `unknown` and is never pruned.
 */
export type EntryKind =
  /** `<cacheRoot>/<version>/` — the official KB for a CLI version. */
  | 'official'
  /** `<cacheRoot>/external/<kind>-<hash>/` — one per distinct external source (#395). */
  | 'external'
  /** `<slot>.bak` — an interrupted install's backup. */
  | 'backup'
  /** `<slot>.tmp-<pid>-<n>` — an atomic stage abandoned by an interrupted run (#428). */
  | 'stage'
  /** `<cacheRoot>/git-<hash>/` at the ROOT — a pre-#395 clone, before slots were keyed. */
  | 'legacy-git'
  | 'unknown'

export interface CacheEntry {
  path: string
  name: string
  kind: EntryKind
  /** Bytes, summed over the tree. */
  size: number
  /** From the slot's own `manifest.json` when it has one — otherwise undefined. */
  label?: string
  /** Why `prune` would remove it, or undefined when it would keep it. */
  staleReason?: string
}

const STAGE_RE = /\.tmp-\d+-\d+$/
const LEGACY_GIT_RE = /^git-[0-9a-f]+$/i

export function classifyEntry(name: string, atRoot: boolean): EntryKind {
  if (STAGE_RE.test(name)) return 'stage'
  if (name.endsWith('.bak')) return 'backup'
  if (!atRoot) return 'external'
  if (name === 'external') return 'unknown' // the container itself, never an entry
  if (LEGACY_GIT_RE.test(name)) return 'legacy-git'
  // A version-shaped directory is the official slot for that CLI version.
  if (/^\d+\.\d+\.\d+/.test(name)) return 'official'
  return 'unknown'
}

/**
 * Which entries `prune` removes, and the reason shown to the operator.
 *
 * `currentVersion` is spared: it is the KB this CLI is about to use. Every other official
 * slot belongs to a version no longer installed. External slots are NEVER pruned — one per
 * source the user chose, and nothing here can tell which sources they still care about.
 */
export function stalenessOf(entry: CacheEntry, currentVersion: string): string | undefined {
  switch (entry.kind) {
    case 'stage':
      return 'abandoned atomic stage from an interrupted install'
    case 'backup':
      return 'backup left by an interrupted install'
    case 'legacy-git':
      return 'pre-#395 git clone, superseded by external/git-<hash>'
    case 'official':
      // No current version resolved (the dispatcher could not supply one) ⇒ spare EVERY
      // official slot. Comparing against an empty string would mark them all prunable —
      // including the KB this CLI is about to use — which is the one deletion that turns a
      // cleanup command into an outage.
      if (!currentVersion) return undefined
      return entry.name === currentVersion ? undefined : `official KB for CLI ${entry.name}`
    default:
      return undefined
  }
}

async function treeSize(fs: FileSystemService, path: string): Promise<number> {
  let total = 0
  const entries = await fs.readdir(path).catch(() => [])
  for (const e of entries) {
    const child = join(path, e.name)
    if (e.isDirectory?.()) total += await treeSize(fs, child)
    else
      total +=
        (await fs
          .stat?.(child)
          .then(s => s.size ?? 0)
          .catch(() => 0)) ?? 0
  }
  return total
}

async function labelOf(fs: FileSystemService, slot: string): Promise<string | undefined> {
  const raw = await fs.readFile(join(slot, 'manifest.json')).catch(() => undefined)
  if (!raw) return undefined
  try {
    const m = JSON.parse(raw) as { name?: string; version?: string }
    return [m.name, m.version].filter(Boolean).join(' ') || undefined
  } catch {
    return undefined
  }
}

/** Every entry under the cache root, root level and `external/` alike. */
export async function readCacheInventory(
  fs: FileSystemService,
  currentVersion: string,
): Promise<CacheEntry[]> {
  const root = getCacheRoot()
  const out: CacheEntry[] = []

  const walk = async (dir: string, atRoot: boolean): Promise<void> => {
    for (const e of await fs.readdir(dir)) {
      const path = join(dir, e.name)
      const kind = classifyEntry(e.name, atRoot)
      if (atRoot && e.name === 'external') {
        await walk(path, false)
        continue
      }
      const entry: CacheEntry = {
        path,
        name: e.name,
        kind,
        size: await treeSize(fs, path),
      }
      const label = await labelOf(fs, path)
      if (label) entry.label = label
      const reason = stalenessOf(entry, currentVersion)
      if (reason) entry.staleReason = reason
      out.push(entry)
    }
  }

  // A cache that has never been written is empty, not an error. Anything else — an unreadable
  // directory, a permissions failure — must surface: swallowing it would render a full-but-
  // unreadable cache as "The KB cache is empty", and prune would report nothing to reclaim.
  if (!(await fs.exists(root))) return []

  await walk(root, true)
  return out.sort((a, b) => a.path.localeCompare(b.path))
}
