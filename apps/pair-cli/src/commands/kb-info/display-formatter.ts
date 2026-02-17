import type { ManifestMetadata } from '../package/metadata'

/**
 * Format manifest metadata as human-readable text
 */
export function formatHumanReadable(manifest: ManifestMetadata): string {
  const lines: string[] = []

  lines.push('Package Information')
  lines.push('═══════════════════')
  lines.push('')
  lines.push(`  Name:         ${manifest.name}`)
  lines.push(`  Version:      ${manifest.version}`)
  lines.push(`  Description:  ${manifest.description}`)
  lines.push(`  Author:       ${manifest.author}`)
  lines.push(`  License:      ${manifest.license}`)
  lines.push(`  Tags:         ${manifest.tags.length > 0 ? manifest.tags.join(', ') : '(none)'}`)
  lines.push(`  Created:      ${manifest.created_at}`)
  lines.push(
    `  Registries:   ${manifest.registries.length > 0 ? manifest.registries.join(', ') : '(none)'}`,
  )

  if (manifest.contentChecksum) {
    lines.push(`  Checksum:     ${manifest.contentChecksum}`)
  }

  if (manifest.organization) {
    const org = manifest.organization
    lines.push('')
    lines.push('Organization')
    lines.push('────────────')
    lines.push(`  Name:           ${org.name}`)
    if (org.team) lines.push(`  Team:           ${org.team}`)
    if (org.department) lines.push(`  Department:     ${org.department}`)
    if (org.approver) lines.push(`  Approver:       ${org.approver}`)
    lines.push(
      `  Compliance:     ${org.compliance.length > 0 ? org.compliance.join(', ') : '(none)'}`,
    )
    lines.push(`  Distribution:   ${org.distribution}`)
  }

  return lines.join('\n')
}

/**
 * Format manifest metadata as JSON string
 */
export function formatJSON(manifest: ManifestMetadata): string {
  return JSON.stringify(manifest, null, 2)
}
