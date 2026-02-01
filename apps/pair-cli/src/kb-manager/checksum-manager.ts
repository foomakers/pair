import type { FileSystemService, HttpClientService } from '@pair/content-ops'
import { getExpectedChecksum, validateChecksum } from '@pair/content-ops'

async function fetchChecksumFile(
  url: string,
  httpClient: HttpClientService,
): Promise<string | null> {
  return new Promise(resolve => {
    httpClient
      .get(url, response => {
        if (response.statusCode === 404) {
          resolve(null)
          return
        }

        if (response.statusCode !== 200) {
          resolve(null)
          return
        }

        let data = ''
        response.on('data', chunk => {
          data += chunk
        })
        response.on('end', () => resolve(data))
        response.on('error', () => resolve(null))
      })
      .on('error', () => resolve(null))
  })
}

export async function validateFileWithRemoteChecksum(
  downloadUrl: string,
  filePath: string,
  httpClient: HttpClientService,
  fs?: FileSystemService,
): Promise<{ isValid: boolean; expectedChecksum?: string; actualChecksum?: string }> {
  const checksumUrl = `${downloadUrl}.sha256`

  const checksumContent = await fetchChecksumFile(checksumUrl, httpClient)
  if (!checksumContent) return { isValid: true }

  const expectedChecksum = await getExpectedChecksum(checksumContent)
  if (!expectedChecksum) return { isValid: true }

  if (!/^[a-f0-9]{64}$/i.test(expectedChecksum)) {
    return { isValid: true }
  }

  const result = await validateChecksum(filePath, expectedChecksum, fs)
  return {
    isValid: result.isValid,
    expectedChecksum: result.expectedChecksum,
    actualChecksum: result.actualChecksum,
  }
}

export default {
  fetchChecksumFile,
  validateFileWithRemoteChecksum,
}
