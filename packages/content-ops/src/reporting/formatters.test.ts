import { describe, it, expect } from 'vitest'
import { formatSummary, formatJSON } from './formatters'
import type { LinkStats } from './stats-collector'

const mockStats: LinkStats = {
  totalLinks: 10,
  filesModified: 3,
  linksByCategory: {
    'relative→absolute': 5,
    'absolute→relative': 2,
  },
}

describe('formatSummary', () => {
  it('should format basic summary', () => {
    const output = formatSummary(mockStats)

    expect(output).toContain('📊 Summary:')
    expect(output).toContain('Total links processed: 10')
    expect(output).toContain('Files modified: 3')
  })

  it('should include path mode when provided', () => {
    const output = formatSummary(mockStats, { pathMode: 'absolute' })

    expect(output).toContain('Path mode: absolute')
  })

  it('should show dry-run indicator', () => {
    const output = formatSummary(mockStats, { dryRun: true })

    expect(output).toContain('DRY RUN')
  })

  it('should include links by category', () => {
    const output = formatSummary(mockStats)

    expect(output).toContain('🔗 Links by transformation:')
    expect(output).toContain('relative→absolute: 5')
    expect(output).toContain('absolute→relative: 2')
  })

  it('should handle empty linksByCategory', () => {
    const statsWithoutCategories: LinkStats = {
      totalLinks: 5,
      filesModified: 1,
      linksByCategory: {},
    }

    const output = formatSummary(statsWithoutCategories)

    expect(output).not.toContain('🔗 Links by transformation:')
  })
})

describe('formatJSON', () => {
  it('should format stats as JSON', () => {
    const output = formatJSON(mockStats)
    const parsed = JSON.parse(output)

    expect(parsed.totalLinks).toBe(10)
    expect(parsed.filesModified).toBe(3)
    expect(parsed.linksByCategory).toEqual(mockStats.linksByCategory)
  })

  it('should include options in JSON output', () => {
    const output = formatJSON(mockStats, { pathMode: 'relative', dryRun: true })
    const parsed = JSON.parse(output)

    expect(parsed.pathMode).toBe('relative')
    expect(parsed.dryRun).toBe(true)
  })
})
