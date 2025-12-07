import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as https from 'https'
import { join } from 'path'
import { homedir } from 'os'
import { InMemoryFileSystemService } from '@pair/content-ops'
import { installKB, installKBFromLocalZip, installKBFromLocalDirectory } from './kb-installer'
import {
  mockMultipleHttpsGet,
  mockHttpsRequest,
  buildTestResponse,
  toIncomingMessage,
} from '../test-utils/http-mocks'

vi.mock('https', () => ({
  get: vi.fn(),
  request: vi.fn(),
}))

const mockExtract = vi.fn()

beforeEach(() => {
  vi.mocked(https.request).mockImplementation(
    mockHttpsRequest(toIncomingMessage(buildTestResponse(200, { 'content-length': '1024' }))),
  )
})

describe('KB Installer', () => {
  it('downloads and installs when checksum absent', async () => {
    vi.clearAllMocks()
    mockExtract.mockReset().mockResolvedValue(undefined)
    const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    const version = '0.2.0'
    const cachePath = join(homedir(), '.pair', 'kb', version)
    const downloadUrl = `https://github.com/foomakers/pair/releases/download/v${version}/knowledge-base-${version}.zip`
    const fs = new InMemoryFileSystemService({}, '/', '/')

    const checksumResp = toIncomingMessage(buildTestResponse(404))
    const fileResp = toIncomingMessage(buildTestResponse(200, { 'content-length': '1024' }))
    vi.mocked(https.get).mockImplementation(
      mockMultipleHttpsGet([
        { pattern: '.sha256', response: checksumResp },
        { response: fileResp },
      ]),
    )

    mockExtract.mockImplementation(async (_zipPath: string, targetPath: string) => {
      fs.writeFile(join(targetPath, 'manifest.json'), JSON.stringify({ version }))
    })

    const result = await installKB(version, cachePath, downloadUrl, { fs, extract: mockExtract })

    expect(result).toBe(cachePath)
    expect(consoleLogSpy).toHaveBeenCalledWith(
      expect.stringContaining('KB not found, downloading v0.2.0 from GitHub'),
    )
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('✅ KB v0.2.0 installed'))

    consoleLogSpy.mockRestore()
  })

  it('preserves extraction errors and cleans up zip', async () => {
    vi.clearAllMocks()
    mockExtract.mockReset().mockRejectedValue(new Error('Invalid zip'))

    const version = '0.2.0'
    const cachePath = join(homedir(), '.pair', 'kb', version)
    const downloadUrl = `https://github.com/foomakers/pair/releases/download/v${version}/knowledge-base-${version}.zip`
    const fs = new InMemoryFileSystemService({}, '/', '/')

    const checksumResp = toIncomingMessage(buildTestResponse(404))
    const fileResp = toIncomingMessage(buildTestResponse(200, { 'content-length': '1024' }))
    vi.mocked(https.get).mockImplementation(
      mockMultipleHttpsGet([
        { pattern: '.sha256', response: checksumResp },
        { response: fileResp },
      ]),
    )

    await expect(async () => {
      await installKB(version, cachePath, downloadUrl, { fs, extract: mockExtract })
    }).rejects.toThrow(/invalid zip/i)
  })
})

describe('KB Installer - installKBFromLocalZip', () => {
  it('should install KB from absolute path local ZIP', async () => {
    // Arrange
    const version = '0.2.0'
    const zipPath = '/absolute/path/kb.zip'
    const expectedCachePath = join(homedir(), '.pair', 'kb', version)
    const fs = new InMemoryFileSystemService(
      {
        [zipPath]: 'fake zip content',
        [join(expectedCachePath, '.pair', 'knowledge', 'test.md')]: 'existing content',
      },
      '/',
      '/',
    )

    // Act
    const result = await installKBFromLocalZip(version, zipPath, fs)

    // Assert
    expect(result).toBe(expectedCachePath)
  })

  it('should install KB from relative path local ZIP', async () => {
    // Arrange
    const version = '0.2.0'
    const zipPath = './downloads/kb.zip'
    const resolvedZipPath = join(process.cwd(), 'downloads', 'kb.zip')
    const expectedCachePath = join(homedir(), '.pair', 'kb', version)
    const fs = new InMemoryFileSystemService(
      {
        [resolvedZipPath]: 'fake zip content',
        [join(expectedCachePath, 'AGENTS.md')]: 'existing content',
      },
      '/',
      '/',
    )

    // Act
    const result = await installKBFromLocalZip(version, zipPath, fs)

    // Assert
    expect(result).toBe(expectedCachePath)
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
    const fs = new InMemoryFileSystemService(
      {
        [zipPath]: 'fake zip content',
        // No .pair/ or AGENTS.md after extraction
      },
      '/',
      '/',
    )

    // Act & Assert
    await expect(installKBFromLocalZip(version, zipPath, fs)).rejects.toThrow(
      'Invalid KB structure',
    )
  })
})

describe('KB Installer - installKBFromLocalDirectory', () => {
  it('should install KB from absolute path local directory', async () => {
    // Arrange
    const version = '0.2.0'
    const dirPath = '/absolute/path/kb'
    const expectedCachePath = join(homedir(), '.pair', 'kb', version)
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
    expect(result).toBe(expectedCachePath)
  })

  it('should install KB from relative path local directory', async () => {
    // Arrange
    const version = '0.2.0'

    // Create a temporary directory for testing
    const { mkdirSync, writeFileSync, rmSync } = await import('fs')
    const { tmpdir } = await import('os')
    const tempDir = join(tmpdir(), 'kb-test-dir')
    const tempSubDir = join(tempDir, '.pair', 'knowledge')
    const expectedCachePath = join(homedir(), '.pair', 'kb', version)

    try {
      mkdirSync(tempSubDir, { recursive: true })
      writeFileSync(join(tempSubDir, 'test.md'), 'existing content')
      writeFileSync(join(tempDir, 'AGENTS.md'), 'agents content')

      // Act
      const result = await installKBFromLocalDirectory(version, tempDir)

      // Assert
      expect(result).toBe(expectedCachePath)
    } finally {
      // Cleanup
      rmSync(tempDir, { recursive: true, force: true })
    }
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
