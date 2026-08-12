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
import { downloadStagingName, getSourceCachePath, OFFICIAL_KB_NAME } from './cache-slot-key'
import { buildGithubReleaseUrl } from './url-utils'

// Helper to create valid ZIP data for InMemoryFileSystemService
function createValidZipData(files: Record<string, string>): string {
  return JSON.stringify(files)
}

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

    // Cache hit returns the cache path directly (no subfolder logic)
    expect(result).toBe(expectedCachePath)
  })
})

describe('KB Manager - ensureKBAvailable - Cache Miss', () => {
  it('should download and extract KB when cache miss', async () => {
    vi.clearAllMocks()
    const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    const testVersion = '0.2.0'
    const fs = new InMemoryFileSystemService({}, '/', '/')

    // Create valid ZIP content for download
    const zipContent = {
      'manifest.json': JSON.stringify({ version: '0.2.0' }),
      '.pair/knowledge/test.md': 'test',
    }
    const validZipData = JSON.stringify(zipContent)

    // Mock HEAD request for content-length
    const headResponse = toIncomingMessage(
      buildTestResponse(200, { 'content-length': validZipData.length.toString() }),
    )

    // Mock checksum (404) and file download (200) with valid ZIP data
    const checksumResp = toIncomingMessage(buildTestResponse(404))
    const fileResp = toIncomingMessage(
      buildTestResponse(200, { 'content-length': validZipData.length.toString() }, validZipData),
    )

    const httpClient = new MockHttpClientService()
    httpClient.setRequestResponses([headResponse])
    httpClient.setGetResponses([fileResp, checksumResp])
    const result = await ensureKBAvailable(testVersion, { httpClient, fs })

    // Installers always return cachePath (never cachePath/.pair)
    expect(result).toBe(join(homedir(), '.pair', 'kb', testVersion))
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

    const testVersion = '0.2.0'
    const fs = new InMemoryFileSystemService({}, '/', '/')

    // Mock HEAD request for content-length
    const headResponse = toIncomingMessage(buildTestResponse(200, { 'content-length': '1024' }))

    // Mock checksum (404) and file download (200) - auto-emit end
    const checksumResp = toIncomingMessage(buildTestResponse(404))
    const fileResp = toIncomingMessage(
      buildTestResponse(
        200,
        { 'content-length': '100' },
        createValidZipData({ 'manifest.json': '{}' }),
      ),
    )

    const httpClient = new MockHttpClientService()
    httpClient.setRequestResponses([headResponse])
    httpClient.setGetResponses([fileResp, checksumResp])
    await ensureKBAvailable(testVersion, { httpClient, fs })
  })
})

describe('KB Manager - Version handling', () => {
  it('should strip leading v from version in asset name but keep in tag', async () => {
    vi.clearAllMocks()

    const fs = new InMemoryFileSystemService({}, '/', '/')
    // A real extraction leaves a manifest behind; without one the slot reads as a
    // half-written download and the second call re-fetches (US-395 AC5).
    vi.spyOn(fs, 'extractZip').mockImplementation(async (_zipPath, targetPath) => {
      await fs.writeFile(
        join(targetPath, 'manifest.json'),
        JSON.stringify({ name: OFFICIAL_KB_NAME, version: '1.2.3' }),
      )
    })

    const versionWithV = 'v1.2.3'

    const headResponse = toIncomingMessage(buildTestResponse(200, { 'content-length': '1024' }))

    const checksumResp = toIncomingMessage(buildTestResponse(404))
    const fileResp = toIncomingMessage(
      buildTestResponse(
        200,
        { 'content-length': '100' },
        createValidZipData({ 'manifest.json': '{}' }),
      ),
    )

    const httpClient = new MockHttpClientService()
    httpClient.setRequestResponses([headResponse])
    httpClient.setGetResponses([fileResp, checksumResp])
    await ensureKBAvailable(versionWithV, { httpClient, fs })
    await ensureKBAvailable(versionWithV, { httpClient, fs })
  })
})

describe('KB Manager - 404 error handling', () => {
  it('should throw error with GitHub URL on 404 not found', async () => {
    vi.clearAllMocks()

    const testVersion404 = '0.0.404-test'
    const fs = new InMemoryFileSystemService({}, '/', '/')

    const headResponse = toIncomingMessage(buildTestResponse(200, { 'content-length': '0' }))

    const checksumResp = toIncomingMessage(buildTestResponse(404))
    const fileResp = toIncomingMessage(buildTestResponse(404))

    const httpClient = new MockHttpClientService()
    httpClient.setRequestResponses([headResponse])
    httpClient.setGetResponses([fileResp, checksumResp])
    await expect(ensureKBAvailable(testVersion404, { httpClient, fs })).rejects.toThrow(
      /KB v0\.0\.404 not found \(404\).*github\.com/s,
    )
  })
})

describe('KB Manager - 403 error handling', () => {
  it('should throw error with GitHub URL on 403 forbidden', async () => {
    vi.clearAllMocks()

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
    await expect(ensureKBAvailable(testVersion403, { httpClient, fs })).rejects.toThrow(
      /Access denied \(403\).*github\.com/s,
    )
  })
})

describe('KB Manager - Network failure', () => {
  it('should throw error on network failure', async () => {
    vi.clearAllMocks()

    const testVersion = '0.2.0'
    const fs = new InMemoryFileSystemService({}, '/', '/')

    const headResponse = toIncomingMessage(buildTestResponse(200, { 'content-length': '1024' }))

    const httpClient = new MockHttpClientService()
    httpClient.setRequestResponses([headResponse])
    httpClient.setGetError(new Error('ENOTFOUND: network unreachable'), true)
    await expect(
      ensureKBAvailable(testVersion, {
        httpClient,
        fs,
        retryOptions: { maxRetries: 0 },
      }),
    ).rejects.toThrow(/network/)
  })
})

describe('KB Manager - ZIP cleanup', () => {
  it('should cleanup ZIP file on extraction failure', async () => {
    vi.clearAllMocks()

    const testVersion = '0.2.0'
    const expectedCachePath = join(homedir(), '.pair', 'kb', testVersion)
    // The staging file is keyed by the SOURCE url, not by the CLI version alone (round 5)
    const expectedZipPath = join(
      tmpdir(),
      downloadStagingName(testVersion, buildGithubReleaseUrl(testVersion)),
    )
    const fs = new InMemoryFileSystemService({}, '/', '/')

    const headResponse = toIncomingMessage(buildTestResponse(200, { 'content-length': '1024' }))

    const checksumResp = toIncomingMessage(buildTestResponse(404))
    const fileResp = toIncomingMessage(
      buildTestResponse(
        200,
        { 'content-length': '100' },
        createValidZipData({ 'manifest.json': '{}' }),
      ),
    )

    // Mock fs.extractZip to throw error
    const extractZipSpy = vi.spyOn(fs, 'extractZip').mockRejectedValue(new Error('Corrupted ZIP'))

    const httpClient = new MockHttpClientService()
    httpClient.setRequestResponses([headResponse])
    httpClient.setGetResponses([fileResp, checksumResp])
    await expect(ensureKBAvailable(testVersion, { httpClient, fs })).rejects.toThrow(
      /Corrupted ZIP/,
    )

    expect(extractZipSpy).toHaveBeenCalledWith(expectedZipPath, expectedCachePath)
  })
})

describe('KB Manager - Extraction error', () => {
  it('should throw actionable error on extraction failure', async () => {
    vi.clearAllMocks()

    const testVersion = '0.2.0'
    const fs = new InMemoryFileSystemService({}, '/', '/')

    const headResponse = toIncomingMessage(buildTestResponse(200, { 'content-length': '1024' }))

    const checksumResp = toIncomingMessage(buildTestResponse(404))
    const fileResp = toIncomingMessage(
      buildTestResponse(
        200,
        { 'content-length': '100' },
        createValidZipData({ 'manifest.json': '{}' }),
      ),
    )

    // Mock fs.extractZip to throw error
    vi.spyOn(fs, 'extractZip').mockRejectedValue(new Error('Invalid ZIP format'))

    const httpClient = new MockHttpClientService()
    httpClient.setRequestResponses([headResponse])
    httpClient.setGetResponses([fileResp, checksumResp])
    await expect(ensureKBAvailable(testVersion, { httpClient, fs })).rejects.toThrow(
      /Invalid ZIP format/,
    )
  })
})

describe('KB Manager - Download message', () => {
  it('should display download start message', async () => {
    vi.clearAllMocks()
    const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    const testVersion = '0.2.0'
    const fs = new InMemoryFileSystemService({}, '/', '/')
    vi.spyOn(fs, 'extractZip').mockResolvedValue(undefined)

    const headResponse = toIncomingMessage(buildTestResponse(200, { 'content-length': '1024' }))

    const checksumResp = toIncomingMessage(buildTestResponse(404))
    const fileResp = toIncomingMessage(
      buildTestResponse(
        200,
        { 'content-length': '100' },
        createValidZipData({ 'manifest.json': '{}' }),
      ),
    )

    const httpClient = new MockHttpClientService()
    httpClient.setRequestResponses([headResponse])
    httpClient.setGetResponses([fileResp, checksumResp])
    await ensureKBAvailable(testVersion, { httpClient, fs })

    expect(consoleLogSpy).toHaveBeenCalledWith(
      expect.stringContaining('KB not found, downloading v0.2.0 from GitHub'),
    )

    consoleLogSpy.mockRestore()
  })
})

describe('KB Manager - Success message', () => {
  it('should display success message after installation', async () => {
    vi.clearAllMocks()
    const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    const testVersion = '0.2.0'
    const fs = new InMemoryFileSystemService({}, '/', '/')
    vi.spyOn(fs, 'extractZip').mockResolvedValue(undefined)

    const headResponse = toIncomingMessage(buildTestResponse(200, { 'content-length': '1024' }))

    const checksumResp = toIncomingMessage(buildTestResponse(404))
    const fileResp = toIncomingMessage(
      buildTestResponse(
        200,
        { 'content-length': '100' },
        createValidZipData({ 'manifest.json': '{}' }),
      ),
    )

    const httpClient = new MockHttpClientService()
    httpClient.setRequestResponses([headResponse])
    httpClient.setGetResponses([fileResp, checksumResp])
    await ensureKBAvailable(testVersion, { httpClient, fs })

    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('✅ KB v0.2.0 installed'))

    consoleLogSpy.mockRestore()
  })
})

describe('KB Manager - Custom URL with provided URL', () => {
  it('should use custom URL when provided', async () => {
    const customUrl = 'https://custom.example.com/kb.zip'
    const fs = new InMemoryFileSystemService({}, '/', '/')
    vi.spyOn(fs, 'extractZip').mockResolvedValue(undefined)

    const headResponse = toIncomingMessage(buildTestResponse(200, { 'content-length': '1024' }))
    const checksumResp = toIncomingMessage(buildTestResponse(404))
    const fileResp = toIncomingMessage(
      buildTestResponse(
        200,
        { 'content-length': '100' },
        createValidZipData({ 'manifest.json': '{}' }),
      ),
    )

    const httpClient = new MockHttpClientService()
    httpClient.setRequestResponses([headResponse])
    httpClient.setGetResponses([fileResp, checksumResp])
    await ensureKBAvailable('0.2.0', {
      httpClient,
      fs,
      customUrl,
    })

    expect(httpClient.getUrls()[0]).toBe(customUrl)
  })
})

describe('KB Manager - Custom URL with default URL', () => {
  it('should use default GitHub URL when custom URL not provided', async () => {
    const fs = new InMemoryFileSystemService({}, '/', '/')
    vi.spyOn(fs, 'extractZip').mockResolvedValue(undefined)

    const headResponse = toIncomingMessage(buildTestResponse(200, { 'content-length': '1024' }))
    const checksumResp = toIncomingMessage(buildTestResponse(404))
    const fileResp = toIncomingMessage(
      buildTestResponse(
        200,
        { 'content-length': '100' },
        createValidZipData({ 'manifest.json': '{}' }),
      ),
    )

    const httpClient = new MockHttpClientService()
    httpClient.setRequestResponses([headResponse])
    httpClient.setGetResponses([fileResp, checksumResp])
    await ensureKBAvailable('0.2.0', {
      httpClient,
      fs,
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

    const result = await import('#config').then(m =>
      m.getKnowledgeHubDatasetPathWithFallback({
        fsService: mockFs as unknown as FileSystemService,
        httpClient: new MockHttpClientService(),
        version: '0.1.0',
        isKBCachedFn: mockIsKBCached,
        ensureKBAvailableFn: mockEnsureKBAvailable,
      }),
    )

    expect(result).toBe('/home/user/.pair/kb/0.1.0')
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

    const result = await import('#config').then(m =>
      m.getKnowledgeHubDatasetPathWithFallback({
        fsService: mockFs as unknown as FileSystemService,
        httpClient: new MockHttpClientService(),
        version: '0.1.0',
        isKBCachedFn: mockIsKBCached,
        ensureKBAvailableFn: mockEnsureKBAvailable,
        customUrl,
      }),
    )

    expect(result).toBe('/home/user/.pair/kb/0.1.0')
  })
})

/**
 * A local DIRECTORY owns no cache slot: `resolveDatasetRoot` reads it in place. Routing
 * one here would have to invent a slot to copy it into — the two layers would then
 * disagree about where that KB lives, which is the class of defect US-395 exists to fix.
 */
describe('KB manager integration - a local directory is not a fetchable source', () => {
  it('refuses a local directory instead of copying it into a cache slot', async () => {
    const datasetPath = '/local/kb/dataset'

    const seed: Record<string, string> = {}
    seed[datasetPath + '/AGENTS.md'] = 'this is agents.md'
    seed[datasetPath + '/.pair/knowledge/index.md'] = '# Knowledge Base'

    const fs = new InMemoryFileSystemService(seed, '/', '/')

    await expect(
      ensureKBAvailable('local-test', {
        httpClient: new MockHttpClientService(),
        fs,
        customUrl: datasetPath,
      }),
    ).rejects.toThrow(/used in place, not cached/)

    // The message a user can act on names the FLAG, not the internal functions: this error
    // reaches the terminal through KnowledgeHubSetupError.
    await expect(
      ensureKBAvailable('local-test', {
        httpClient: new MockHttpClientService(),
        fs,
        customUrl: datasetPath,
      }),
    ).rejects.toThrow(/--source/)
    await expect(
      ensureKBAvailable('local-test', {
        httpClient: new MockHttpClientService(),
        fs,
        customUrl: datasetPath,
      }),
    ).rejects.not.toThrow(/resolveDatasetRoot|ensureKBAvailable/)

    // nothing was written under the cache root for it
    expect(fs.existsSync(join(homedir(), '.pair', 'kb', 'external'))).toBe(false)
  })
})

describe('KB Manager - Cache bypass when customUrl provided', () => {
  const testVersion = '0.2.0'
  const expectedCachePath = join(homedir(), '.pair', 'kb', testVersion)
  // US-395: every non-official source installs into its own identity-keyed slot
  const remoteSlot = (url: string) => getSourceCachePath({ kind: 'remote', url })

  it('should download from remote customUrl even when cache exists (AC-1)', async () => {
    const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    // Pre-seed cache so isKBCached returns true
    const fs = new InMemoryFileSystemService(
      {
        [expectedCachePath + '/manifest.json']: '{"version": "0.2.0"}',
        [expectedCachePath + '/.pair/knowledge/test.md']: 'old content',
      },
      '/',
      '/',
    )

    const customUrl = 'https://custom.example.com/new-kb.zip'
    const zipContent = {
      'manifest.json': JSON.stringify({ version: '0.2.0' }),
      '.pair/knowledge/test.md': 'new content',
    }
    const validZipData = JSON.stringify(zipContent)

    const headResponse = toIncomingMessage(
      buildTestResponse(200, { 'content-length': validZipData.length.toString() }),
    )
    const checksumResp = toIncomingMessage(buildTestResponse(404))
    const fileResp = toIncomingMessage(
      buildTestResponse(200, { 'content-length': validZipData.length.toString() }, validZipData),
    )

    const httpClient = new MockHttpClientService()
    httpClient.setRequestResponses([headResponse])
    httpClient.setGetResponses([fileResp, checksumResp])

    const result = await ensureKBAvailable(testVersion, { httpClient, fs, customUrl })

    // Should have downloaded (httpClient was called), not just returned cache
    expect(httpClient.getUrls()[0]).toBe(customUrl)
    // US-395: a custom source gets its OWN slot; the official slot stays as it was
    expect(result).toBe(remoteSlot(customUrl))
    expect(result).not.toBe(expectedCachePath)
    expect(await fs.readFile(expectedCachePath + '/.pair/knowledge/test.md')).toBe('old content')

    consoleLogSpy.mockRestore()
  })

  it('should preserve cache-hit when no customUrl provided (AC-3)', async () => {
    const fs = new InMemoryFileSystemService(
      {
        [expectedCachePath + '/manifest.json']: '{"version": "0.2.0"}',
        [expectedCachePath + '/.pair/knowledge/test.md']: 'cached content',
      },
      '/',
      '/',
    )

    const httpClient = new MockHttpClientService()

    // No customUrl — should return cache immediately without any HTTP calls
    const result = await ensureKBAvailable(testVersion, { httpClient, fs })

    expect(result).toBe(expectedCachePath)
    expect(httpClient.getUrls()).toHaveLength(0)
  })

  it('should re-install from a local ZIP without serving the official cache (AC-4)', async () => {
    const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const localZip = '/local/kb/acme-kb.zip'
    const fs = new InMemoryFileSystemService(
      {
        [expectedCachePath + '/manifest.json']: '{"version": "0.2.0"}',
        [localZip]: createValidZipData({
          'manifest.json': JSON.stringify({ name: 'acme-kb', version: '1.0.0' }),
          '.pair/knowledge/index.md': '# Local KB',
        }),
      },
      '/',
      '/',
    )

    const httpClient = new MockHttpClientService()

    const result = await ensureKBAvailable(testVersion, {
      httpClient,
      fs,
      customUrl: localZip,
      skipVerify: true,
    })

    // Installed from the local ZIP's own slot, not the official cache it must not touch
    expect(result).toBe(getSourceCachePath({ kind: 'zip', path: localZip }))
    expect(result).not.toBe(expectedCachePath)
    expect(await fs.readFile(expectedCachePath + '/manifest.json')).toBe('{"version": "0.2.0"}')
    // No HTTP calls for a local path
    expect(httpClient.getUrls()).toHaveLength(0)

    consoleLogSpy.mockRestore()
  })

  it('should restore the source slot when remote customUrl download fails (AC-5)', async () => {
    const failingUrl = 'https://failing.example.com/kb.zip'
    const sourceSlot = remoteSlot(failingUrl)
    const fs = new InMemoryFileSystemService(
      {
        [expectedCachePath + '/manifest.json']: '{"version": "0.2.0"}',
        [sourceSlot + '/manifest.json']: '{"name": "acme-kb", "version": "1.0.0"}',
        [sourceSlot + '/.pair/knowledge/test.md']: 'cached content',
      },
      '/',
      '/',
    )

    const headResponse = toIncomingMessage(buildTestResponse(200, { 'content-length': '0' }))
    const checksumResp = toIncomingMessage(buildTestResponse(404))
    const fileResp = toIncomingMessage(buildTestResponse(404))

    const httpClient = new MockHttpClientService()
    httpClient.setRequestResponses([headResponse])
    httpClient.setGetResponses([fileResp, checksumResp])

    await expect(
      ensureKBAvailable(testVersion, { httpClient, fs, customUrl: failingUrl }),
    ).rejects.toThrow()

    // The source's own slot is restored from backup after a failed download
    expect(await fs.readFile(sourceSlot + '/.pair/knowledge/test.md')).toBe('cached content')
    expect(fs.existsSync(sourceSlot + '.bak')).toBe(false)
    // and the official KB's slot was never in play
    expect(fs.existsSync(expectedCachePath + '/manifest.json')).toBe(true)
  })

  /**
   * Round 5, the RESTORE half of the "a cleanup must not undo the work it follows" rule:
   * the restore runs inside the `catch`, so a fs error thrown there REPLACES the only
   * actionable diagnosis the user had (the HTTP failure that started this) with an
   * unrelated message. The original error is always the one rethrown.
   */
  it('reports the download failure, not a failure of the restore that follows it', async () => {
    const failingUrl = 'https://failing.example.com/kb.zip'
    const sourceSlot = remoteSlot(failingUrl)
    const fs = new InMemoryFileSystemService(
      {
        [sourceSlot + '/manifest.json']: '{"name":"acme-kb"}',
        [sourceSlot + '/.pair/knowledge/test.md']: 'cached content',
      },
      '/',
      '/',
    )

    const realRename = fs.rename.bind(fs)
    vi.spyOn(fs, 'rename').mockImplementation(async (from, to) => {
      // the restore's rename (`.bak` back into place) fails; setting aside still works
      if (from.endsWith('.bak')) {
        throw Object.assign(new Error('EPERM: operation not permitted'), { code: 'EPERM' })
      }
      return realRename(from, to)
    })

    const httpClient = new MockHttpClientService()
    httpClient.setRequestResponses([
      toIncomingMessage(buildTestResponse(200, { 'content-length': '0' })),
    ])
    httpClient.setGetResponses([
      toIncomingMessage(buildTestResponse(404)),
      toIncomingMessage(buildTestResponse(404)),
    ])

    let err: Error | undefined
    try {
      await ensureKBAvailable(testVersion, { httpClient, fs, customUrl: failingUrl })
    } catch (e) {
      err = e as Error
    }

    expect(err?.message).not.toMatch(/EPERM/)
    expect(err?.message).toMatch(/404|download/i)
  })

  it('should download from different customUrl even when cache exists (AC-2)', async () => {
    const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    // Pre-seed cache from a "previous" source
    const fs = new InMemoryFileSystemService(
      {
        [expectedCachePath + '/manifest.json']: '{"version": "0.2.0"}',
      },
      '/',
      '/',
    )

    const differentUrl = 'https://other-source.example.com/kb-v2.zip'
    const zipContent = { 'manifest.json': JSON.stringify({ version: '0.2.0' }) }
    const validZipData = JSON.stringify(zipContent)

    const headResponse = toIncomingMessage(
      buildTestResponse(200, { 'content-length': validZipData.length.toString() }),
    )
    const checksumResp = toIncomingMessage(buildTestResponse(404))
    const fileResp = toIncomingMessage(
      buildTestResponse(200, { 'content-length': validZipData.length.toString() }, validZipData),
    )

    const httpClient = new MockHttpClientService()
    httpClient.setRequestResponses([headResponse])
    httpClient.setGetResponses([fileResp, checksumResp])

    const result = await ensureKBAvailable(testVersion, { httpClient, fs, customUrl: differentUrl })

    expect(httpClient.getUrls()[0]).toBe(differentUrl)
    expect(result).toBe(remoteSlot(differentUrl))
    expect(result).not.toBe(remoteSlot('https://custom.example.com/new-kb.zip'))

    consoleLogSpy.mockRestore()
  })
})

/**
 * US-395 AC5 — a cache slot polluted by an earlier `--source` install is detected and
 * re-fetched, never served. Without this, a user who ran one bad install keeps getting
 * foreign content in every project, with nothing connecting cause and effect.
 */
describe('KB Manager - contaminated official slot self-heals (US-395 AC5)', () => {
  const testVersion = '0.2.0'
  const officialSlot = join(homedir(), '.pair', 'kb', testVersion)

  it('discards a slot whose manifest names another KB and re-downloads the official one', async () => {
    const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const fs = new InMemoryFileSystemService(
      {
        // Left behind by a previous `install --source acme-kb.zip`
        [officialSlot + '/manifest.json']: JSON.stringify({ name: 'acme-kb', version: '1.0.0' }),
        [officialSlot + '/.pair/knowledge/foreign.md']: 'foreign content',
      },
      '/',
      '/',
    )

    vi.spyOn(fs, 'extractZip').mockImplementation(async (_zipPath, targetPath) => {
      await fs.writeFile(
        join(targetPath, 'manifest.json'),
        JSON.stringify({ name: OFFICIAL_KB_NAME, version: testVersion }),
      )
      await fs.writeFile(join(targetPath, '.pair', 'knowledge', 'official.md'), 'official content')
    })

    const httpClient = new MockHttpClientService()
    httpClient.setRequestResponses([
      toIncomingMessage(buildTestResponse(200, { 'content-length': '1024' })),
    ])
    httpClient.setGetResponses([
      toIncomingMessage(buildTestResponse(200, { 'content-length': '1024' }, 'fake zip data')),
      toIncomingMessage(buildTestResponse(404)),
    ])

    const result = await ensureKBAvailable(testVersion, { httpClient, fs })

    expect(result).toBe(officialSlot)
    // it did NOT trust the polluted slot
    expect(httpClient.getUrls().length).toBeGreaterThan(0)
    // the foreign content is gone, not merged with the official KB
    expect(fs.existsSync(officialSlot + '/.pair/knowledge/foreign.md')).toBe(false)
    expect(await fs.readFile(officialSlot + '/.pair/knowledge/official.md')).toBe(
      'official content',
    )
    expect(JSON.parse(await fs.readFile(officialSlot + '/manifest.json')).name).toBe(
      OFFICIAL_KB_NAME,
    )

    consoleLogSpy.mockRestore()
    consoleWarnSpy.mockRestore()
  })

  it('keeps the contaminated cache when the re-fetch fails, instead of leaving no cache', async () => {
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const fs = new InMemoryFileSystemService(
      {
        [officialSlot + '/manifest.json']: JSON.stringify({ name: 'acme-kb', version: '1.0.0' }),
        [officialSlot + '/.pair/knowledge/foreign.md']: 'foreign content',
      },
      '/',
      '/',
    )

    // The user is offline / the release is unreachable: the re-download fails.
    const httpClient = new MockHttpClientService()
    httpClient.setRequestResponses([
      toIncomingMessage(buildTestResponse(200, { 'content-length': '0' })),
    ])
    httpClient.setGetResponses([
      toIncomingMessage(buildTestResponse(404)),
      toIncomingMessage(buildTestResponse(404)),
    ])

    await expect(ensureKBAvailable(testVersion, { httpClient, fs })).rejects.toThrow()

    // wrong-but-working content is still there — a failed re-fetch is not destructive
    expect(await fs.readFile(officialSlot + '/.pair/knowledge/foreign.md')).toBe('foreign content')
    expect(fs.existsSync(officialSlot + '.bak')).toBe(false)

    consoleWarnSpy.mockRestore()
  })

  /**
   * The backup is discarded AFTER the install has succeeded, so a failure to delete the
   * `.bak` must not reach the `catch` that RESTORES it: restoring here would delete the KB
   * just downloaded correctly and put the contaminated slot back — undoing the AC5 self-heal
   * and reporting an unrelated fs error. (EPERM/EBUSY from an antivirus handle on a
   * just-renamed tree is the concrete Windows trigger.)
   */
  it('keeps a successful re-download when discarding the old slot fails', async () => {
    const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const fs = new InMemoryFileSystemService(
      {
        [officialSlot + '/manifest.json']: JSON.stringify({ name: 'acme-kb', version: '1.0.0' }),
        [officialSlot + '/.pair/knowledge/foreign.md']: 'foreign content',
      },
      '/',
      '/',
    )

    let installed = false
    vi.spyOn(fs, 'extractZip').mockImplementation(async (_zipPath, targetPath) => {
      await fs.writeFile(
        join(targetPath, 'manifest.json'),
        JSON.stringify({ name: OFFICIAL_KB_NAME, version: testVersion }),
      )
      await fs.writeFile(join(targetPath, '.pair', 'knowledge', 'official.md'), 'official content')
      installed = true
    })

    const realRm = fs.rm.bind(fs)
    vi.spyOn(fs, 'rm').mockImplementation(async (path, options) => {
      // only the post-install cleanup of the set-aside slot fails
      if (installed && path.endsWith('.bak')) {
        throw Object.assign(new Error('EBUSY: resource busy or locked'), { code: 'EBUSY' })
      }
      return realRm(path, options)
    })

    const httpClient = new MockHttpClientService()
    httpClient.setRequestResponses([
      toIncomingMessage(buildTestResponse(200, { 'content-length': '1024' })),
    ])
    httpClient.setGetResponses([
      toIncomingMessage(buildTestResponse(200, { 'content-length': '1024' }, 'fake zip data')),
      toIncomingMessage(buildTestResponse(404)),
    ])

    const result = await ensureKBAvailable(testVersion, { httpClient, fs })

    expect(result).toBe(officialSlot)
    expect(await fs.readFile(officialSlot + '/.pair/knowledge/official.md')).toBe(
      'official content',
    )
    expect(fs.existsSync(officialSlot + '/.pair/knowledge/foreign.md')).toBe(false)

    consoleLogSpy.mockRestore()
    consoleWarnSpy.mockRestore()
  })

  it('serves the cache without downloading when the slot holds the official KB', async () => {
    const fs = new InMemoryFileSystemService(
      {
        [officialSlot + '/manifest.json']: JSON.stringify({
          name: OFFICIAL_KB_NAME,
          version: testVersion,
        }),
      },
      '/',
      '/',
    )
    const httpClient = new MockHttpClientService()

    const result = await ensureKBAvailable(testVersion, { httpClient, fs })

    expect(result).toBe(officialSlot)
    expect(httpClient.getUrls()).toHaveLength(0)
  })
})

/**
 * US-395 — the source's identity is derived ONCE and every dispatch follows it. When the
 * slot was keyed case-insensitively (`KB.ZIP` → a zip slot) but the installer was picked
 * with `endsWith('.zip')`, an uppercase archive was routed to the DIRECTORY installer:
 * it purged a second, unrelated slot and failed with "Failed to install KB from local
 * directory", leaving an orphan slot behind.
 */
describe('KB Manager - one identity per source, whatever the extension case (US-395)', () => {
  it('installs an uppercase .ZIP as a ZIP, into the slot its identity owns', async () => {
    const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const zipPath = '/downloads/KB.ZIP'
    const fs = new InMemoryFileSystemService(
      {
        [zipPath]: createValidZipData({
          'manifest.json': JSON.stringify({ name: 'acme-kb', version: '1.0.0' }),
          '.pair/knowledge/acme.md': '# acme',
        }),
      },
      '/work',
      '/work',
    )

    const result = await ensureKBAvailable('0.2.0', {
      httpClient: new MockHttpClientService(),
      fs,
      customUrl: zipPath,
      skipVerify: true,
    })

    expect(result).toBe(getSourceCachePath({ kind: 'zip', path: zipPath }))
    expect(fs.existsSync(join(result, '.pair', 'knowledge', 'acme.md'))).toBe(true)
    // exactly one slot exists for this archive — no orphan from a second classification
    expect(await fs.readdir(join(homedir(), '.pair', 'kb', 'external'))).toHaveLength(1)

    consoleLogSpy.mockRestore()
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
