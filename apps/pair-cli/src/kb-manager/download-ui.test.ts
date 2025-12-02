import { describe, it, expect, vi } from 'vitest'
import * as https from 'https'
import { InMemoryFileSystemService } from '@pair/content-ops'
import { ensureKBAvailable } from './kb-manager'
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
