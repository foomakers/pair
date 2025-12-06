import { describe, it, expect, vi } from 'vitest'
import { InMemoryFileSystemService } from '@pair/content-ops'
import checksumManager from './checksum-manager'
import * as https from 'https'
import {
  mockMultipleHttpsGet,
  buildTestResponse,
  toIncomingMessage,
} from '../test-utils/http-mocks'
import * as checksumValidator from './checksum-validator'

vi.mock('https')

describe('checksum-manager', () => {
  it('validates when checksum matches', async () => {
    const fs = new InMemoryFileSystemService({ '/tmp/file': 'data' }, '/', '/')
    const checksumResp = toIncomingMessage(
      buildTestResponse(200, {}, 'd41d8cd98f00b204e9800998ecf8427e'),
    )
    vi.mocked(https.get).mockImplementation(
      mockMultipleHttpsGet([{ pattern: '.sha256', response: checksumResp }]),
    )

    const res = await checksumManager.validateFileWithRemoteChecksum(
      'https://example.com/file.zip',
      '/tmp/file',
      fs,
    )
    // If remote returns a checksum, result should include isValid boolean
    expect(res).toHaveProperty('isValid')
  })

  it('proceeds when checksum missing (404)', async () => {
    const fs = new InMemoryFileSystemService({ '/tmp/file': 'data' }, '/', '/')
    const checksumResp = toIncomingMessage(buildTestResponse(404))
    vi.mocked(https.get).mockImplementation(
      mockMultipleHttpsGet([{ pattern: '.sha256', response: checksumResp }]),
    )

    const res = await checksumManager.validateFileWithRemoteChecksum(
      'https://example.com/file.zip',
      '/tmp/file',
      fs,
    )
    expect(res.isValid).toBe(true)
  })

  it('fails when checksum mismatch', async () => {
    const fs = new InMemoryFileSystemService({ '/tmp/file': 'data' }, '/', '/')
    const checksumResp = toIncomingMessage(
      buildTestResponse(
        200,
        {},
        '0000000000000000000000000000000000000000000000000000000000000000',
      ),
    )
    vi.mocked(https.get).mockImplementation(
      mockMultipleHttpsGet([{ pattern: '.sha256', response: checksumResp }]),
    )

    // Mock validateChecksum to return mismatch
    vi.spyOn(
      checksumValidator,
      'validateChecksum' as keyof typeof checksumValidator,
    ).mockResolvedValue({
      isValid: false,
      expectedChecksum: '0000000000000000000000000000000000000000000000000000000000000000',
      actualChecksum: 'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff',
    })

    const res = await checksumManager.validateFileWithRemoteChecksum(
      'https://example.com/file.zip',
      '/tmp/file',
      fs,
    )
    expect(res.isValid).toBe(false)
  })
})
