import { describe, it, expect } from 'vitest'
import {
  evaluateBenchmarkResults,
  buildReport,
  MAX_LARGE_DURATION_MS,
  XLARGE_WARNING_DURATION_MS,
  MIN_LINKS_PER_SECOND,
  type BenchmarkResult,
} from './benchmark-update-link'

function result(overrides: Partial<BenchmarkResult> = {}): BenchmarkResult {
  return {
    size: 'large',
    files: 500,
    linksProcessed: 15000,
    duration: 10000,
    linksPerSecond: 1500,
    ...overrides,
  }
}

describe('evaluateBenchmarkResults', () => {
  it('passes when every size is under thresholds', () => {
    const results = [
      result({ size: 'small', duration: 100, linksPerSecond: 1000 }),
      result({ size: 'large', duration: 10000, linksPerSecond: 1500 }),
    ]
    const verdict = evaluateBenchmarkResults(results)
    expect(verdict).toEqual({ pass: true, failures: [], warnings: [] })
  })

  it('fails when the large KB exceeds the max duration threshold', () => {
    const results = [result({ size: 'large', duration: 30001, linksPerSecond: 1500 })]
    const verdict = evaluateBenchmarkResults(results)
    expect(verdict.pass).toBe(false)
    expect(verdict.failures).toEqual([
      `Large KB (15000 links) took 30001ms (required: <${MAX_LARGE_DURATION_MS}ms)`,
    ])
  })

  it('fails when throughput is below the minimum links/sec threshold', () => {
    const results = [result({ size: 'small', duration: 1000, linksPerSecond: 99 })]
    const verdict = evaluateBenchmarkResults(results)
    expect(verdict.pass).toBe(false)
    expect(verdict.failures).toEqual([`small: 99 links/sec (required: >${MIN_LINKS_PER_SECOND})`])
  })

  it('reports both failures when duration and throughput are both missed', () => {
    const results = [result({ size: 'large', duration: 40000, linksPerSecond: 50 })]
    const verdict = evaluateBenchmarkResults(results)
    expect(verdict.pass).toBe(false)
    expect(verdict.failures).toEqual([
      `Large KB (15000 links) took 40000ms (required: <${MAX_LARGE_DURATION_MS}ms)`,
      `large: 50 links/sec (required: >${MIN_LINKS_PER_SECOND})`,
    ])
  })

  it('passes at the exact duration boundary (not strictly greater than)', () => {
    const results = [
      result({ size: 'large', duration: MAX_LARGE_DURATION_MS, linksPerSecond: 500 }),
    ]
    expect(evaluateBenchmarkResults(results).pass).toBe(true)
  })

  it('passes at the exact throughput boundary (not strictly less than)', () => {
    const results = [
      result({ size: 'small', duration: 1000, linksPerSecond: MIN_LINKS_PER_SECOND }),
    ]
    expect(evaluateBenchmarkResults(results).pass).toBe(true)
  })

  it('warns (does not fail) when xlarge exceeds the warning duration', () => {
    const results = [
      result({ size: 'large', duration: 10000, linksPerSecond: 1500 }),
      result({
        size: 'xlarge',
        duration: XLARGE_WARNING_DURATION_MS + 1,
        linksPerSecond: 500,
      }),
    ]
    const verdict = evaluateBenchmarkResults(results)
    expect(verdict.pass).toBe(true)
    expect(verdict.failures).toEqual([])
    expect(verdict.warnings).toHaveLength(1)
    expect(verdict.warnings[0]).toContain('XLarge KB')
  })

  it('is a no-op verdict (pass) when neither large nor xlarge sizes are present', () => {
    const results = [result({ size: 'medium', duration: 500, linksPerSecond: 2000 })]
    expect(evaluateBenchmarkResults(results)).toEqual({ pass: true, failures: [], warnings: [] })
  })

  it('respects custom thresholds passed explicitly', () => {
    const results = [result({ size: 'large', duration: 5000, linksPerSecond: 40 })]
    const verdict = evaluateBenchmarkResults(results, {
      maxLargeDurationMs: 1000,
      xlargeWarningDurationMs: 2000,
      minLinksPerSecond: 50,
    })
    expect(verdict.pass).toBe(false)
    expect(verdict.failures).toEqual([
      'Large KB (15000 links) took 5000ms (required: <1000ms)',
      'large: 40 links/sec (required: >50)',
    ])
  })
})

describe('buildReport', () => {
  it('picks fastest and slowest by links/sec', () => {
    const results = [
      result({ size: 'small', linksPerSecond: 3000 }),
      result({ size: 'large', linksPerSecond: 1500 }),
      result({ size: 'xlarge', linksPerSecond: 800 }),
    ]
    const report = buildReport(results)
    expect(report.summary.fastest.size).toBe('small')
    expect(report.summary.slowest.size).toBe('xlarge')
    expect(report.results).toEqual(results)
    expect(report.system.platform).toBe(process.platform)
  })
})
