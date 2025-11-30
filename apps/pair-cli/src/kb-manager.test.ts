import { describe, it, expect, vi } from 'vitest'
import { join } from 'path'
import { homedir, tmpdir } from 'os'
import * as https from 'https'
import { InMemoryFileSystemService } from '@pair/content-ops'
import { ensureKBAvailable, getCachedKBPath, isKBCached } from './kb-manager'
import { createMockResponse, createMockRequest } from './test-utils/http-mocks'

vi.mock('https', () => ({
  get: vi.fn(),
}))

const mockExtract = vi.fn()

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
  it('reports download progress with percentage and speed', async () => {
    vi.clearAllMocks()
    mockExtract.mockReset().mockResolvedValue(undefined)

    const testVersion = '0.2.0'
    const fs = new InMemoryFileSystemService({}, '/', '/')
    const mockStdout = { write: vi.fn() }

    const mockResponse = createMockResponse(200, { 'content-length': '1024' })

    vi.mocked(https.get).mockImplementation((url, callback) => {
      if (typeof callback === 'function') {
        setImmediate(() => {
          ;(callback as (res: unknown) => void)(mockResponse)
          // Simulate data chunks
          setImmediate(() => mockResponse.emit('data', Buffer.alloc(512)))
          setImmediate(() => mockResponse.emit('data', Buffer.alloc(512)))
          setImmediate(() => mockResponse.emit('end'))
        })
      }
      return createMockRequest()
    })

    await ensureKBAvailable(testVersion, {
      fs,
      extract: mockExtract,
      progressWriter: mockStdout as any,
    })

    // Verify progress was reported
    expect(mockStdout.write).toHaveBeenCalled()
    const calls = mockStdout.write.mock.calls.map(c => c[0])
    const hasPercentage = calls.some(c => c.includes('%'))
    expect(hasPercentage).toBe(true)
  })

  it('uses TTY mode for progress when isTTY is true', async () => {
    vi.clearAllMocks()
    mockExtract.mockReset().mockResolvedValue(undefined)

    const testVersion = '0.2.0'
    const fs = new InMemoryFileSystemService({}, '/', '/')
    const mockStdout = { write: vi.fn() }

    const mockResponse = createMockResponse(200, { 'content-length': '1024' })

    vi.mocked(https.get).mockImplementation((url, callback) => {
      if (typeof callback === 'function') {
        setImmediate(() => {
          ;(callback as (res: unknown) => void)(mockResponse)
          setImmediate(() => mockResponse.emit('data', Buffer.alloc(512)))
          setImmediate(() => mockResponse.emit('end'))
        })
      }
      return createMockRequest()
    })

    await ensureKBAvailable(testVersion, {
      fs,
      extract: mockExtract,
      progressWriter: mockStdout as any,
      isTTY: true,
    })

    // TTY mode uses \r for inline updates
    const calls = mockStdout.write.mock.calls.map(c => c[0])
    const hasCarriageReturn = calls.some(c => c.includes('\r'))
    expect(hasCarriageReturn).toBe(true)
  })

  it('uses non-TTY mode for progress when isTTY is false', async () => {
    vi.clearAllMocks()
    mockExtract.mockReset().mockResolvedValue(undefined)

    const testVersion = '0.2.0'
    const fs = new InMemoryFileSystemService({}, '/', '/')
    const mockStdout = { write: vi.fn() }

    const mockResponse = createMockResponse(200, { 'content-length': '1024' })

    vi.mocked(https.get).mockImplementation((url, callback) => {
      if (typeof callback === 'function') {
        setImmediate(() => {
          ;(callback as (res: unknown) => void)(mockResponse)
          setImmediate(() => mockResponse.emit('data', Buffer.alloc(512)))
          setImmediate(() => mockResponse.emit('end'))
        })
      }
      return createMockRequest()
    })

    await ensureKBAvailable(testVersion, {
      fs,
      extract: mockExtract,
      progressWriter: mockStdout as any,
      isTTY: false,
    })

    // Non-TTY mode uses simple logs with "Downloading"
    const calls = mockStdout.write.mock.calls.map(c => c[0])
    const hasDownloadingText = calls.some(c => c.includes('Downloading'))
    expect(hasDownloadingText).toBe(true)
  })
})

describe('KB Manager - Custom URL', () => {
  const testVersion = '0.2.0'

  it('should use custom URL when provided', async () => {
    const customUrl = 'https://custom.example.com/kb.zip'
    const fs = new InMemoryFileSystemService({}, '/', '/')
    const mockResponse = createMockResponse(200, { 'content-length': '1024' })
    let capturedUrl = ''

    vi.mocked(https.get).mockImplementation((url, callback) => {
      capturedUrl = typeof url === 'string' ? url : url.toString()
      if (typeof callback === 'function') {
        setImmediate(() => {
          ;(callback as (res: unknown) => void)(mockResponse)
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

    expect(capturedUrl).toBe(customUrl)
  })

  it('should use default GitHub URL when custom URL not provided', async () => {
    const fs = new InMemoryFileSystemService({}, '/', '/')
    const mockResponse = createMockResponse(200, { 'content-length': '1024' })
    let capturedUrl = ''

    vi.mocked(https.get).mockImplementation((url, callback) => {
      capturedUrl = typeof url === 'string' ? url : url.toString()
      if (typeof callback === 'function') {
        setImmediate(() => {
          ;(callback as (res: unknown) => void)(mockResponse)
          setImmediate(() => mockResponse.emit('data', Buffer.alloc(512)))
          setImmediate(() => mockResponse.emit('end'))
        })
      }
      return createMockRequest()
    })

    await ensureKBAvailable(testVersion, {
      fs,
      extract: mockExtract,
    })

    expect(capturedUrl).toContain('github.com/foomakers/pair/releases')
    expect(capturedUrl).toContain('knowledge-base-0.2.0.zip')
  })
})
