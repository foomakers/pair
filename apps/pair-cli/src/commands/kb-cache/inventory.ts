import { join } from 'path'
import type { FileSystemService } from '@pair/content-ops'
import { getCacheRoot, isStageOwnerAlive } from '#kb-manager'

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
  /**
   * Evidence that an install IN FLIGHT owns this entry, so nothing may delete it.
   *
   * The name alone cannot tell an abandoned leftover from a live one, and the cache is
   * machine-wide: project B's `prune` runs while project A's install is mid-extraction in
   * the same directory. Two shapes carry that evidence — a `stage` whose pid is still alive
   * (the same predicate `sweepOrphanedStages` uses), and a `.bak` whose slot is not back
   * yet, which means the install is either still running or crashed between the set-aside
   * and the swap. In both cases the `.bak` is the ONLY copy of that KB.
   */
  inFlight?: boolean
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
 *
 * `entry.inFlight` outranks the shape for the two kinds a running install owns (see the
 * field): a stage and a backup are garbage only once nothing is using them.
 */
export function stalenessOf(entry: CacheEntry, currentVersion: string): string | undefined {
  if (entry.inFlight) return undefined

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

/**
 * Does a running install own this entry? See `CacheEntry.inFlight`.
 *
 * The `.bak` rule is the conservative half: a backup whose slot is absent is the only copy
 * of that KB, whether the install is still running or died before the swap. Once the slot is
 * back the backup is redundant — the install finished and only its cleanup failed.
 */
async function isInFlight(fs: FileSystemService, entry: CacheEntry): Promise<boolean> {
  if (entry.kind === 'stage') return isStageOwnerAlive(entry.name)
  if (entry.kind === 'backup') return !(await fs.exists(entry.path.slice(0, -'.bak'.length)))
  return false
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
      if (await isInFlight(fs, entry)) entry.inFlight = true
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
