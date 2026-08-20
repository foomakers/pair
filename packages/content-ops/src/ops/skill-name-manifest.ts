/**
 * Persists the skill name registry across install/update runs.
 *
 * Without a recorded previous mapping, an already-installed reference like
 * `/pair-next` cannot be safely rewritten after a prefix change (e.g. to
 * `/foo-next`): matching on the literal old prefix string would produce
 * false positives on unrelated content, and files copied with `add`
 * behavior (never overwritten, e.g. adoption docs) are not re-derived from
 * source on every run so their stale references would never be revisited.
 *
 * Recording {shortName: installedName} from the previous run lets callers
 * compute an exact {oldInstalledName: newInstalledName} transition map
 * instead of guessing from string patterns.
 */

import { dirname } from 'path'
import { FileSystemService } from '../file-system'
import type { SkillNameMap } from './skill-reference-rewriter'

export type SkillNameManifest = {
  version: 1
  skills: Record<string, string>
}

/**
 * Reads a previously recorded skill name map.
 * Returns an empty map when the manifest is missing or malformed —
 * callers should treat this the same as "no previous install".
 */
export async function readSkillNameManifest(
  fileService: FileSystemService,
  manifestPath: string,
): Promise<SkillNameMap> {
  if (!(await fileService.exists(manifestPath))) return new Map()

  try {
    const raw = await fileService.readFile(manifestPath)
    const parsed = JSON.parse(raw) as Partial<SkillNameManifest> | null
    if (!parsed || typeof parsed.skills !== 'object' || parsed.skills === null) return new Map()
    return new Map(Object.entries(parsed.skills as Record<string, string>))
  } catch {
    return new Map()
  }
}

/**
 * Persists the current skill name map so the next install/update run can
 * detect renames (prefix changes) and removals.
 */
export async function writeSkillNameManifest(
  fileService: FileSystemService,
  manifestPath: string,
  skillNameMap: SkillNameMap,
): Promise<void> {
  const manifest: SkillNameManifest = {
    version: 1,
    skills: Object.fromEntries(skillNameMap),
  }
  // Owns its own directory. `.pair/` used to exist only as a side effect of another
  // registry's `ensureDir`, so this write failed outright — ENOENT out of the whole
  // install — the moment a source shipped `skills` and not `knowledge`.
  await fileService.mkdir(dirname(manifestPath), { recursive: true })
  await fileService.writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n')
}

/**
 * Builds a transition map (oldInstalledName -> newInstalledName) for
 * skills present in both the previous and current registry under the same
 * short (source) name but with a different installed name — e.g. after a
 * prefix change. Entries are only added when the installed name actually
 * changed.
 */
export function buildTransitionMap(previous: SkillNameMap, current: SkillNameMap): SkillNameMap {
  const transitions: SkillNameMap = new Map()
  for (const [shortName, oldInstalledName] of previous) {
    const newInstalledName = current.get(shortName)
    if (newInstalledName && newInstalledName !== oldInstalledName) {
      transitions.set(oldInstalledName, newInstalledName)
    }
  }
  return transitions
}

/**
 * Installed names for short names present in the previous mapping but
 * absent from the current registry (removed/disabled skills). Callers
 * should warn if these are still referenced — they must be left as-is,
 * not rewritten (there is no correct target name to rewrite them to).
 */
export function findOrphanedInstalledNames(
  previous: SkillNameMap,
  current: SkillNameMap,
): string[] {
  const orphaned: string[] = []
  for (const [shortName, oldInstalledName] of previous) {
    if (!current.has(shortName)) orphaned.push(oldInstalledName)
  }
  return orphaned
}

/** Merges any number of skill name maps into one (later maps win on key collision). */
export function mergeSkillNameMaps(...maps: SkillNameMap[]): SkillNameMap {
  const merged: SkillNameMap = new Map()
  for (const map of maps) {
    for (const [k, v] of map) merged.set(k, v)
  }
  return merged
}
