import { describe, it, expect, vi } from 'vitest'
import {
  InMemoryFileSystemService,
  MockHttpClientService,
  buildTestResponse,
  toIncomingMessage,
} from '@pair/content-ops'
import { ensureKBAvailable } from './kb-availability'
import { announceDownload } from './download-ui'

describe('Download UI', () => {
  it('should display download start message', async () => {
    vi.clearAllMocks()
    const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    const testVersion = '0.2.0'
    const fs = new InMemoryFileSystemService({}, '/', '/')

    const httpClient = new MockHttpClientService()

    // Create valid ZIP data
    const validZipData = JSON.stringify({ 'manifest.json': '{}' })
    const headResponse = toIncomingMessage(
      buildTestResponse(200, { 'content-length': validZipData.length.toString() }),
    )
    const fileResp = toIncomingMessage(
      buildTestResponse(200, { 'content-length': validZipData.length.toString() }, validZipData),
    )
    const checksumResp = toIncomingMessage(buildTestResponse(404))

    httpClient.setRequestResponses([headResponse])
    httpClient.setGetResponses([fileResp, checksumResp])

    await ensureKBAvailable(testVersion, { httpClient, fs })

    expect(consoleLogSpy).toHaveBeenCalledWith(
      expect.stringContaining('KB not found, downloading v0.2.0 from GitHub'),
    )

    consoleLogSpy.mockRestore()
  })

  it('should display success message after installation', async () => {
    vi.clearAllMocks()
    const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    const testVersion = '0.2.0'
    const fs = new InMemoryFileSystemService({}, '/', '/')

    const httpClient = new MockHttpClientService()

    // Create valid ZIP data
    const validZipData = JSON.stringify({ 'manifest.json': '{}' })
    const headResponse = toIncomingMessage(
      buildTestResponse(200, { 'content-length': validZipData.length.toString() }),
    )
    const fileResp = toIncomingMessage(
      buildTestResponse(200, { 'content-length': validZipData.length.toString() }, validZipData),
    )
    const checksumResp = toIncomingMessage(buildTestResponse(404))

    httpClient.setRequestResponses([headResponse])
    httpClient.setGetResponses([fileResp, checksumResp])

    await ensureKBAvailable(testVersion, { httpClient, fs })

    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('✅ KB v0.2.0 installed'))

    consoleLogSpy.mockRestore()
  })
})

describe('announceDownload (#548 AC-9)', () => {
  it('names no version for a custom URL', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    announceDownload('0.4.3', 'https://kb.example.com/kb.zip')
    const out = log.mock.calls.map(c => String(c[0])).join('\n')
    log.mockRestore()
    expect(out).toContain('downloading from https://kb.example.com/kb.zip')
    expect(out).not.toMatch(/0\.4\.3|downloading v/)
  })
})
