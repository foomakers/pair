import { describe, it, expect, beforeEach, vi } from 'vitest'
import { ProgressReporter, ProgressData, formatProgress, calculateSpeed } from './progress-reporter'

describe('Progress calculations', () => {
  it('calculates percentage correctly', () => {
    const data: ProgressData = {
      bytesDownloaded: 50,
      totalBytes: 100,
      startTime: Date.now(),
    }
    const formatted = formatProgress(data, true)
    expect(formatted).toContain('50%')
  })

  it('formats bytes as MB', () => {
    const data: ProgressData = {
      bytesDownloaded: 5 * 1024 * 1024, // 5 MB
      totalBytes: 10 * 1024 * 1024, // 10 MB
      startTime: Date.now(),
    }
    const formatted = formatProgress(data, true)
    expect(formatted).toContain('5.0 MB')
  })

  it('calculates download speed in MB/s', () => {
    const startTime = Date.now() - 2000 // 2 seconds ago
    const speed = calculateSpeed(4 * 1024 * 1024, startTime) // 4 MB in 2s
    expect(speed).toBeCloseTo(2.0, 1) // ~2 MB/s
  })

  it('handles zero time elapsed', () => {
    const speed = calculateSpeed(1000, Date.now())
    expect(speed).toBe(0)
  })
})

describe('ProgressReporter', () => {
  let reporter: ProgressReporter
  let mockStdout: { write: ReturnType<typeof vi.fn> }

  beforeEach(() => {
    mockStdout = { write: vi.fn() }
    reporter = new ProgressReporter(10 * 1024 * 1024, true, mockStdout)
  })

  it('creates reporter with total bytes', () => {
    expect(reporter).toBeDefined()
  })

  it('updates progress and throttles output', () => {
    reporter.update(1024 * 1024) // 1 MB
    expect(mockStdout.write).toHaveBeenCalled()
  })

  it('throttles updates to max 10Hz (100ms)', () => {
    vi.useFakeTimers()
    const reporter2 = new ProgressReporter(1000, true, mockStdout)
    mockStdout.write.mockClear()

    reporter2.update(100)
    reporter2.update(200)
    reporter2.update(300)

    // Only first call should write (throttled)
    expect(mockStdout.write).toHaveBeenCalledTimes(1)

    vi.advanceTimersByTime(100)
    reporter2.update(400)
    // Now second call allowed
    expect(mockStdout.write).toHaveBeenCalledTimes(2)

    vi.useRealTimers()
  })

  it('completes progress and shows final message', () => {
    reporter.complete()
    expect(mockStdout.write).toHaveBeenCalled()
    const lastCall = mockStdout.write.mock.calls[mockStdout.write.mock.calls.length - 1][0]
    expect(lastCall).toContain('✅')
  })
})

describe('TTY detection', () => {
  it('uses progress bar in TTY mode', () => {
    const mockStdout = { write: vi.fn() }
    const reporter = new ProgressReporter(1000, true, mockStdout)
    reporter.update(500)

    const output = mockStdout.write.mock.calls[0][0]
    expect(output).toContain('%') // Progress bar format
  })

  it('uses simple logs in non-TTY mode', () => {
    const mockStdout = { write: vi.fn() }
    const reporter = new ProgressReporter(1000, false, mockStdout)
    reporter.update(500)

    const output = mockStdout.write.mock.calls[0][0]
    expect(output).toContain('Downloading')
    expect(output).toContain('50%')
  })

  it('does not use ANSI codes in non-TTY mode', () => {
    const mockStdout = { write: vi.fn() }
    const reporter = new ProgressReporter(1000, false, mockStdout)
    reporter.update(500)

    const output = mockStdout.write.mock.calls[0][0]
    expect(output).not.toContain('\u001b[') // No ANSI escape codes
  })
})
