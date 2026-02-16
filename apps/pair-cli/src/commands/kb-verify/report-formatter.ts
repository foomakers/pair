import type { ChecksumCheckResult } from './checks/checksum-check'
import type { StructureCheckResult } from './checks/structure-check'
import type { ManifestCheckResult } from './checks/manifest-check'

export interface VerificationReport {
  package: string
  timestamp: string
  checks: {
    checksum: ChecksumCheckResult
    structure: StructureCheckResult
    manifest: ManifestCheckResult
  }
  overall: 'PASS' | 'FAIL'
}

/**
 * Format verification report as human-readable text
 */
export function formatHumanReadable(report: VerificationReport): string {
  const lines: string[] = []

  lines.push(`\nPackage Verification Report`)
  lines.push(`${'='.repeat(60)}`)
  lines.push(`Package:   ${report.package}`)
  lines.push(`Timestamp: ${report.timestamp}`)
  lines.push(``)

  // Checksum check
  lines.push(`Checksum (${report.checks.checksum.algorithm}): ${report.checks.checksum.status}`)
  if (report.checks.checksum.status === 'FAIL') {
    lines.push(`  Expected: ${report.checks.checksum.expected}`)
    lines.push(`  Actual:   ${report.checks.checksum.actual}`)
  }
  lines.push(``)

  // Structure check
  lines.push(`Structure: ${report.checks.structure.status}`)
  if (report.checks.structure.status === 'FAIL') {
    lines.push(`  Missing paths: ${report.checks.structure.missingPaths.join(', ')}`)
  }
  lines.push(``)

  // Manifest check
  lines.push(`Manifest: ${report.checks.manifest.status}`)
  if (report.checks.manifest.status === 'FAIL') {
    report.checks.manifest.errors.forEach(err => lines.push(`  - ${err}`))
  }
  lines.push(``)

  // Overall result
  lines.push(`${'='.repeat(60)}`)
  lines.push(`Overall Result: ${report.overall}`)
  lines.push(``)

  return lines.join('\n')
}

/**
 * Format verification report as JSON
 */
export function formatJSON(report: VerificationReport): string {
  return JSON.stringify(report, null, 2)
}
