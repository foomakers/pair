import type { VersionCheckResult } from './version-check'
import { migrationsIndexUrl } from './migration-url'
import { isStableVersion } from './version-resolver'

/** ` (non-stable)` suffix for a non-null pre-release version, else empty. */
function nonStableSuffix(version: string | null): string {
  return version && !isStableVersion(version) ? ' (non-stable)' : ''
}

function versionLabel(version: string | null): string {
  return version ?? 'unknown'
}

function statusLine(result: VersionCheckResult): string {
  switch (result.status) {
    case 'up-to-date':
      return 'Up to date'
    case 'drift':
      return 'Version drift detected'
    case 'unknown-installed':
      return 'Unknown installed version'
    case 'current-unavailable':
      return 'Current version unavailable'
  }
}

/**
 * Format a version-check result as human-readable text for `pair-cli kb-info`.
 */
export function formatVersionCheckHuman(result: VersionCheckResult): string {
  const lines: string[] = []

  lines.push('KB Version Check')
  lines.push('═════════════════')
  lines.push('')
  lines.push(`  Status:     ${statusLine(result)}`)
  lines.push(
    `  Installed:  ${versionLabel(result.installed.version)}${nonStableSuffix(result.installed.version)}`,
  )
  lines.push(
    `  Current:    ${versionLabel(result.current.version)}${
      result.current.available ? '' : ' (unavailable)'
    }${result.current.version && !result.current.stable ? ' (non-stable)' : ''}`,
  )
  lines.push(`  Source:     ${result.current.sourceKind}`)

  if (result.current.error) {
    lines.push(`  Note:       ${result.current.error}`)
  }

  if (result.status === 'drift' && result.migrationUrl) {
    lines.push('')
    lines.push(`  Migration guide: ${result.migrationUrl}`)
  }

  if (result.status === 'unknown-installed') {
    lines.push('')
    lines.push('  No installed-version metadata found (legacy install).')
    lines.push('  Re-install (`pair-cli install`) or update (`pair-cli update`) to record it.')
  }

  if (result.status === 'current-unavailable') {
    lines.push('')
    lines.push('  Could not resolve the current KB version (offline or source unreachable).')
    lines.push(`  Migrations index: ${migrationsIndexUrl()}`)
  }

  return lines.join('\n')
}

/**
 * Format a version-check result as JSON for `pair-cli kb-info --json`.
 */
export function formatVersionCheckJSON(result: VersionCheckResult): string {
  return JSON.stringify(result, null, 2)
}
