/**
 * Download resume management utilities
 */

import type { FileSystemService } from '@pair/content-ops'

export interface ResumeDecision {
  shouldResume: boolean
  bytesDownloaded: number
}

/**
 * Get the path for a partial download file
 * @param filePath - Original file path
 * @returns Path with .partial extension
 */
export function getPartialFilePath(filePath: string): string {
  return `${filePath}.partial`
}

/**
 * Check if a partial download exists
 * @param filePath - Original file path
 * @param fs - Optional filesystem service (for testing)
 * @returns True if partial file exists
 */
export async function hasPartialDownload(
  filePath: string,
  fs?: FileSystemService,
): Promise<boolean> {
  const partialPath = getPartialFilePath(filePath)
  
  if (fs) {
    return fs.existsSync(partialPath)
  }
  
  // Production: use fs-extra
  const { pathExists } = await import('fs-extra')
  return pathExists(partialPath)
}

/**
 * Get the size of a partial download file
 * @param filePath - Original file path
 * @param fs - Optional filesystem service (for testing)
 * @returns Size in bytes, or 0 if file doesn't exist
 */
export async function getPartialFileSize(
  filePath: string,
  fs?: FileSystemService,
): Promise<number> {
  const partialPath = getPartialFilePath(filePath)
  
  try {
    if (fs) {
      if (!fs.existsSync(partialPath)) return 0
      const content = fs.readFileSync(partialPath)
      return Buffer.from(content).length
    }
    
    // Production: use fs stat
    const { stat } = await import('fs-extra')
    const stats = await stat(partialPath)
    return stats.size
  } catch {
    return 0
  }
}

/**
 * Delete a partial download file
 * @param filePath - Original file path
 * @param fs - Optional filesystem service (for testing)
 */
export async function cleanupPartialFile(
  filePath: string,
  fs?: FileSystemService,
): Promise<void> {
  const partialPath = getPartialFilePath(filePath)
  
  try {
    if (fs) {
      if (fs.existsSync(partialPath)) {
        await fs.unlink(partialPath)
      }
      return
    }
    
    // Production: use fs-extra
    const { remove } = await import('fs-extra')
    await remove(partialPath)
  } catch {
    // Ignore errors (file might not exist)
  }
}

/**
 * Determine if download should resume
 * @param filePath - Original file path
 * @param totalBytes - Total file size from Content-Length header
 * @param fs - Optional filesystem service (for testing)
 * @returns Resume decision with bytes already downloaded
 */
export async function shouldResume(
  filePath: string,
  totalBytes: number,
  fs?: FileSystemService,
): Promise<ResumeDecision> {
  // Cannot resume without known total size
  if (totalBytes <= 0) {
    return { shouldResume: false, bytesDownloaded: 0 }
  }
  
  const hasPartial = await hasPartialDownload(filePath, fs)
  if (!hasPartial) {
    return { shouldResume: false, bytesDownloaded: 0 }
  }
  
  const partialSize = await getPartialFileSize(filePath, fs)
  
  // Resume only if partial file is smaller than total
  if (partialSize > 0 && partialSize < totalBytes) {
    return { shouldResume: true, bytesDownloaded: partialSize }
  }
  
  return { shouldResume: false, bytesDownloaded: 0 }
}
