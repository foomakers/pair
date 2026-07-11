import type { CurrentVersionResult, InstalledVersionResult } from './version-resolver'
import { isStableVersion } from './version-resolver'
import { buildMigrationUrl } from './migration-url'

/** Numeric major.minor.patch comparison. >0 if a>b, <0 if a<b, 0 if equal. */
function compareStableVersions(a: string, b: string): number {
  const pa = a.split('.').map(Number)
  const pb = b.split('.').map(Number)
  for (let i = 0; i < 3; i++) {
    if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) - (pb[i] ?? 0)
  }
  return 0
}

/**
 * True only for a genuine UPGRADE: both versions stable and `current` newer than
 * `installed`. A downgrade (installed newer) or any pre-release version is not an
 * upgrade — building a migration URL there would point at a non-existent
 * v{newer}-to-v{older} page.
 */
function isUpgrade(installed: string, current: string): boolean {
  return (
    isStableVersion(installed) &&
    isStableVersion(current) &&
    compareStableVersions(current, installed) > 0
  )
}

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

  // A version-specific migration page exists only for an upgrade jump. For a
  // downgrade or pre-release drift, report drift without a (non-existent) URL.
  const migrationUrl = isUpgrade(installed.version, current.version)
    ? buildMigrationUrl(installed.version, current.version)
    : undefined

  return {
    status: 'drift',
    installed,
    current,
    ...(migrationUrl ? { migrationUrl } : {}),
  }
}
