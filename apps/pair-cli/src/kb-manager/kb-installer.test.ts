import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as https from 'https'
import { join } from 'path'
import { homedir } from 'os'
import { InMemoryFileSystemService } from '@pair/content-ops'
import { installKB } from './kb-installer'
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
