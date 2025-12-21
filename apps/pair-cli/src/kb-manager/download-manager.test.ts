import { describe, it, expect } from 'vitest'
import { downloadFile } from './download-manager'
import {
  InMemoryFileSystemService,
  MockHttpClientService,
  buildTestResponse,
  toIncomingMessage,
} from '@pair/content-ops'

describe('KB Download Manager', () => {
  it('should throw KB-specific 404 error with version and GitHub URL', async () => {
    const fs = new InMemoryFileSystemService({}, '/', '/')
    const httpClient = new MockHttpClientService()

    const notFoundResponse = toIncomingMessage(buildTestResponse(404, {}))
    const headResponse = toIncomingMessage(buildTestResponse(200, { 'content-length': '0' }))

    httpClient.setRequestResponses([headResponse])
    httpClient.setGetResponses([notFoundResponse])

    await expect(
      downloadFile(
        'https://github.com/foomakers/pair/releases/download/v0.2.0/kb.zip',
        '/tmp/kb.zip',
        { httpClient, fs },
      ),
    ).rejects.toThrow(/KB v0\.2\.0 not found \(404\).*Download manually from/)
  })

  it('should throw KB-specific 403 error', async () => {
    const fs = new InMemoryFileSystemService({}, '/', '/')
    const httpClient = new MockHttpClientService()

    const forbiddenResponse = toIncomingMessage(buildTestResponse(403, {}))
    const headResponse = toIncomingMessage(buildTestResponse(200, { 'content-length': '0' }))

    httpClient.setRequestResponses([headResponse])
    httpClient.setGetResponses([forbiddenResponse])

    await expect(
      downloadFile('https://example.com/kb.zip', '/tmp/kb.zip', { httpClient, fs }),
    ).rejects.toThrow(/Access denied \(403\)/)
  })

  it('should throw KB-specific network error', async () => {
    const fs = new InMemoryFileSystemService({}, '/', '/')
    const httpClient = new MockHttpClientService()

    const headResponse = toIncomingMessage(buildTestResponse(200, { 'content-length': '0' }))

    httpClient.setRequestResponses([headResponse])
    httpClient.setGetError(new Error('ECONNREFUSED'))

    await expect(
      downloadFile('https://example.com/kb.zip', '/tmp/kb.zip', { httpClient, fs }),
    ).rejects.toThrow(/Network error downloading KB.*ECONNREFUSED.*Check connectivity/)
  })
})
