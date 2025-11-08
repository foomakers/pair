import type { LinkStats } from './stats-collector'

/**
 * Format options for summary output
 */
export type FormatOptions = {
  pathMode?: 'relative' | 'absolute'
  dryRun?: boolean
  verbose?: boolean
}

/**
 * Format link statistics as human-readable summary
 */
export function formatSummary(stats: LinkStats, options: FormatOptions = {}): string {
  const lines: string[] = []

  lines.push('📊 Summary:')

  if (options.pathMode) {
    lines.push(`  • Path mode: ${options.pathMode}`)
  }

  if (options.dryRun) {
    lines.push(`  • Mode: DRY RUN (no files modified)`)
  }

  lines.push(`  • Total links processed: ${stats.totalLinks}`)
  lines.push(`  • Files modified: ${stats.filesModified}`)

  if (Object.keys(stats.linksByCategory).length > 0) {
    lines.push('')
    lines.push('🔗 Links by transformation:')
    for (const [category, count] of Object.entries(stats.linksByCategory)) {
      lines.push(`  • ${category}: ${count}`)
    }
  }

  return lines.join('\n')
}

/**
 * Format statistics as JSON
 */
export function formatJSON(stats: LinkStats, options: FormatOptions = {}): string {
  return JSON.stringify({ ...stats, ...options }, null, 2)
}
