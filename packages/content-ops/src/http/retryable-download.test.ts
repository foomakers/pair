import { describe, it, expect, vi } from 'vitest'
import { downloadWithRetry, isRetryableError } from './retryable-download'
import type { DownloadOptions } from './download-manager'

describe('isRetryableError', () => {
  it('returns true for ECONNRESET', () => {
    expect(isRetryableError(new Error('read ECONNRESET'))).toBe(true)
  })

  it('returns true for ETIMEDOUT', () => {
    expect(isRetryableError(new Error('connect ETIMEDOUT'))).toBe(true)
  })

  it('returns true for ECONNREFUSED', () => {
    expect(isRetryableError(new Error('connect ECONNREFUSED'))).toBe(true)
  })

  it('returns true for socket hang up', () => {
    expect(isRetryableError(new Error('socket hang up'))).toBe(true)
  })

  it('returns false for 404 error', () => {
    expect(isRetryableError(new Error('Resource not found (404)'))).toBe(false)
  })

  it('returns false for 403 error', () => {
    expect(isRetryableError(new Error('Access denied (403)'))).toBe(false)
  })
})

describe('downloadWithRetry', () => {
  it('succeeds on first attempt', async () => {
    const downloadFn = vi
      .fn<(url: string, dest: string, opts: DownloadOptions) => Promise<void>>()
      .mockResolvedValueOnce(undefined)

    await downloadWithRetry(
      'https://example.com/kb.zip',
      '/test/kb.zip',
      {},
      { downloadFn, delays: [0] },
    )

    expect(downloadFn).toHaveBeenCalledTimes(1)
  })

  it('retries on transient error and succeeds', async () => {
    const downloadFn = vi
      .fn<(url: string, dest: string, opts: DownloadOptions) => Promise<void>>()
      .mockRejectedValueOnce(new Error('read ECONNRESET'))
      .mockResolvedValueOnce(undefined)

    await downloadWithRetry(
      'https://example.com/kb.zip',
      '/test/kb.zip',
      {},
      { maxRetries: 2, delays: [0, 0], downloadFn },
    )

    expect(downloadFn).toHaveBeenCalledTimes(2)
  })

  it('throws after exhausting retries on transient error', async () => {
    const downloadFn = vi
      .fn<(url: string, dest: string, opts: DownloadOptions) => Promise<void>>()
      .mockRejectedValue(new Error('connect ETIMEDOUT'))

    await expect(
      downloadWithRetry(
        'https://example.com/kb.zip',
        '/test/kb.zip',
        {},
        { maxRetries: 2, delays: [0, 0], downloadFn },
      ),
    ).rejects.toThrow('ETIMEDOUT')

    // initial attempt + 2 retries = 3
    expect(downloadFn).toHaveBeenCalledTimes(3)
  })

  it('does not retry non-retryable errors', async () => {
    const downloadFn = vi
      .fn<(url: string, dest: string, opts: DownloadOptions) => Promise<void>>()
      .mockRejectedValue(new Error('Resource not found (404)'))

    await expect(
      downloadWithRetry(
        'https://example.com/kb.zip',
        '/test/kb.zip',
        {},
        { maxRetries: 3, delays: [0, 0, 0], downloadFn },
      ),
    ).rejects.toThrow('404')

    expect(downloadFn).toHaveBeenCalledTimes(1)
  })

  it('passes options through to downloadFn', async () => {
    const downloadFn = vi
      .fn<(url: string, dest: string, opts: DownloadOptions) => Promise<void>>()
      .mockResolvedValueOnce(undefined)
    const opts: DownloadOptions = { isTTY: true }

    await downloadWithRetry('https://example.com/kb.zip', '/out.zip', opts, { downloadFn })

    expect(downloadFn).toHaveBeenCalledWith('https://example.com/kb.zip', '/out.zip', opts)
  })
})
