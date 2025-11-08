import { describe, it, expect, beforeEach } from 'vitest'
import { StatsCollector } from './stats-collector'

let collector: StatsCollector

beforeEach(() => {
  collector = new StatsCollector()
})

describe('initialization', () => {
  it('should initialize with zero stats', () => {
    const stats = collector.getStats()

    expect(stats.totalLinks).toBe(0)
    expect(stats.filesModified).toBe(0)
    expect(Object.keys(stats.linksByCategory)).toHaveLength(0)
  })

  it('should return immutable copy of stats', () => {
    const stats1 = collector.getStats()
    collector.recordLinks(5)
    const stats2 = collector.getStats()

    expect(stats1.totalLinks).toBe(0)
    expect(stats2.totalLinks).toBe(5)
  })
})

describe('recording operations', () => {
  it('should record links', () => {
    collector.recordLinks(5)
    collector.recordLinks(3)

    const stats = collector.getStats()
    expect(stats.totalLinks).toBe(8)
  })

  it('should record file modifications', () => {
    collector.recordFileModified()
    collector.recordFileModified()

    const stats = collector.getStats()
    expect(stats.filesModified).toBe(2)
  })

  it('should record transformations by category', () => {
    collector.recordTransformation('relative→absolute', 2)
    collector.recordTransformation('absolute→relative', 1)
    collector.recordTransformation('relative→absolute', 3)

    const stats = collector.getStats()
    expect(stats.linksByCategory['relative→absolute']).toBe(5)
    expect(stats.linksByCategory['absolute→relative']).toBe(1)
  })
})

describe('reset', () => {
  it('should reset statistics', () => {
    collector.recordLinks(10)
    collector.recordFileModified()
    collector.recordTransformation('test', 5)

    collector.reset()

    const stats = collector.getStats()
    expect(stats.totalLinks).toBe(0)
    expect(stats.filesModified).toBe(0)
    expect(Object.keys(stats.linksByCategory)).toHaveLength(0)
  })
})
