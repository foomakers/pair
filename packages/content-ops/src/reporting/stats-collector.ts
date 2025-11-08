/**
 * Statistics for link processing operations
 */
export type LinkStats = {
  totalLinks: number
  filesModified: number
  linksByCategory: Record<string, number>
}

/**
 * Collector for accumulating link processing statistics
 */
export class StatsCollector {
  private stats: LinkStats = {
    totalLinks: 0,
    filesModified: 0,
    linksByCategory: {},
  }

  /**
   * Record links found in a file
   */
  recordLinks(count: number): void {
    this.stats.totalLinks += count
  }

  /**
   * Record a file modification
   */
  recordFileModified(): void {
    this.stats.filesModified += 1
  }

  /**
   * Record a link transformation by category
   */
  recordTransformation(category: string, count = 1): void {
    this.stats.linksByCategory[category] = (this.stats.linksByCategory[category] || 0) + count
  }

  /**
   * Get accumulated statistics
   */
  getStats(): Readonly<LinkStats> {
    return { ...this.stats }
  }

  /**
   * Reset statistics
   */
  reset(): void {
    this.stats = {
      totalLinks: 0,
      filesModified: 0,
      linksByCategory: {},
    }
  }
}
