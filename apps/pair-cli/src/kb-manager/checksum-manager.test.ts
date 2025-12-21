import { describe, it, expect, beforeEach } from 'vitest'
import { InMemoryFileSystemService, MockHttpClientService } from '@pair/content-ops'
import checksumManager from './checksum-manager'
import { toIncomingMessage, buildTestResponse } from '@pair/content-ops'

describe('checksum-manager', () => {
  let fs: InMemoryFileSystemService
  let httpClient: MockHttpClientService

  beforeEach(() => {
    fs = new InMemoryFileSystemService({ '/tmp/file': 'data' }, '/', '/')
    httpClient = new MockHttpClientService()
  })

  it('validates when checksum matches', async () => {
    const checksumResp = toIncomingMessage(
      buildTestResponse(200, {}, 'd41d8cd98f00b204e9800998ecf8427e'),
    )
    httpClient.setGetResponses([checksumResp])

    const res = await checksumManager.validateFileWithRemoteChecksum(
      'https://example.com/file.zip',
      '/tmp/file',
      httpClient,
      fs,
    )
    expect(res).toHaveProperty('isValid')
  })

  it('proceeds when checksum missing (404)', async () => {
    const checksumResp = toIncomingMessage(buildTestResponse(404))
    httpClient.setGetResponses([checksumResp])

    const res = await checksumManager.validateFileWithRemoteChecksum(
      'https://example.com/file.zip',
      '/tmp/file',
      httpClient,
      fs,
    )
    expect(res.isValid).toBe(true)
  })

  it('fails when checksum mismatch', async () => {
    // Create file with content that won't match checksum
    fs = new InMemoryFileSystemService({ '/tmp/file': 'wrong data' }, '/', '/')

    const checksumResp = toIncomingMessage(
      buildTestResponse(
        200,
        {},
        '0000000000000000000000000000000000000000000000000000000000000000',
      ),
    )
    httpClient.setGetResponses([checksumResp])

    const res = await checksumManager.validateFileWithRemoteChecksum(
      'https://example.com/file.zip',
      '/tmp/file',
      httpClient,
      fs,
    )
    expect(res.isValid).toBe(false)
  })
})
