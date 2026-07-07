import type { FileSystemService } from '@pair/content-ops'
import type { RegistryConfig } from './resolver'

/**
 * Default location of the operational "working area" (checkpoints, reports).
 * Excluded from every KB asset registry by design — it is operational data,
 * not knowledge (D14).
 */
export const DEFAULT_WORKING_PATH = '.pair/working'

/**
 * Raw config shape carrying the optional working-area path override.
 * Lives at the top level of `pair.config.json`, outside `asset_registries`.
 */
interface WorkingAreaConfig {
  working_path?: unknown
  [key: string]: unknown
}

/**
 * Normalizes a path for overlap comparison. On case-insensitive filesystems
 * (macOS/Windows) the result is case-folded so a `working_path` override
 * differing only in case (e.g. ".pair/Working" vs ".pair/working") is still
 * recognized as overlapping.
 * @param platform - OS platform (defaults to process.platform), injectable for tests.
 */
function normalize(p: string, platform: string = process.platform): string {
  const stripped = p.replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+$/, '')
  return platform === 'darwin' || platform === 'win32' ? stripped.toLowerCase() : stripped
}

/**
 * Extracts the working-area path override from raw config (as declared,
 * relative to the project root), or the default `.pair/working` when absent.
 */
export function resolveWorkingPathOverride(config: unknown): string {
  const raw = (config as WorkingAreaConfig | undefined)?.working_path
  return typeof raw === 'string' && raw.trim().length > 0 ? raw : DEFAULT_WORKING_PATH
}

/**
 * Resolves the absolute working-area path for a given base target
 * (the installed project root), honoring any configured override.
 */
export function resolveWorkingPath(
  config: unknown,
  baseTarget: string,
  fs: FileSystemService,
): string {
  return fs.resolve(baseTarget, resolveWorkingPathOverride(config))
}

/**
 * True if `candidate` equals, or lies within, `containerPath`.
 * Both paths must share the same base (both relative, or both absolute).
 */
export function isWithinPath(
  candidate: string,
  containerPath: string,
  platform: string = process.platform,
): boolean {
  const a = normalize(candidate, platform)
  const b = normalize(containerPath, platform)
  return a === b || a.startsWith(b + '/')
}

/**
 * True if `a` and `b` are equal, or either one contains the other.
 */
export function pathsOverlap(a: string, b: string, platform: string = process.platform): boolean {
  return isWithinPath(a, b, platform) || isWithinPath(b, a, platform)
}

/**
 * Detects registry targets that overlap with the working-area path.
 * Catches both directions of the edge cases called out by the story:
 * a registry accidentally covering the working area, and an override that
 * lands inside a registry-managed directory.
 */
export function detectWorkingPathOverlap(
  registries: Record<string, RegistryConfig>,
  workingPath: string = DEFAULT_WORKING_PATH,
): string[] {
  const overlapping: string[] = []

  for (const [name, config] of Object.entries(registries)) {
    if (!config?.targets) continue
    for (const target of config.targets) {
      if (target?.path && pathsOverlap(target.path, workingPath)) {
        overlapping.push(
          `Registry '${name}' target '${target.path}' overlaps with the working area '${workingPath}'. ` +
            `The working area must stay outside every asset registry (D14).`,
        )
      }
    }
  }

  return overlapping
}
