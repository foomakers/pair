import { describe, it, expect, vi, beforeEach } from 'vitest'
import { join } from 'path'
import { homedir, tmpdir } from 'os'
import * as https from 'https'
import { InMemoryFileSystemService } from '@pair/content-ops'
import { ensureKBAvailable } from './kb-availability'
import {
  mockHttpsRequest,
  mockMultipleHttpsGet,
  buildTestResponse,
  toIncomingMessage,
  toClientRequest,
  buildTestRequest,
} from '../test-utils/http-mocks'

vi.mock('https', () => ({
  get: vi.fn(),
  request: vi.fn(),
}))

// Type helpers
// MockStdout type moved to unit tests where needed

const mockExtract = vi.fn()

// Default mock setup to prevent "Cannot read properties of undefined"
beforeEach(() => {
  vi.mocked(https.request).mockImplementation(
    mockHttpsRequest(toIncomingMessage(buildTestResponse(200, { 'content-length': '1024' }))),
  )
})

// Cache-specific tests were moved to cache-manager.test.ts

describe('KB Manager - ensureKBAvailable - Cache Hit', () => {
  const testVersion = '0.2.0'
  const expectedCachePath = join(homedir(), '.pair', 'kb', testVersion)

  it('should return cached path immediately if KB already cached', async () => {
    const fs = new InMemoryFileSystemService(
      {
        [expectedCachePath + '/manifest.json']: '{"version": "0.2.0"}',
        [expectedCachePath + '/.pair/knowledge/test.md']: 'test content',
      },
      '/',
      '/',
    )

    const result = await ensureKBAvailable(testVersion, { fs })

    expect(result).toBe(expectedCachePath)
    expect(https.get).not.toHaveBeenCalled()
  })
})

describe('KB Manager - GitHub URL construction', () => {
  it('should construct correct GitHub release URL', async () => {
    vi.clearAllMocks()
    mockExtract.mockReset().mockResolvedValue(undefined)

    const testVersion = '0.2.0'
    const fs = new InMemoryFileSystemService({}, '/', '/')

    // Mock checksum (404) and file download (200) - auto-emit end
    const checksumResp = toIncomingMessage(buildTestResponse(404))
    const fileResp = toIncomingMessage(buildTestResponse(200, { 'content-length': '1024' }))
    vi.mocked(https.get).mockImplementation(
      mockMultipleHttpsGet([
        { pattern: '.sha256', response: checksumResp },
        { response: fileResp },
      ]),
    )

    await ensureKBAvailable(testVersion, { fs, extract: mockExtract })
  })
})

describe('KB Manager - Version handling', () => {
  it('should strip leading v from version in asset name but keep in tag', async () => {
    vi.clearAllMocks()
    mockExtract.mockReset().mockResolvedValue(undefined)

    const fs = new InMemoryFileSystemService({}, '/', '/')
    const versionWithV = 'v1.2.3'

    const checksumResp = toIncomingMessage(buildTestResponse(404))
    const fileResp = toIncomingMessage(buildTestResponse(200, { 'content-length': '1024' }))
    vi.mocked(https.get).mockImplementation(
      mockMultipleHttpsGet([
        { pattern: '.sha256', response: checksumResp },
        { response: fileResp },
      ]),
    )

    await ensureKBAvailable(versionWithV, { fs, extract: mockExtract })
    await ensureKBAvailable(versionWithV, { fs, extract: mockExtract })
  })
})

describe('KB Manager - 404 error handling', () => {
  it('should throw error with GitHub URL on 404 not found', async () => {
    vi.clearAllMocks()
    mockExtract.mockReset()

    const testVersion404 = '0.0.404-test'
    const fs = new InMemoryFileSystemService({}, '/', '/')

    const checksumResp = toIncomingMessage(buildTestResponse(404))
    const fileResp = toIncomingMessage(buildTestResponse(404))
    vi.mocked(https.get).mockImplementation(
      mockMultipleHttpsGet([
        { pattern: '.sha256', response: checksumResp },
        { response: fileResp },
      ]),
    )

    await expect(ensureKBAvailable(testVersion404, { fs, extract: mockExtract })).rejects.toThrow(
      /KB v0\.0\.404 not found \(404\).*github\.com/s,
    )
  })
})

describe('KB Manager - 403 error handling', () => {
  it('should throw error with GitHub URL on 403 forbidden', async () => {
    vi.clearAllMocks()
    mockExtract.mockReset()

    const testVersion403 = '0.0.403-test'
    const fs = new InMemoryFileSystemService({}, '/', '/')

    const checksumResp = toIncomingMessage(buildTestResponse(404))
    const fileResp = toIncomingMessage(buildTestResponse(403))
    vi.mocked(https.get).mockImplementation(
      mockMultipleHttpsGet([
        { pattern: '.sha256', response: checksumResp },
        { response: fileResp },
      ]),
    )

    await expect(ensureKBAvailable(testVersion403, { fs, extract: mockExtract })).rejects.toThrow(
      /Access denied \(403\).*github\.com/s,
    )
  })
})

describe('KB Manager - Network failure', () => {
  it('should throw error on network failure', async () => {
    vi.clearAllMocks()
    mockExtract.mockReset()

    const testVersion = '0.2.0'
    const fs = new InMemoryFileSystemService({}, '/', '/')

    vi.mocked(https.get).mockImplementation(() => {
      const mockRequest = toClientRequest(buildTestRequest())
      setImmediate(() => mockRequest.emit('error', new Error('ENOTFOUND: network unreachable')))
      return mockRequest
    })

    await expect(ensureKBAvailable(testVersion, { fs, extract: mockExtract })).rejects.toThrow(
      /network/,
    )
  })
})

describe('KB Manager - ZIP cleanup', () => {
  it('should cleanup ZIP file on extraction failure', async () => {
    vi.clearAllMocks()
    mockExtract.mockReset()

    const testVersion = '0.2.0'
    const expectedCachePath = join(homedir(), '.pair', 'kb', testVersion)
    const expectedZipPath = join(tmpdir(), `kb-${testVersion}.zip`)
    const fs = new InMemoryFileSystemService({}, '/', '/')

    const checksumResp = toIncomingMessage(buildTestResponse(404))
    const fileResp = toIncomingMessage(buildTestResponse(200, { 'content-length': '1024' }))
    vi.mocked(https.get).mockImplementation(
      mockMultipleHttpsGet([
        { pattern: '.sha256', response: checksumResp },
        { response: fileResp },
      ]),
    )
    mockExtract.mockRejectedValue(new Error('Corrupted ZIP'))

    await expect(ensureKBAvailable(testVersion, { fs, extract: mockExtract })).rejects.toThrow(
      /Corrupted ZIP/,
    )

    expect(mockExtract).toHaveBeenCalledWith(expectedZipPath, expectedCachePath)
  })
})

describe('KB Manager - Extraction error', () => {
  it('should throw actionable error on extraction failure', async () => {
    vi.clearAllMocks()
    mockExtract.mockReset()

    const testVersion = '0.2.0'
    const fs = new InMemoryFileSystemService({}, '/', '/')

    const checksumResp = toIncomingMessage(buildTestResponse(404))
    const fileResp = toIncomingMessage(buildTestResponse(200, { 'content-length': '1024' }))
    vi.mocked(https.get).mockImplementation(
      mockMultipleHttpsGet([
        { pattern: '.sha256', response: checksumResp },
        { response: fileResp },
      ]),
    )
    mockExtract.mockRejectedValue(new Error('Invalid ZIP format'))

    await expect(ensureKBAvailable(testVersion, { fs, extract: mockExtract })).rejects.toThrow(
      /Invalid ZIP format/,
    )
  })
})

describe('KB Manager - Download message', () => {
  it('should display download start message', async () => {
    vi.clearAllMocks()
    mockExtract.mockReset().mockResolvedValue(undefined)
    const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    const testVersion = '0.2.0'
    const fs = new InMemoryFileSystemService({}, '/', '/')

    const checksumResp = toIncomingMessage(buildTestResponse(404))
    const fileResp = toIncomingMessage(buildTestResponse(200, { 'content-length': '1024' }))
    vi.mocked(https.get).mockImplementation(
      mockMultipleHttpsGet([
        { pattern: '.sha256', response: checksumResp },
        { response: fileResp },
      ]),
    )

    await ensureKBAvailable(testVersion, { fs, extract: mockExtract })

    expect(consoleLogSpy).toHaveBeenCalledWith(
      expect.stringContaining('KB not found, downloading v0.2.0 from GitHub'),
    )

    consoleLogSpy.mockRestore()
  })
})

describe('KB Manager - Success message', () => {
  it('should display success message after installation', async () => {
    vi.clearAllMocks()
    mockExtract.mockReset().mockResolvedValue(undefined)
    const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    const testVersion = '0.2.0'
    const fs = new InMemoryFileSystemService({}, '/', '/')

    const checksumResp = toIncomingMessage(buildTestResponse(404))
    const fileResp = toIncomingMessage(buildTestResponse(200, { 'content-length': '1024' }))
    vi.mocked(https.get).mockImplementation(
      mockMultipleHttpsGet([
        { pattern: '.sha256', response: checksumResp },
        { response: fileResp },
      ]),
    )

    await ensureKBAvailable(testVersion, { fs, extract: mockExtract })

    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('✅ KB v0.2.0 installed'))

    consoleLogSpy.mockRestore()
  })
})

// Helper: setup custom URL test mocks
function setupCustomUrlMocks(
  capturedUrls: string[],
  checksumResp: ReturnType<typeof toIncomingMessage>,
  fileResp: ReturnType<typeof toIncomingMessage>,
) {
  vi.mocked(https.get).mockImplementation((...args: unknown[]) => {
    const url = String(args[0])
    capturedUrls.push(url)
    const optionsOrCallback = args[1]
    const callback = args[2]
    const cb = typeof optionsOrCallback === 'function' ? optionsOrCallback : callback

    const resp = url.includes('.sha256') ? checksumResp : fileResp
    if (typeof cb === 'function') {
      setImmediate(() => {
        cb(resp)
        setImmediate(() => resp.emit('end'))
      })
    }
    return toClientRequest(buildTestRequest())
  })
}

describe('KB Manager - Custom URL with provided URL', () => {
  it('should use custom URL when provided', async () => {
    const customUrl = 'https://custom.example.com/kb.zip'
    const fs = new InMemoryFileSystemService({}, '/', '/')
    const capturedUrls: string[] = []

    const checksumResp = toIncomingMessage(buildTestResponse(404))
    const fileResp = toIncomingMessage(buildTestResponse(200, { 'content-length': '1024' }))

    setupCustomUrlMocks(capturedUrls, checksumResp, fileResp)

    await ensureKBAvailable('0.2.0', {
      fs,
      extract: mockExtract,
      customUrl,
    })

    const fileUrl = capturedUrls.find(url => !url.includes('.sha256'))
    expect(fileUrl).toBe(customUrl)
  })
})

describe('KB Manager - Custom URL with default URL', () => {
  it('should use default GitHub URL when custom URL not provided', async () => {
    const fs = new InMemoryFileSystemService({}, '/', '/')
    const capturedUrls: string[] = []

    const checksumResp = toIncomingMessage(buildTestResponse(404))
    const fileResp = toIncomingMessage(buildTestResponse(200, { 'content-length': '1024' }))

    setupCustomUrlMocks(capturedUrls, checksumResp, fileResp)

    await ensureKBAvailable('0.2.0', {
      fs,
      extract: mockExtract,
    })

    const hasGitHubURL = capturedUrls.some(
      url =>
        url.includes('github.com/foomakers/pair/releases') &&
        url.includes('knowledge-base-0.2.0.zip'),
    )
    expect(hasGitHubURL).toBe(true)
  })
})
// NOTE: Download/resume/checksum heavy-integration tests were migrated to their
// owning test suites (`kb-installer.test.ts`, `download-manager.test.ts`,
// `checksum-manager.test.ts`). This file keeps only the API-surface tests for
// `kb-manager` (cache and custom URL passthrough).
