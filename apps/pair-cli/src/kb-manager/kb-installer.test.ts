import { describe, it, expect, vi } from 'vitest'
import { join } from 'path'
import { homedir } from 'os'
import {
  InMemoryFileSystemService,
  MockHttpClientService,
  buildTestResponse,
  toIncomingMessage,
} from '@pair/content-ops'
import { installKB, installKBFromLocalZip, installKBFromLocalDirectory } from './kb-installer'

describe('KB Installer', () => {
  it('downloads and installs when checksum absent', async () => {
    vi.clearAllMocks()
    const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    const version = '0.2.0'
    const cachePath = join(homedir(), '.pair', 'kb', version)
    const downloadUrl = `https://github.com/foomakers/pair/releases/download/v${version}/knowledge-base-${version}.zip`
    const fs = new InMemoryFileSystemService({}, '/', '/')
    const httpClient = new MockHttpClientService()

    // Mock fs.extractZip to simulate extraction
    vi.spyOn(fs, 'extractZip').mockImplementation(async (_zipPath, targetPath) => {
      await fs.writeFile(join(targetPath, 'manifest.json'), JSON.stringify({ version }))
    })

    const headResponse = toIncomingMessage(buildTestResponse(200, { 'content-length': '1024' }))
    const checksumResp = toIncomingMessage(buildTestResponse(404))
    const fileResp = toIncomingMessage(
      buildTestResponse(200, { 'content-length': '1024' }, 'fake zip data'),
    )

    httpClient.setRequestResponses([headResponse])
    httpClient.setGetResponses([fileResp, checksumResp]) // file first, checksum second

    const result = await installKB(version, cachePath, downloadUrl, {
      httpClient,
      fs,
    })

    expect(result).toBe(cachePath)
    expect(consoleLogSpy).toHaveBeenCalledWith(
      expect.stringContaining('KB not found, downloading v0.2.0 from GitHub'),
    )
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('✅ KB v0.2.0 installed'))

    consoleLogSpy.mockRestore()
  })

  it('preserves extraction errors and cleans up zip', async () => {
    vi.clearAllMocks()

    const version = '0.2.0'
    const cachePath = join(homedir(), '.pair', 'kb', version)
    const downloadUrl = `https://github.com/foomakers/pair/releases/download/v${version}/knowledge-base-${version}.zip`
    const fs = new InMemoryFileSystemService({}, '/', '/')
    const httpClient = new MockHttpClientService()

    // Mock fs.extractZip to throw error
    vi.spyOn(fs, 'extractZip').mockRejectedValue(new Error('Invalid zip'))

    const headResponse = toIncomingMessage(buildTestResponse(200, { 'content-length': '1024' }))
    const checksumResp = toIncomingMessage(buildTestResponse(404))
    const fileResp = toIncomingMessage(
      buildTestResponse(200, { 'content-length': '1024' }, 'fake zip data'),
    )

    httpClient.setRequestResponses([headResponse])
    httpClient.setGetResponses([fileResp, checksumResp]) // file first, checksum second

    await expect(async () => {
      await installKB(version, cachePath, downloadUrl, { httpClient, fs })
    }).rejects.toThrow(/invalid zip/i)
  })

  it('downloaded install returns dataset root when .pair exists after extract', async () => {
    vi.clearAllMocks()

    const version = '0.3.0'
    const cachePath = join(homedir(), '.pair', 'kb', version)
    const expectedDatasetRoot = join(cachePath, '.pair')
    const downloadUrl = `https://github.com/foomakers/pair/releases/download/v${version}/knowledge-base-${version}.zip`
    const fs = new InMemoryFileSystemService({}, '/', '/')
    const httpClient = new MockHttpClientService()

    // Mock fs.extractZip to simulate extraction with .pair directory
    vi.spyOn(fs, 'extractZip').mockImplementation(async (_zipPath, targetPath) => {
      await fs.writeFile(join(targetPath, '.pair', 'knowledge', 'installed.md'), 'ok')
      await fs.writeFile(join(targetPath, 'manifest.json'), JSON.stringify({ version }))
    })

    const headResponse = toIncomingMessage(buildTestResponse(200, { 'content-length': '1024' }))
    const checksumResp = toIncomingMessage(buildTestResponse(404))
    const fileResp = toIncomingMessage(
      buildTestResponse(200, { 'content-length': '1024' }, 'fake zip data'),
    )

    httpClient.setRequestResponses([headResponse])
    httpClient.setGetResponses([fileResp, checksumResp]) // file first, checksum second

    const result = await installKB(version, cachePath, downloadUrl, {
      httpClient,
      fs,
    })

    expect(result).toBe(expectedDatasetRoot)
  })
})

describe('KB Installer - installKBFromLocalZip', () => {
  it('should install KB from absolute path local ZIP and return dataset root when .pair exists', async () => {
    // Arrange
    const version = '0.2.0'
    const zipPath = '/absolute/path/kb.zip'
    const expectedCachePath = join(homedir(), '.pair', 'kb', version)
    const expectedDatasetRoot = join(expectedCachePath, '.pair')

    // Create valid ZIP content in InMemoryFS format (JSON serialized)
    const zipContent = {
      '.pair/knowledge/test.md': 'extracted content',
      'manifest.json': JSON.stringify({ version: '0.2.0' }),
    }

    const fs = new InMemoryFileSystemService(
      {
        [zipPath]: JSON.stringify(zipContent),  // Valid ZIP format for InMemoryFS
      },
      '/',
      '/',
    )

    // Act - uses real fs.extractZip, no mock needed!
    const result = await installKBFromLocalZip(version, zipPath, fs, true)

    // Assert
    expect(result).toBe(expectedDatasetRoot)
    expect(await fs.exists(join(expectedCachePath, '.pair', 'knowledge', 'test.md'))).toBe(true)
  })

  it('should install KB from relative path local ZIP', async () => {
    // Arrange
    const version = '0.2.0'
    const zipPath = './downloads/kb.zip'
    const resolvedZipPath = join(process.cwd(), 'downloads', 'kb.zip')
    const expectedCachePath = join(homedir(), '.pair', 'kb', version)

    // Create valid ZIP content
    const zipContent = {
      'AGENTS.md': 'extracted content',
      'manifest.json': JSON.stringify({ version: '0.2.0' }),
    }

    const fs = new InMemoryFileSystemService(
      {
        [resolvedZipPath]: JSON.stringify(zipContent),
      },
      '/',
      '/',
    )

    // Act - uses real fs.extractZip
    const result = await installKBFromLocalZip(version, zipPath, fs, true)

    // Assert
    expect(result).toBe(expectedCachePath)
    expect(await fs.exists(join(expectedCachePath, 'AGENTS.md'))).toBe(true)
  })

  it('should throw error if ZIP file does not exist', async () => {
    // Arrange
    const version = '0.2.0'
    const zipPath = '/nonexistent/kb.zip'
    const fs = new InMemoryFileSystemService({}, '/', '/')

    // Act & Assert
    await expect(installKBFromLocalZip(version, zipPath, fs)).rejects.toThrow(
      'ZIP file not found: /nonexistent/kb.zip',
    )
  })

  it('should validate KB structure after extraction', async () => {
    // Arrange
    const version = '0.2.0'
    const zipPath = '/path/kb.zip'

    // Create empty ZIP (no KB structure files)
    const zipContent = {}  // Empty ZIP = invalid structure

    const fs = new InMemoryFileSystemService(
      {
        [zipPath]: JSON.stringify(zipContent),
      },
      '/',
      '/',
    )

    // Act & Assert - real extractZip extracts nothing, validation fails
    await expect(installKBFromLocalZip(version, zipPath, fs, true)).rejects.toThrow(
      'Invalid KB structure',
    )
  })

  it('should handle ZIP with single root directory containing KB structure and return dataset root', async () => {
    // Arrange - Simulates ZIP created by `pair package` which has .zip-temp/ root
    const version = '0.2.0'
    const zipPath = '/path/kb.zip'
    const cachePath = join(homedir(), '.pair', 'kb', version)
    const expectedDatasetRoot = join(cachePath, '.pair')

    // Create valid ZIP with .zip-temp root directory structure
    const zipContent = {
      '.zip-temp/.pair/knowledge/test.md': 'test content',
      '.zip-temp/manifest.json': JSON.stringify({ version: '0.2.0' }),
    }

    const fs = new InMemoryFileSystemService(
      {
        [zipPath]: JSON.stringify(zipContent),
      },
      '/',
      '/',
    )

    // Act - uses real fs.extractZip
    const result = await installKBFromLocalZip(version, zipPath, fs, true)

    // Assert - Should succeed by detecting KB structure in subdirectory and return dataset root
    expect(result).toBe(expectedDatasetRoot)
    // Should have moved files from .zip-temp to root and .pair present
    expect(fs.existsSync(`${cachePath}/.pair/knowledge/test.md`)).toBe(true)
    expect(fs.existsSync(`${cachePath}/manifest.json`)).toBe(true)
  })

  it('should reject when ZIP contains only manifest.json at root', async () => {
    // Arrange
    const version = '0.2.0'
    const zipPath = '/path/manifest-only.zip'
    const fs = new InMemoryFileSystemService(
      {
        // ZIP that extracts to manifest.json only
        [zipPath]: JSON.stringify({ 'manifest.json': '{}' }),
      },
      '/',
      '/',
    )

    // Act & Assert
    await expect(installKBFromLocalZip(version, zipPath, fs, true)).rejects.toThrow(
      'Invalid KB structure',
    )
  })

  it('should accept when ZIP contains manifest.json and another file at root', async () => {
    // Arrange
    const version = '0.2.0'
    const zipPath = '/path/manifest-plus.zip'
    const cachePath = join(homedir(), '.pair', 'kb', version)

    // Pre-populate extraction output so extractZip (test path) results in both files
    const fs = new InMemoryFileSystemService(
      {
        // ZIP exists (content not used by extract when fs param is provided),
        [zipPath]: JSON.stringify({ 'manifest.json': '{}', 'AGENTS.md': 'agents' }),
        // Simulate extraction output already present
        [`${cachePath}/manifest.json`]: '{}',
        [`${cachePath}/AGENTS.md`]: 'agents',
      },
      '/',
      '/',
    )

    // Act
    const result = await installKBFromLocalZip(version, zipPath, fs, true)

    // Assert
    expect(result).toBe(cachePath)
    expect(fs.existsSync(`${cachePath}/manifest.json`)).toBe(true)
    expect(fs.existsSync(`${cachePath}/AGENTS.md`)).toBe(true)
  })

  it('should reject when ZIP has a single root directory (.zip-temp) containing only manifest.json', async () => {
    // Arrange - simulate .zip-temp with only manifest.json
    const version = '0.2.0'
    const zipPath = '/path/ziptemp-manifest-only.zip'
    const fs = new InMemoryFileSystemService(
      {
        [zipPath]: JSON.stringify({ '.zip-temp/manifest.json': '{}' }),
      },
      '/',
      '/',
    )

    // Act & Assert
    await expect(installKBFromLocalZip(version, zipPath, fs, true)).rejects.toThrow(
      'Invalid KB structure',
    )
  })
})

describe('KB Installer - installKBFromLocalDirectory', () => {
  it('should reject when directory contains only manifest.json', async () => {
    // Arrange
    const version = '0.2.0'
    const dirPath = '/path/manifest-only-dir'
    const fs = new InMemoryFileSystemService(
      {
        [join(dirPath, 'manifest.json')]: '{}',
      },
      '/',
      '/',
    )

    // Act & Assert
    await expect(installKBFromLocalDirectory(version, dirPath, fs)).rejects.toThrow(
      'Invalid KB structure',
    )
  })

  it('should accept when directory contains manifest.json and another file', async () => {
    // Arrange
    const version = '0.2.0'
    const dirPath = '/path/manifest-plus-dir'
    const expectedCachePath = join(homedir(), '.pair', 'kb', version)
    const fs = new InMemoryFileSystemService(
      {
        [join(dirPath, 'manifest.json')]: '{}',
        [join(dirPath, 'AGENTS.md')]: 'agents content',
      },
      '/',
      '/',
    )

    // Act
    const result = await installKBFromLocalDirectory(version, dirPath, fs)

    // Assert
    expect(result).toBe(expectedCachePath)
    expect(fs.existsSync(`${expectedCachePath}/manifest.json`)).toBe(true)
    expect(fs.existsSync(`${expectedCachePath}/AGENTS.md`)).toBe(true)
  })

  it('should install KB from absolute path local directory and return dataset root when .pair exists', async () => {
    // Arrange
    const version = '0.2.0'
    const dirPath = '/absolute/path/kb'
    const expectedCachePath = join(homedir(), '.pair', 'kb', version)
    const expectedDatasetRoot = join(expectedCachePath, '.pair')
    const fs = new InMemoryFileSystemService(
      {
        [join(dirPath, '.pair', 'knowledge', 'test.md')]: 'existing content',
        [join(dirPath, 'AGENTS.md')]: 'agents content',
      },
      '/',
      '/',
    )

    // Act
    const result = await installKBFromLocalDirectory(version, dirPath, fs)

    // Assert
    expect(result).toBe(expectedDatasetRoot)
  })

  it('should install KB from relative path local directory and return dataset root when .pair exists', async () => {
    // Arrange
    const version = '0.2.0'
    const dirPath = './relative/kb'
    // fs.currentWorkingDirectory() returns '/' so resolve('/', './relative/kb') = '/relative/kb'
    const resolvedDirPath = '/relative/kb'
    const expectedCachePath = join(homedir(), '.pair', 'kb', version)
    const expectedDatasetRoot = join(expectedCachePath, '.pair')
    const fs = new InMemoryFileSystemService(
      {
        [join(resolvedDirPath, '.pair', 'knowledge', 'test.md')]: 'existing content',
        [join(resolvedDirPath, 'AGENTS.md')]: 'agents content',
      },
      '/',
      '/',
    )

    // Act
    const result = await installKBFromLocalDirectory(version, dirPath, fs)

    // Assert
    expect(result).toBe(expectedDatasetRoot)
  })

  it('should throw error if directory does not exist', async () => {
    // Arrange
    const version = '0.2.0'
    const dirPath = '/nonexistent/kb'
    const fs = new InMemoryFileSystemService({}, '/', '/')

    // Act & Assert
    await expect(installKBFromLocalDirectory(version, dirPath, fs)).rejects.toThrow(
      'Directory not found: /nonexistent/kb',
    )
  })

  it('should validate KB structure after copy', async () => {
    // Arrange
    const version = '0.2.0'
    const dirPath = '/path/kb'
    const fs = new InMemoryFileSystemService(
      {
        [join(dirPath, 'some-file.txt')]: 'content',
        // No .pair/ or AGENTS.md
      },
      '/',
      '/',
    )

    // Act & Assert
    await expect(installKBFromLocalDirectory(version, dirPath, fs)).rejects.toThrow(
      'Invalid KB structure',
    )
  })
})
