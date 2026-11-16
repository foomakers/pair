/**
 * Checksum validation utilities for file integrity verification
 */

import { createHash } from 'crypto'
import type { FileSystemService } from './file-system-service'

export interface ChecksumValidationResult {
  isValid: boolean
  actualChecksum: string
  expectedChecksum: string
}

/**
 * Calculate SHA256 hash of a file
 * @param filePath - Path to file
 * @param fs - Filesystem service
 * @returns SHA256 hash as hex string
 */
export async function calculateSHA256(filePath: string, fs: FileSystemService): Promise<string> {
  const hash = createHash('sha256')
  hash.update(await fs.readFileBytes(filePath))
  return hash.digest('hex')
}

/**
 * Validate file checksum
 * @param filePath - Path to file
 * @param expectedChecksum - Expected SHA256 hash
 * @param fs - Filesystem service
 * @returns Validation result
 */
export async function validateChecksum(
  filePath: string,
  expectedChecksum: string,
  fs: FileSystemService,
): Promise<ChecksumValidationResult> {
  const actualChecksum = await calculateSHA256(filePath, fs)

  // Case-insensitive comparison
  const isValid = actualChecksum.toLowerCase() === expectedChecksum.toLowerCase()

  return {
    isValid,
    actualChecksum,
    expectedChecksum,
  }
}

/**
 * Get expected checksum from checksum file content
 * @param checksumContent - Content of .sha256 file, or null if not found
 * @returns Extracted checksum or null
 */
export async function getExpectedChecksum(checksumContent: string | null): Promise<string | null> {
  if (!checksumContent) return null

  // Trim whitespace
  const trimmed = checksumContent.trim()

  // Format 1: Just the hash
  if (/^[a-f0-9]{64}$/i.test(trimmed)) {
    return trimmed
  }

  // Format 2: "hash  filename" (common in .sha256 files)
  const match = trimmed.match(/^([a-f0-9]{64})\s+/i)
  if (match && match[1]) {
    return match[1]
  }

  // Fallback: treat entire content as hash
  return trimmed
}
