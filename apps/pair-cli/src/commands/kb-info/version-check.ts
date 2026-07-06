import type { CurrentVersionResult, InstalledVersionResult } from './version-resolver'
import { buildMigrationUrl } from './migration-url'

/**
 * Outcome of comparing installed vs current KB version.
 * - up-to-date: both known and equal
 * - drift: both known and different
 * - unknown-installed: no installed version metadata (legacy install, AC4)
 * - current-unavailable: installed known, current could not be resolved (offline/unreachable)
 */
export type VersionCheckStatus =
  | 'up-to-date'
  | 'drift'
  | 'unknown-installed'
  | 'current-unavailable'

export interface VersionCheckResult {
  status: VersionCheckStatus
  installed: InstalledVersionResult
  current: CurrentVersionResult
  /** Present only for `drift`: docs page for the installed -> current jump. */
  migrationUrl?: string
}

/**
 * Compare an installed KB version against the resolved current version.
 * Check-only — never mutates anything, never performs migration (D20).
 */
export function compareVersions(
  installed: InstalledVersionResult,
  current: CurrentVersionResult,
): VersionCheckResult {
  if (installed.version === null) {
    return { status: 'unknown-installed', installed, current }
  }

  if (!current.available || current.version === null) {
    return { status: 'current-unavailable', installed, current }
  }

  if (installed.version === current.version) {
    return { status: 'up-to-date', installed, current }
  }

  return {
    status: 'drift',
    installed,
    current,
    migrationUrl: buildMigrationUrl(installed.version, current.version),
  }
}
