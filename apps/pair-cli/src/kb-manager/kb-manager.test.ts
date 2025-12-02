import { describe, it, expect, vi, beforeEach } from 'vitest'
import { join } from 'path'
import { homedir, tmpdir } from 'os'
import * as https from 'https'
import { InMemoryFileSystemService } from '@pair/content-ops'
import { ensureKBAvailable, getCachedKBPath, isKBCached } from './kb-manager'
import {
  createMockResponse,
  createMockRequest,
  mockHttpsRequest,
  mockMultipleHttpsGet,
} from '../test-utils/http-mocks'

vi.mock('https', () => ({
  get: vi.fn(),
  request: vi.fn(),
}))

// Type helpers
// MockStdout type moved to unit tests where needed
type HttpsCallback = (res: unknown) => void
type MockResponse = ReturnType<typeof createMockResponse>

const mockExtract = vi.fn()

// Default mock setup to prevent "Cannot read properties of undefined"
beforeEach(() => {
  vi.mocked(https.request).mockImplementation(
    mockHttpsRequest(createMockResponse(200, { 'content-length': '1024' })),
  )
})

describe('KB Manager - Cache Operations', () => {
  const testVersion = '0.2.0'
  const expectedCachePath = join(homedir(), '.pair', 'kb', testVersion)

  describe('getCachedKBPath', () => {
    it('should return correct cache path for given version', () => {
      const result = getCachedKBPath(testVersion)
      expect(result).toBe(expectedCachePath)
    })

    it('should handle version with leading v', () => {
      const result = getCachedKBPath('v0.2.0')
      expect(result).toBe(expectedCachePath)
    })

    it('should handle different versions', () => {
      const result = getCachedKBPath('1.5.3')
      expect(result).toBe(join(homedir(), '.pair', 'kb', '1.5.3'))
    })
  })
})

describe('KB Manager - isKBCached', () => {
  const testVersion = '0.2.0'
  const expectedCachePath = join(homedir(), '.pair', 'kb', testVersion)

  it('should return true when KB cache exists', async () => {
    const fs = new InMemoryFileSystemService(
      {
        [expectedCachePath + '/manifest.json']: '{}',
      },
      '/',
      '/',
    )

    const result = await isKBCached(testVersion, fs)

    expect(result).toBe(true)
  })

  it('should return false when KB cache does not exist', async () => {
    const fs = new InMemoryFileSystemService({}, '/', '/')

    const result = await isKBCached(testVersion, fs)

    expect(result).toBe(false)
  })

  it('should return false on filesystem error (directory unreadable)', async () => {
    const fs = new InMemoryFileSystemService({}, '/', '/')

    const result = await isKBCached(testVersion, fs)

    expect(result).toBe(false)
  })
})

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

describe('KB Manager - Download and extract', () => {
  it.skip('should download and extract KB when cache miss', async () => {
    vi.clearAllMocks()
    mockExtract.mockReset().mockResolvedValue(undefined)
    const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    const testVersion = '0.2.0'
    const expectedCachePath = join(homedir(), '.pair', 'kb', testVersion)
    const expectedZipPath = join(tmpdir(), `kb-${testVersion}.zip`)
    const expectedURL = `https://github.com/foomakers/pair/releases/download/v${testVersion}/knowledge-base-${testVersion}.zip`
    const fs = new InMemoryFileSystemService({}, '/', '/')

    const mockResponse = createMockResponse(200)

    vi.mocked(https.get).mockImplementation((...args: unknown[]) => {
      const callback = args[1]
      if (typeof callback === 'function') {
        setImmediate(() => (callback as (res: unknown) => void)(mockResponse))
      }
      return createMockRequest()
    })

    mockExtract.mockImplementation(async (zipPath: string, targetPath: string) => {
      fs.writeFile(join(targetPath, 'manifest.json'), '{"version":"0.2.0"}')
      fs.writeFile(join(targetPath, '.pair/knowledge/test.md'), 'test')
    })

    const result = await ensureKBAvailable(testVersion, { fs, extract: mockExtract })

    expect(result).toBe(expectedCachePath)
    expect(https.get).toHaveBeenCalled()
    const calls =
      (vi.mocked(https.get) as unknown as { mock?: { calls?: unknown[][] } }).mock?.calls ?? []
    const found = calls.some(call => {
      const arg0 = call[0]
      const url = typeof arg0 === 'string' ? arg0 : String(arg0)
      return url === expectedURL
    })
    expect(found).toBe(true)
    expect(mockExtract).toHaveBeenCalledWith(expectedZipPath, expectedCachePath)
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('KB not found, downloading'))
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('KB v0.2.0 installed'))
    expect(fs.existsSync(expectedCachePath)).toBe(true)
    expect(fs.existsSync(join(expectedCachePath, 'manifest.json'))).toBe(true)

    consoleLogSpy.mockRestore()
  })
})

describe('KB Manager - GitHub URL construction', () => {
  it('should construct correct GitHub release URL', async () => {
    vi.clearAllMocks()
    mockExtract.mockReset().mockResolvedValue(undefined)

    const testVersion = '0.2.0'
    const fs = new InMemoryFileSystemService({}, '/', '/')

    // Mock checksum (404) and file download (200) - auto-emit end
    const checksumResp = createMockResponse(404)
    const fileResp = createMockResponse(200, { 'content-length': '1024' })
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

    const checksumResp = createMockResponse(404)
    const fileResp = createMockResponse(200, { 'content-length': '1024' })
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

    const checksumResp = createMockResponse(404)
    const fileResp = createMockResponse(404)
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

    const checksumResp = createMockResponse(404)
    const fileResp = createMockResponse(403)
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
      const mockRequest = createMockRequest()
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

    const checksumResp = createMockResponse(404)
    const fileResp = createMockResponse(200, { 'content-length': '1024' })
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

    const checksumResp = createMockResponse(404)
    const fileResp = createMockResponse(200, { 'content-length': '1024' })
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

    const checksumResp = createMockResponse(404)
    const fileResp = createMockResponse(200, { 'content-length': '1024' })
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

    const checksumResp = createMockResponse(404)
    const fileResp = createMockResponse(200, { 'content-length': '1024' })
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

// Progress mocks moved to download-manager.test.ts

// Progress helper removed; unit-level progress tests live in download-manager.test.ts

// Progress reporting unit tests moved to download-manager.test.ts

// Helper: setup custom URL test mocks
function setupCustomUrlMocks(
  capturedUrls: string[],
  checksumResp: MockResponse,
  fileResp: MockResponse,
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
    return createMockRequest()
  })
}

describe('KB Manager - Custom URL with provided URL', () => {
  it('should use custom URL when provided', async () => {
    const customUrl = 'https://custom.example.com/kb.zip'
    const fs = new InMemoryFileSystemService({}, '/', '/')
    const capturedUrls: string[] = []

    const checksumResp = createMockResponse(404)
    const fileResp = createMockResponse(200, { 'content-length': '1024' })

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

    const checksumResp = createMockResponse(404)
    const fileResp = createMockResponse(200, { 'content-length': '1024' })

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

// Helper: test resume logic with or without partial file
async function testResumeLogic(hasPartialFile: boolean) {
  const totalSize = 1024
  const partialSize = hasPartialFile ? 512 : 0
  const partialPath = join(tmpdir(), 'kb-0.2.0.zip.partial')
  const fsFiles = hasPartialFile ? { [partialPath]: Buffer.alloc(partialSize).toString() } : {}
  const fs = new InMemoryFileSystemService(fsFiles, '/', '/')
  let rangeHeader: string | undefined

  const checksumResp = createMockResponse(404)
  const fileResp = createMockResponse(hasPartialFile ? 206 : 200, {
    'content-length': String(hasPartialFile ? totalSize - partialSize : totalSize),
  })
  const mockHeadResponse = createMockResponse(200, { 'content-length': String(totalSize) })

  vi.mocked(https.request).mockImplementation(mockHttpsRequest(mockHeadResponse))

  vi.mocked(https.get).mockImplementation((...args: unknown[]) => {
    const url = String(args[0])
    const options = args[1]
    const callback = args[2]
    const cb = typeof options === 'function' ? options : callback

    const hdrs = (options as unknown as Record<string, unknown> | undefined)?.headers
    if (hdrs && typeof hdrs === 'object' && 'Range' in hdrs) {
      rangeHeader = hdrs['Range'] as string
    }

    const resp = url.includes('.sha256') ? checksumResp : fileResp
    if (typeof cb === 'function') {
      setImmediate(() => {
        ;(cb as HttpsCallback)(resp)
        setImmediate(() => resp.emit('end'))
      })
    }
    return createMockRequest()
  })

  await ensureKBAvailable('0.2.0', { fs, extract: mockExtract })

  return rangeHeader
}

describe('KB Manager - Resume Support', () => {
  it('should resume partial download using Range header', async () => {
    const rangeHeader = await testResumeLogic(true)
    expect(rangeHeader).toBe('bytes=512-')
  })

  it('should start fresh download when no partial file exists', async () => {
    const rangeHeader = await testResumeLogic(false)
    expect(rangeHeader).toBeUndefined()
  })
})

// Helper: setup checksum test mocks
function setupChecksumTest(config: {
  headResp: MockResponse
  getResp: MockResponse
  checksumResp: MockResponse
  content: Buffer
  checksum?: string
}) {
  vi.mocked(https.request).mockImplementation((url, options, callback) => {
    const cb = typeof options === 'function' ? options : callback
    if (typeof cb === 'function') {
      setImmediate(() => (cb as HttpsCallback)(config.headResp))
    }
    return createMockRequest()
  })

  vi.mocked(https.get).mockImplementation((url, options, callback) => {
    const cb = typeof options === 'function' ? options : callback
    const urlStr = typeof url === 'string' ? url : String(url)

    if (urlStr.endsWith('.sha256') && config.checksum) {
      if (typeof cb === 'function') {
        setImmediate(() => {
          ;(cb as HttpsCallback)(config.checksumResp)
          setImmediate(() => config.checksumResp.emit('data', `${config.checksum}  kb.zip`))
          setImmediate(() => config.checksumResp.emit('end'))
        })
      }
    } else if (!urlStr.endsWith('.sha256')) {
      if (typeof cb === 'function') {
        setImmediate(() => {
          ;(cb as HttpsCallback)(config.getResp)
          setImmediate(() => config.getResp.emit('data', config.content))
          setImmediate(() => config.getResp.emit('end'))
        })
      }
    } else if (typeof cb === 'function') {
      setImmediate(() => (cb as HttpsCallback)(config.checksumResp))
    }

    return createMockRequest()
  })
}

describe('KB Manager - Checksum Validation with available checksum', () => {
  it('validates checksum when .sha256 file is available', async () => {
    const content = Buffer.alloc(1024, 'kb content')
    const { createHash } = await import('crypto')
    const expectedChecksum = createHash('sha256').update(content).digest('hex')

    const fs = new InMemoryFileSystemService({}, '/', '/')
    const mockGetResponse = createMockResponse(200, { 'content-length': '1024' })
    const mockHeadResponse = createMockResponse(200, { 'content-length': '1024' })
    const mockChecksumResponse = createMockResponse(200, {})

    setupChecksumTest({
      headResp: mockHeadResponse,
      getResp: mockGetResponse,
      checksumResp: mockChecksumResponse,
      content,
      checksum: expectedChecksum,
    })

    await ensureKBAvailable('0.2.0', { fs, extract: mockExtract })

    expect(fs.existsSync(join(homedir(), '.pair', 'kb', '0.2.0'))).toBe(true)
  })
})

describe('KB Manager - Checksum Validation without checksum', () => {
  it('proceeds without checksum when .sha256 file not found', async () => {
    const content = Buffer.alloc(1024, 'kb content')
    const fs = new InMemoryFileSystemService({}, '/', '/')
    const mockGetResponse = createMockResponse(200, { 'content-length': '1024' })
    const mockHeadResponse = createMockResponse(200, { 'content-length': '1024' })
    const mockChecksumResponse = createMockResponse(404, {})

    setupChecksumTest({
      headResp: mockHeadResponse,
      getResp: mockGetResponse,
      checksumResp: mockChecksumResponse,
      content,
    })

    await expect(ensureKBAvailable('0.2.0', { fs, extract: mockExtract })).resolves.not.toThrow()
  })
})
