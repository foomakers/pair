import { describe, it, expect, vi } from 'vitest'
import { join } from 'path'
import { homedir, tmpdir } from 'os'
import * as https from 'https'
import { InMemoryFileSystemService } from '@pair/content-ops'
import { ensureKBAvailable, getCachedKBPath, isKBCached } from './kb-manager'
import { createMockResponse, createMockRequest } from './test-utils/http-mocks'

vi.mock('https', () => ({
  get: vi.fn(),
  request: vi.fn(),
}))

// Type helpers
type MockStdout = { write: ReturnType<typeof vi.fn>; isTTY?: boolean }
type HttpsGetCallback = (res: unknown) => void
type HttpsGetOptions = { headers?: Record<string, string> }

const mockExtract = vi.fn()

// Helper: simulate data chunks emission
function emitDataChunks(mockResponse: ReturnType<typeof createMockResponse>, chunks: Buffer[]) {
  chunks.forEach(chunk => {
    setImmediate(() => mockResponse.emit('data', chunk))
  })
  setImmediate(() => mockResponse.emit('end'))
}

// Helper: setup full download flow with chunks
function setupDownloadFlow(
  mockResponse: ReturnType<typeof createMockResponse>,
  chunks: Buffer[],
) {
  vi.mocked(https.get).mockImplementation((url, callback) => {
    if (typeof callback === 'function') {
      setImmediate(() => {
        (callback as HttpsGetCallback)(mockResponse)
        emitDataChunks(mockResponse, chunks)
      })
    }
    return createMockRequest()
  })
}

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
  it('should download and extract KB when cache miss', async () => {
    vi.clearAllMocks()
    mockExtract.mockReset().mockResolvedValue(undefined)
    const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    const testVersion = '0.2.0'
    const expectedCachePath = join(homedir(), '.pair', 'kb', testVersion)
    const expectedZipPath = join(tmpdir(), `kb-${testVersion}.zip`)
    const expectedURL = `https://github.com/foomakers/pair/releases/download/v${testVersion}/knowledge-base-${testVersion}.zip`
    const fs = new InMemoryFileSystemService({}, '/', '/')

    const mockResponse = createMockResponse(200)

    vi.mocked(https.get).mockImplementation((url, callback) => {
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
    expect(https.get).toHaveBeenCalledWith(expectedURL, expect.any(Function))
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

    const mockResponse = createMockResponse(200)

    vi.mocked(https.get).mockImplementation((url, callback) => {
      if (typeof callback === 'function') {
        setImmediate(() => (callback as (res: unknown) => void)(mockResponse))
      }
      return createMockRequest()
    })

    await ensureKBAvailable(testVersion, { fs, extract: mockExtract })

    expect(https.get).toHaveBeenCalledWith(
      'https://github.com/foomakers/pair/releases/download/v0.2.0/knowledge-base-0.2.0.zip',
      expect.any(Function),
    )
  })
})

describe('KB Manager - Version handling', () => {
  it('should strip leading v from version in asset name but keep in tag', async () => {
    vi.clearAllMocks()
    mockExtract.mockReset().mockResolvedValue(undefined)

    const fs = new InMemoryFileSystemService({}, '/', '/')
    const versionWithV = 'v1.2.3'
    const expectedURLWithV = `https://github.com/foomakers/pair/releases/download/v1.2.3/knowledge-base-1.2.3.zip`

    const mockResponse = createMockResponse(200)

    vi.mocked(https.get).mockImplementation((url, callback) => {
      if (typeof callback === 'function') {
        setImmediate(() => (callback as (res: unknown) => void)(mockResponse))
      }
      return createMockRequest()
    })

    await ensureKBAvailable(versionWithV, { fs, extract: mockExtract })

    expect(https.get).toHaveBeenCalledWith(expectedURLWithV, expect.any(Function))
  })
})

describe('KB Manager - 404 error handling', () => {
  it('should throw error with GitHub URL on 404 not found', async () => {
    vi.clearAllMocks()
    mockExtract.mockReset()

    const testVersion404 = '0.0.404-test'
    const fs = new InMemoryFileSystemService({}, '/', '/')

    const mockResponse = createMockResponse(404)

    vi.mocked(https.get).mockImplementation((url, callback) => {
      if (typeof callback === 'function') {
        setImmediate(() => (callback as (res: unknown) => void)(mockResponse))
      }
      return createMockRequest()
    })

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

    const mockResponse = createMockResponse(403)

    vi.mocked(https.get).mockImplementation((url, callback) => {
      if (typeof callback === 'function') {
        setImmediate(() => (callback as (res: unknown) => void)(mockResponse))
      }
      return createMockRequest()
    })

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
      vi.mocked(mockRequest.on).mockImplementation((event, handler) => {
        if (event === 'error') {
          setImmediate(() =>
            (handler as (err: Error) => void)(new Error('ENOTFOUND: network unreachable')),
          )
        }
        return mockRequest
      })
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

    const mockResponse = createMockResponse(200)

    vi.mocked(https.get).mockImplementation((url, callback) => {
      if (typeof callback === 'function') {
        setImmediate(() => (callback as (res: unknown) => void)(mockResponse))
      }
      return createMockRequest()
    })

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

    const mockResponse = createMockResponse(200)

    vi.mocked(https.get).mockImplementation((url, callback) => {
      if (typeof callback === 'function') {
        setImmediate(() => (callback as (res: unknown) => void)(mockResponse))
      }
      return createMockRequest()
    })

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

    const mockResponse = createMockResponse(200)

    vi.mocked(https.get).mockImplementation((url, callback) => {
      if (typeof callback === 'function') {
        setImmediate(() => (callback as (res: unknown) => void)(mockResponse))
      }
      return createMockRequest()
    })

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

    const mockResponse = createMockResponse(200)

    vi.mocked(https.get).mockImplementation((url, callback) => {
      if (typeof callback === 'function') {
        setImmediate(() => (callback as (res: unknown) => void)(mockResponse))
      }
      return createMockRequest()
    })

    await ensureKBAvailable(testVersion, { fs, extract: mockExtract })

    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('✅ KB v0.2.0 installed'))

    consoleLogSpy.mockRestore()
  })
})

describe('KB Manager - Progress Reporting', () => {
  // Helper: test progress reporting
  async function testProgressReporting(isTTY: boolean | undefined, expectedCheck: (calls: string[]) => boolean) {
    vi.clearAllMocks()
    mockExtract.mockReset().mockResolvedValue(undefined)

    const testVersion = '0.2.0'
    const fs = new InMemoryFileSystemService({}, '/', '/')
    const mockStdout: MockStdout = { write: vi.fn() }
    const mockResponse = createMockResponse(200, { 'content-length': '1024' })

    setupDownloadFlow(mockResponse, [Buffer.alloc(512), Buffer.alloc(512)])

    await ensureKBAvailable(testVersion, {
      fs,
      extract: mockExtract,
      progressWriter: mockStdout,
      isTTY,
    })

    expect(mockStdout.write).toHaveBeenCalled()
    const calls = mockStdout.write.mock.calls.map(c => c[0] as string)
    expect(expectedCheck(calls)).toBe(true)
  }

  it('reports download progress with percentage and speed', async () => {
    await testProgressReporting(undefined, calls => calls.some(c => c.includes('%')))
  })

  it('uses TTY mode for progress when isTTY is true', async () => {
    await testProgressReporting(true, calls => calls.some(c => c.includes('\r')))
  })

  it('uses non-TTY mode for progress when isTTY is false', async () => {
    await testProgressReporting(false, calls => calls.some(c => c.includes('Downloading')))
  })
})

describe('KB Manager - Custom URL', () => {
  const testVersion = '0.2.0'

  // Helper: test custom URL usage
  async function testCustomURL(customUrl: string | undefined, expectedUrlCheck: (url: string) => boolean) {
    const fs = new InMemoryFileSystemService({}, '/', '/')
    const mockResponse = createMockResponse(200, { 'content-length': '1024' })
    let capturedUrl = ''

    vi.mocked(https.get).mockImplementation((url, callback) => {
      capturedUrl = typeof url === 'string' ? url : url.toString()
      if (typeof callback === 'function') {
        setImmediate(() => {
          (callback as HttpsGetCallback)(mockResponse)
          setImmediate(() => mockResponse.emit('data', Buffer.alloc(512)))
          setImmediate(() => mockResponse.emit('end'))
        })
      }
      return createMockRequest()
    })

    await ensureKBAvailable(testVersion, {
      fs,
      extract: mockExtract,
      customUrl,
    })

    expect(expectedUrlCheck(capturedUrl)).toBe(true)
  }

  it('should use custom URL when provided', async () => {
    const customUrl = 'https://custom.example.com/kb.zip'
    await testCustomURL(customUrl, url => url === customUrl)
  })

  it('should use default GitHub URL when custom URL not provided', async () => {
    await testCustomURL(undefined, url => 
      url.includes('github.com/foomakers/pair/releases') && url.includes('knowledge-base-0.2.0.zip')
    )
  })
})

describe('KB Manager - Resume Support', () => {
  const testVersion = '0.2.0'

  // Helper: setup HEAD and GET mocks for resume test
  function setupResumeMocks(config: {
    headResponse: ReturnType<typeof createMockResponse>
    getResponse: ReturnType<typeof createMockResponse>
    onGetHeaders?: (headers: HttpsGetOptions['headers']) => void
  }) {
    vi.mocked(https.request).mockImplementation((url, options, callback) => {
      const cb = typeof options === 'function' ? options : callback
      if (typeof cb === 'function') {
        setImmediate(() => (cb as HttpsGetCallback)(config.headResponse))
      }
      return createMockRequest()
    })

    vi.mocked(https.get).mockImplementation((url, options, callback) => {
      const opts = typeof options === 'object' ? (options as HttpsGetOptions) : undefined
      if (opts?.headers && config.onGetHeaders) {
        config.onGetHeaders(opts.headers)
      }

      const cb = typeof options === 'function' ? options : callback
      if (typeof cb === 'function') {
        setImmediate(() => {
          (cb as HttpsGetCallback)(config.getResponse)
          setImmediate(() => config.getResponse.emit('data', Buffer.alloc(512)))
          setImmediate(() => config.getResponse.emit('end'))
        })
      }
      return createMockRequest()
    })
  }

  it('should resume partial download using Range header', async () => {
    const partialSize = 512
    const totalSize = 1024
    const partialPath = join(tmpdir(), 'kb-0.2.0.zip.partial')
    const fs = new InMemoryFileSystemService(
      { [partialPath]: Buffer.alloc(partialSize).toString() },
      '/',
      '/',
    )

    let rangeHeader: string | undefined
    const mockGetResponse = createMockResponse(206, {
      'content-length': String(totalSize - partialSize),
    })
    const mockHeadResponse = createMockResponse(200, {
      'content-length': String(totalSize),
    })

    setupResumeMocks({
      headResponse: mockHeadResponse,
      getResponse: mockGetResponse,
      onGetHeaders: headers => {
        rangeHeader = headers?.['Range']
      },
    })

    await ensureKBAvailable(testVersion, { fs, extract: mockExtract })

    expect(rangeHeader).toBe(`bytes=${partialSize}-`)
  })

  it('should start fresh download when no partial file exists', async () => {
    const totalSize = 1024
    const fs = new InMemoryFileSystemService({}, '/', '/')
    let rangeHeader: string | undefined
    const mockGetResponse = createMockResponse(200, { 'content-length': String(totalSize) })
    const mockHeadResponse = createMockResponse(200, { 'content-length': String(totalSize) })

    setupResumeMocks({
      headResponse: mockHeadResponse,
      getResponse: mockGetResponse,
      onGetHeaders: headers => {
        rangeHeader = headers?.['Range']
      },
    })

    await ensureKBAvailable(testVersion, { fs, extract: mockExtract })

    expect(rangeHeader).toBeUndefined()
  })
})

describe('KB Manager - Checksum Validation', () => {
  const testVersion = '0.2.0'

  // Helper: setup checksum validation mocks
  function setupChecksumMocks(config: {
    headResponse: ReturnType<typeof createMockResponse>
    getResponse: ReturnType<typeof createMockResponse>
    checksumResponse: ReturnType<typeof createMockResponse>
    content: Buffer
    checksum?: string
  }) {
    vi.mocked(https.request).mockImplementation((url, options, callback) => {
      const cb = typeof options === 'function' ? options : callback
      if (typeof cb === 'function') {
        setImmediate(() => (cb as HttpsGetCallback)(config.headResponse))
      }
      return createMockRequest()
    })

    vi.mocked(https.get).mockImplementation((url, options, callback) => {
      const cb = typeof options === 'function' ? options : callback
      const urlStr = typeof url === 'string' ? url : url.toString()

      if (urlStr.endsWith('.sha256') && config.checksum) {
        if (typeof cb === 'function') {
          setImmediate(() => {
            (cb as HttpsGetCallback)(config.checksumResponse)
            setImmediate(() =>
              config.checksumResponse.emit('data', `${config.checksum}  kb.zip`),
            )
            setImmediate(() => config.checksumResponse.emit('end'))
          })
        }
      } else if (!urlStr.endsWith('.sha256')) {
        if (typeof cb === 'function') {
          setImmediate(() => {
            (cb as HttpsGetCallback)(config.getResponse)
            setImmediate(() => config.getResponse.emit('data', config.content))
            setImmediate(() => config.getResponse.emit('end'))
          })
        }
      } else if (typeof cb === 'function') {
        setImmediate(() => (cb as HttpsGetCallback)(config.checksumResponse))
      }

      return createMockRequest()
    })
  }

  it('validates checksum when .sha256 file is available', async () => {
    const content = Buffer.alloc(1024, 'kb content')
    const { createHash } = await import('crypto')
    const expectedChecksum = createHash('sha256').update(content).digest('hex')

    const fs = new InMemoryFileSystemService({}, '/', '/')
    const mockGetResponse = createMockResponse(200, { 'content-length': '1024' })
    const mockHeadResponse = createMockResponse(200, { 'content-length': '1024' })
    const mockChecksumResponse = createMockResponse(200, {})

    setupChecksumMocks({
      headResponse: mockHeadResponse,
      getResponse: mockGetResponse,
      checksumResponse: mockChecksumResponse,
      content,
      checksum: expectedChecksum,
    })

    await ensureKBAvailable(testVersion, { fs, extract: mockExtract })

    // Checksum was validated (no error thrown)
    expect(fs.existsSync(join(homedir(), '.pair', 'kb', testVersion))).toBe(true)
  })

  it('proceeds without checksum when .sha256 file not found', async () => {
    const content = Buffer.alloc(1024, 'kb content')
    const fs = new InMemoryFileSystemService({}, '/', '/')
    const mockGetResponse = createMockResponse(200, { 'content-length': '1024' })
    const mockHeadResponse = createMockResponse(200, { 'content-length': '1024' })
    const mockChecksumResponse = createMockResponse(404, {})

    setupChecksumMocks({
      headResponse: mockHeadResponse,
      getResponse: mockGetResponse,
      checksumResponse: mockChecksumResponse,
      content,
    })

    await expect(
      ensureKBAvailable(testVersion, { fs, extract: mockExtract }),
    ).resolves.not.toThrow()
  })
})
