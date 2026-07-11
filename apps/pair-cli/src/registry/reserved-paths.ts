import { posix as posixPath } from 'path'
import type { RegistryConfig } from './resolver'
import { pathsOverlap } from './working-area'

/**
 * Returns the set of **project-relative** reserved paths that no asset-registry
 * target may overlap (equal / ancestor / descendant). These are areas Pair owns
 * operationally or as meta-config: a registry covering one would let
 * install/update clobber it, and the mirror cleanup would delete anything under
 * it that isn't in the registry source. Keeping them out of every registry is
 * what protects them — there is no runtime exclusion (D14).
 *
 * Extension point — add reserved paths here as a single trivial change. Current
 * members:
 *   - `.pair/working` (or the `working_path` override) — the operational working area.
 *   - `.pair/.kb-version.json` (#261) — the KB version marker (a version pin).
 * Append further meta/config files below as needed.
 *
 * @param workingPath - the resolved (project-relative) working-area path.
 */
export function getReservedPaths(workingPath: string): string[] {
  return [
    workingPath,
    // The KB version marker — durable project state (a version pin), never a
    // registry target. Must match INSTALLED_VERSION_MARKER in
    // commands/kb-info/version-resolver.ts (a test asserts they agree).
    '.pair/.kb-version.json',
  ]
}

/**
 * Detects registry targets that overlap any reserved project-side path.
 * Bidirectional: flags a target that is, contains, or lies within a reserved
 * path. Every hit is a config-validation ERROR (fail-closed) — this check is the
 * sole guard keeping reserved areas out of every install/update operation (D14).
 *
 * Contract: all operands are **project-relative** — `target.path` and each
 * reserved path (the config-provided `working_path` is enforced project-relative
 * by `validateWorkingPath`; the rest are project-relative constants).
 */
export function detectReservedPathOverlap(
  registries: Record<string, RegistryConfig>,
  reservedPaths: string[],
): string[] {
  const errors: string[] = []

  for (const [name, config] of Object.entries(registries)) {
    if (!config?.targets) continue
    for (const target of config.targets) {
      if (!target?.path) continue
      // Canonicalize both operands (collapse `.`/`..`) before comparing, so a
      // non-canonical target — e.g. '.pair/knowledge/../working' or './.pair' —
      // that actually covers a reserved path cannot slip past the overlap check.
      const normTarget = posixPath.normalize(target.path)
      for (const reserved of reservedPaths) {
        if (pathsOverlap(normTarget, posixPath.normalize(reserved))) {
          errors.push(
            `Registry '${name}' target '${target.path}' overlaps the reserved path '${reserved}'. ` +
              `Reserved paths must stay outside every asset registry (D14).`,
          )
        }
      }
    }
  }

  return errors
}
