import { describe, it, expect, vi } from 'vitest'

vi.mock('https', () => ({
  get: vi.fn(),
  request: vi.fn(),
}))

import * as https from 'https'
import { InMemoryFileSystemService } from '@pair/content-ops'
import { ensureKBAvailable } from './kb-availability'
import {
  mockMultipleHttpsGet,
  mockHttpsRequest,
  buildTestResponse,
  toIncomingMessage,
} from '../test-utils/http-mocks'

const mockExtract = vi.fn()

describe('Download UI', () => {
  beforeEach(() => {
    vi.mocked(https.request).mockImplementation(
      mockHttpsRequest(toIncomingMessage(buildTestResponse(200, { 'content-length': '1024' }))),
    )
  })
  it('should display download start message', async () => {
    vi.clearAllMocks()
    mockExtract.mockReset().mockResolvedValue(undefined)
    const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    const testVersion = '0.2.0'
    const fs = new InMemoryFileSystemService({}, '/', '/')

    const headResponse = toIncomingMessage(buildTestResponse(200, { 'content-length': '1024' }))
    vi.mocked(https.request).mockImplementation(mockHttpsRequest(headResponse))

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

  it('should display success message after installation', async () => {
    vi.clearAllMocks()
    mockExtract.mockReset().mockResolvedValue(undefined)
    const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    const testVersion = '0.2.0'
    const fs = new InMemoryFileSystemService({}, '/', '/')

    const headResponse = toIncomingMessage(buildTestResponse(200, { 'content-length': '1024' }))
    vi.mocked(https.request).mockImplementation(mockHttpsRequest(headResponse))

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
