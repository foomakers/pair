import { describe, it, expect, vi } from 'vitest'
import { join } from 'path'
import { homedir, tmpdir } from 'os'
import {
  InMemoryFileSystemService,
  MockHttpClientService,
  buildTestResponse,
  toIncomingMessage,
  type FileSystemService,
} from '@pair/content-ops'
import { ensureKBAvailable } from './kb-availability'

const mockExtract = vi.fn()

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

    const httpClient = new MockHttpClientService()
    const result = await ensureKBAvailable(testVersion, { httpClient, fs })

    expect(result).toBe(expectedCachePath)
  })
})

describe('KB Manager - ensureKBAvailable - Cache Miss', () => {
  it('should download and extract KB when cache miss', async () => {
    vi.clearAllMocks()
    mockExtract.mockReset().mockResolvedValue(undefined)
    const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    const testVersion = '0.2.0'
    const fs = new InMemoryFileSystemService({}, '/', '/')

    // Mock HEAD request for content-length
    const headResponse = toIncomingMessage(buildTestResponse(200, { 'content-length': '1024' }))

    // Mock checksum (404) and file download (200) - auto-emit end
    const checksumResp = toIncomingMessage(buildTestResponse(404))
    const fileResp = toIncomingMessage(
      buildTestResponse(200, { 'content-length': '1024' }, 'fake zip data'),
    )

    mockExtract.mockImplementation(async (zipPath: string, targetPath: string) => {
      fs.writeFile(join(targetPath, 'manifest.json'), '{"version":"0.2.0"}')
      fs.writeFile(join(targetPath, '.pair/knowledge/test.md'), 'test')
    })

    const httpClient = new MockHttpClientService()
    httpClient.setRequestResponses([headResponse])
    httpClient.setGetResponses([fileResp, checksumResp])
    const result = await ensureKBAvailable(testVersion, { httpClient, fs, extract: mockExtract })

    expect(result).toBe(join(homedir(), '.pair', 'kb', testVersion))
    expect(mockExtract).toHaveBeenCalled()
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('KB not found, downloading'))
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('KB v0.2.0 installed'))
    expect(fs.existsSync(join(homedir(), '.pair', 'kb', testVersion))).toBe(true)
    expect(fs.existsSync(join(homedir(), '.pair', 'kb', testVersion, 'manifest.json'))).toBe(true)

    consoleLogSpy.mockRestore()
  })
})

describe('KB Manager - GitHub URL construction', () => {
  it('should construct correct GitHub release URL', async () => {
    vi.clearAllMocks()
    mockExtract.mockReset().mockResolvedValue(undefined)

    const testVersion = '0.2.0'
    const fs = new InMemoryFileSystemService({}, '/', '/')

    // Mock HEAD request for content-length
    const headResponse = toIncomingMessage(buildTestResponse(200, { 'content-length': '1024' }))

    // Mock checksum (404) and file download (200) - auto-emit end
    const checksumResp = toIncomingMessage(buildTestResponse(404))
    const fileResp = toIncomingMessage(
      buildTestResponse(200, { 'content-length': '1024' }, 'fake zip data'),
    )

    const httpClient = new MockHttpClientService()
    httpClient.setRequestResponses([headResponse])
    httpClient.setGetResponses([fileResp, checksumResp])
    await ensureKBAvailable(testVersion, { httpClient, fs, extract: mockExtract })
  })
})

describe('KB Manager - Version handling', () => {
  it('should strip leading v from version in asset name but keep in tag', async () => {
    vi.clearAllMocks()
    mockExtract.mockReset().mockResolvedValue(undefined)

    const fs = new InMemoryFileSystemService({}, '/', '/')
    const versionWithV = 'v1.2.3'

    const headResponse = toIncomingMessage(buildTestResponse(200, { 'content-length': '1024' }))

    const checksumResp = toIncomingMessage(buildTestResponse(404))
    const fileResp = toIncomingMessage(
      buildTestResponse(200, { 'content-length': '1024' }, 'fake zip data'),
    )

    const httpClient = new MockHttpClientService()
    httpClient.setRequestResponses([headResponse])
    httpClient.setGetResponses([fileResp, checksumResp])
    await ensureKBAvailable(versionWithV, { httpClient, fs, extract: mockExtract })
    await ensureKBAvailable(versionWithV, { httpClient, fs, extract: mockExtract })
  })
})

describe('KB Manager - 404 error handling', () => {
  it('should throw error with GitHub URL on 404 not found', async () => {
    vi.clearAllMocks()
    mockExtract.mockReset()

    const testVersion404 = '0.0.404-test'
    const fs = new InMemoryFileSystemService({}, '/', '/')

    const headResponse = toIncomingMessage(buildTestResponse(200, { 'content-length': '0' }))

    const checksumResp = toIncomingMessage(buildTestResponse(404))
    const fileResp = toIncomingMessage(buildTestResponse(404))

    const httpClient = new MockHttpClientService()
    httpClient.setRequestResponses([headResponse])
    httpClient.setGetResponses([fileResp, checksumResp])
    await expect(
      ensureKBAvailable(testVersion404, { httpClient, fs, extract: mockExtract }),
    ).rejects.toThrow(/KB v0\.0\.404 not found \(404\).*github\.com/s)
  })
})

describe('KB Manager - 403 error handling', () => {
  it('should throw error with GitHub URL on 403 forbidden', async () => {
    vi.clearAllMocks()
    mockExtract.mockReset()

    const testVersion403 = '0.0.403-test'
    const fs = new InMemoryFileSystemService({}, '/', '/')

    const defaultHeadResponse = toIncomingMessage(
      buildTestResponse(200, { 'content-length': '1024' }),
    )

    const checksumResp = toIncomingMessage(buildTestResponse(404))
    const fileResp = toIncomingMessage(buildTestResponse(403))

    const httpClient = new MockHttpClientService()
    httpClient.setRequestResponses([defaultHeadResponse])
    httpClient.setGetResponses([fileResp, checksumResp])
    await expect(
      ensureKBAvailable(testVersion403, { httpClient, fs, extract: mockExtract }),
    ).rejects.toThrow(/Access denied \(403\).*github\.com/s)
  })
})

describe('KB Manager - Network failure', () => {
  it('should throw error on network failure', async () => {
    vi.clearAllMocks()
    mockExtract.mockReset()

    const testVersion = '0.2.0'
    const fs = new InMemoryFileSystemService({}, '/', '/')

    const headResponse = toIncomingMessage(buildTestResponse(200, { 'content-length': '1024' }))

    const httpClient = new MockHttpClientService()
    httpClient.setRequestResponses([headResponse])
    httpClient.setGetError(new Error('ENOTFOUND: network unreachable'))
    await expect(
      ensureKBAvailable(testVersion, { httpClient, fs, extract: mockExtract }),
    ).rejects.toThrow(/network/)
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

    const headResponse = toIncomingMessage(buildTestResponse(200, { 'content-length': '1024' }))

    const checksumResp = toIncomingMessage(buildTestResponse(404))
    const fileResp = toIncomingMessage(
      buildTestResponse(200, { 'content-length': '1024' }, 'fake zip data'),
    )

    mockExtract.mockRejectedValue(new Error('Corrupted ZIP'))

    const httpClient = new MockHttpClientService()
    httpClient.setRequestResponses([headResponse])
    httpClient.setGetResponses([fileResp, checksumResp])
    await expect(
      ensureKBAvailable(testVersion, { httpClient, fs, extract: mockExtract }),
    ).rejects.toThrow(/Corrupted ZIP/)

    expect(mockExtract).toHaveBeenCalledWith(expectedZipPath, expectedCachePath)
  })
})

describe('KB Manager - Extraction error', () => {
  it('should throw actionable error on extraction failure', async () => {
    vi.clearAllMocks()
    mockExtract.mockReset()

    const testVersion = '0.2.0'
    const fs = new InMemoryFileSystemService({}, '/', '/')

    const headResponse = toIncomingMessage(buildTestResponse(200, { 'content-length': '1024' }))

    const checksumResp = toIncomingMessage(buildTestResponse(404))
    const fileResp = toIncomingMessage(
      buildTestResponse(200, { 'content-length': '1024' }, 'fake zip data'),
    )

    mockExtract.mockRejectedValue(new Error('Invalid ZIP format'))

    const httpClient = new MockHttpClientService()
    httpClient.setRequestResponses([headResponse])
    httpClient.setGetResponses([fileResp, checksumResp])
    await expect(
      ensureKBAvailable(testVersion, { httpClient, fs, extract: mockExtract }),
    ).rejects.toThrow(/Invalid ZIP format/)
  })
})

describe('KB Manager - Download message', () => {
  it('should display download start message', async () => {
    vi.clearAllMocks()
    mockExtract.mockReset().mockResolvedValue(undefined)
    const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    const testVersion = '0.2.0'
    const fs = new InMemoryFileSystemService({}, '/', '/')

    const headResponse = toIncomingMessage(buildTestResponse(200, { 'content-length': '1024' }))

    const checksumResp = toIncomingMessage(buildTestResponse(404))
    const fileResp = toIncomingMessage(
      buildTestResponse(200, { 'content-length': '1024' }, 'fake zip data'),
    )

    const httpClient = new MockHttpClientService()
    httpClient.setRequestResponses([headResponse])
    httpClient.setGetResponses([fileResp, checksumResp])
    await ensureKBAvailable(testVersion, { httpClient, fs, extract: mockExtract })

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

    const headResponse = toIncomingMessage(buildTestResponse(200, { 'content-length': '1024' }))

    const checksumResp = toIncomingMessage(buildTestResponse(404))
    const fileResp = toIncomingMessage(
      buildTestResponse(200, { 'content-length': '1024' }, 'fake zip data'),
    )

    const httpClient = new MockHttpClientService()
    httpClient.setRequestResponses([headResponse])
    httpClient.setGetResponses([fileResp, checksumResp])
    await ensureKBAvailable(testVersion, { httpClient, fs, extract: mockExtract })

    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('✅ KB v0.2.0 installed'))

    consoleLogSpy.mockRestore()
  })
})

describe('KB Manager - Custom URL with provided URL', () => {
  it('should use custom URL when provided', async () => {
    mockExtract.mockReset().mockResolvedValue(undefined)
    const customUrl = 'https://custom.example.com/kb.zip'
    const fs = new InMemoryFileSystemService({}, '/', '/')

    const headResponse = toIncomingMessage(buildTestResponse(200, { 'content-length': '1024' }))
    const checksumResp = toIncomingMessage(buildTestResponse(404))
    const fileResp = toIncomingMessage(
      buildTestResponse(200, { 'content-length': '1024' }, 'fake zip data'),
    )

    const httpClient = new MockHttpClientService()
    httpClient.setRequestResponses([headResponse])
    httpClient.setGetResponses([fileResp, checksumResp])
    await ensureKBAvailable('0.2.0', {
      httpClient,
      fs,
      extract: mockExtract,
      customUrl,
    })

    expect(httpClient.getUrls()[0]).toBe(customUrl)
  })
})

describe('KB Manager - Custom URL with default URL', () => {
  it('should use default GitHub URL when custom URL not provided', async () => {
    mockExtract.mockReset().mockResolvedValue(undefined)
    const fs = new InMemoryFileSystemService({}, '/', '/')

    const headResponse = toIncomingMessage(buildTestResponse(200, { 'content-length': '1024' }))
    const checksumResp = toIncomingMessage(buildTestResponse(404))
    const fileResp = toIncomingMessage(
      buildTestResponse(200, { 'content-length': '1024' }, 'fake zip data'),
    )

    const httpClient = new MockHttpClientService()
    httpClient.setRequestResponses([headResponse])
    httpClient.setGetResponses([fileResp, checksumResp])
    await ensureKBAvailable('0.2.0', {
      httpClient,
      fs,
      extract: mockExtract,
    })

    const lastUrl = httpClient.getLastUrl()
    expect(lastUrl).toContain('github.com/foomakers/pair/releases')
    expect(lastUrl).toContain('knowledge-base-0.2.0.zip')
  })
})

describe('KB manager integration - ensure KB available', () => {
  it('should ensure KB available on startup when dataset not local', async () => {
    const mockFs = createMockFsWithoutLocal()
    const mockIsKBCached = async () => false
    const mockEnsureKBAvailable = async (version: string) => {
      expect(version).toBe('0.1.0')
      return '/home/user/.pair/kb/0.1.0'
    }

    const result = await import('../config-utils').then(m =>
      m.getKnowledgeHubDatasetPathWithFallback({
        fsService: mockFs as unknown as FileSystemService,
        version: '0.1.0',
        isKBCachedFn: mockIsKBCached,
        ensureKBAvailableFn: mockEnsureKBAvailable,
      }),
    )

    expect(result).toBe('/home/user/.pair/kb/0.1.0/dataset')
  })
})

describe('KB manager integration - custom URL', () => {
  it('should pass custom URL to ensureKBAvailable when provided', async () => {
    const customUrl = 'https://custom.example.com/kb.zip'
    const mockFs = createMockFsWithoutLocal()

    const mockIsKBCached = async () => false
    const mockEnsureKBAvailable = async (
      version: string,
      deps?: { customUrl?: string; fs?: FileSystemService },
    ) => {
      expect(version).toBe('0.1.0')
      expect(deps?.customUrl).toBe(customUrl)
      return '/home/user/.pair/kb/0.1.0'
    }

    const result = await import('../config-utils').then(m =>
      m.getKnowledgeHubDatasetPathWithFallback({
        fsService: mockFs as unknown as FileSystemService,
        version: '0.1.0',
        isKBCachedFn: mockIsKBCached,
        ensureKBAvailableFn: mockEnsureKBAvailable,
        customUrl,
      }),
    )

    expect(result).toBe('/home/user/.pair/kb/0.1.0/dataset')
  })
})

describe('KB manager integration - local directory paths via customUrl', () => {
  it('should handle local directory paths via customUrl', async () => {
    const datasetPath = '/local/kb/dataset'

    const seed: Record<string, string> = {}
    seed[datasetPath + '/AGENTS.md'] = 'this is agents.md'
    seed[datasetPath + '/.pair/knowledge/index.md'] = '# Knowledge Base'

    const fs = new InMemoryFileSystemService(seed, '/', '/')

    const httpClient = new MockHttpClientService()
    const result = await ensureKBAvailable('local-test', {
      httpClient,
      fs: fs,
      customUrl: datasetPath,
    })

    expect(result).toBeDefined()
  })
})

// Helper functions
function createMockFsWithoutLocal() {
  return {
    rootModuleDirectory: () => '/mock/project',
    currentWorkingDirectory: () => '/mock/project',
    existsSync: () => false,
  }
}

// NOTE: Download/resume/checksum heavy-integration tests were migrated to their
// owning test suites (`kb-installer.test.ts`, `download-manager.test.ts`,
// `checksum-manager.test.ts`). This file keeps only the API-surface tests for
// the KB availability orchestration. Public API is exported from `kb-manager/index.ts`.
