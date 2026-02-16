import type { IZipEntry } from 'adm-zip'
import { createHash } from 'crypto'
import { comparePathsDeterministic } from '../sort-paths'

export interface ChecksumCheckResult {
  status: 'PASS' | 'FAIL'
  expected: string
  actual: string
  algorithm: string
}

/**
 * Verify package checksum against manifest
 * @param zipEntries - ZIP file entries
 * @param expectedChecksum - Checksum from manifest
 * @returns Check result
 */
export function verifyChecksum(
  zipEntries: IZipEntry[],
  expectedChecksum: string,
): ChecksumCheckResult {
  const hash = createHash('sha256')

  // Get all non-manifest files sorted by entry name for deterministic order
  const contentEntries = zipEntries
    .filter(e => !e.isDirectory && e.entryName !== 'manifest.json')
    .sort((a, b) => comparePathsDeterministic(a.entryName, b.entryName))

  // Hash each file content
  for (const entry of contentEntries) {
    const data = entry.getData()
    hash.update(data)
  }

  const actualChecksum = hash.digest('hex')
  const isValid = actualChecksum.toLowerCase() === expectedChecksum.toLowerCase()

  return {
    status: isValid ? 'PASS' : 'FAIL',
    expected: expectedChecksum,
    actual: actualChecksum,
    algorithm: 'SHA-256',
  }
}
