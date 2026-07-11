import { isWithinPath } from '@pair/content-ops'
import { isAbsolute } from 'path'

/**
 * Default location of the operational "working area" (checkpoints, reports).
 * It is operational data, not knowledge — and, by design, it is never a
 * registry source or target, so install/update never touch it (D14).
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
 * Extracts the working-area path override from raw config (as declared,
 * relative to the project root), or the default `.pair/working` when absent.
 */
export function resolveWorkingPathOverride(config: unknown): string {
  const raw = (config as WorkingAreaConfig | undefined)?.working_path
  return typeof raw === 'string' && raw.trim().length > 0 ? raw : DEFAULT_WORKING_PATH
}

/**
 * True if `candidate` equals, or lies within, `containerPath`. Re-exported from
 * content-ops so the config-validation overlap check shares one containment
 * primitive with the rest of the codebase (D14).
 */
export { isWithinPath }

/**
 * True if `a` and `b` are equal, or either one contains the other.
 */
export function pathsOverlap(a: string, b: string, platform: string = process.platform): boolean {
  return isWithinPath(a, b, platform) || isWithinPath(b, a, platform)
}

/**
 * Validates that the working-area path is project-relative. An absolute
 * `working_path` (or one escaping the project root via `..`) is rejected at
 * config-validation time: it cannot be compared meaningfully against the
 * project-relative registry targets that the reserved-path overlap check
 * compares against, so it would silently defeat that guard. Returns validation
 * error strings (empty when valid). The working area is the first member of the
 * reserved-path set — see `reserved-paths.ts`.
 */
export function validateWorkingPath(workingPath: string): string[] {
  const normalized = workingPath.replace(/\\/g, '/')
  if (isAbsolute(workingPath) || normalized === '..' || normalized.startsWith('../')) {
    return [
      `working_path '${workingPath}' must be project-relative (not absolute, not escaping the ` +
        `project root). It is compared against project-relative registry targets (D14).`,
    ]
  }
  return []
}
