import chalk from 'chalk'
import type { ResolvedMetadata } from './defaults-resolver'

export interface PreviewParams {
  metadata: ResolvedMetadata
  registries: string[]
  fileCount: number
  outputPath: string
}

/**
 * Format a preview summary for the interactive package creation flow.
 * Returns a multi-line string suitable for terminal display.
 */
export function formatPreview(params: PreviewParams): string {
  const { metadata, registries, fileCount, outputPath } = params
  const lines: string[] = []

  lines.push('')
  lines.push(chalk.bold('📦 Package Preview'))
  lines.push(chalk.dim('─'.repeat(50)))
  lines.push('')

  lines.push(chalk.bold('  Metadata'))
  lines.push(`    Name:        ${chalk.cyan(metadata.name)}`)
  lines.push(`    Version:     ${chalk.cyan(metadata.version)}`)
  lines.push(`    Description: ${metadata.description}`)
  lines.push(`    Author:      ${metadata.author}`)
  lines.push(
    `    Tags:        ${metadata.tags.length > 0 ? metadata.tags.join(', ') : chalk.dim('(none)')}`,
  )
  lines.push(`    License:     ${metadata.license}`)
  lines.push('')

  lines.push(chalk.bold('  Registries'))
  if (registries.length > 0) {
    for (const reg of registries) {
      lines.push(`    • ${reg}`)
    }
  } else {
    lines.push(`    ${chalk.dim('(none detected)')}`)
  }
  lines.push('')

  lines.push(`  Files:  ${fileCount}`)
  lines.push(`  Output: ${chalk.cyan(outputPath)}`)
  lines.push('')
  lines.push(chalk.dim('─'.repeat(50)))

  return lines.join('\n')
}
