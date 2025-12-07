/**
 * Download resume management utilities
 */

import * as https from 'https'
import type { FileSystemService } from '@pair/content-ops'
import type { ProgressWriter } from './progress-reporter'

// Diagnostic logging (PAIR_DIAG=1)
const DIAG = process.env['PAIR_DIAG'] === '1' || process.env['PAIR_DIAG'] === 'true'

function logDiag(message: string): void {
  if (DIAG) console.error(`[diag] ${message}`)
}

export interface ResumeDecision {
  shouldResume: boolean
  bytesDownloaded: number
}

export interface DownloadContext {
  url: string
  destination: string
  fs: FileSystemService
  progressWriter?: ProgressWriter | undefined
  isTTY?: boolean | undefined
}

/**
 * Get content length via HEAD request
 */
export function getContentLength(url: string): Promise<number> {
  return new Promise(resolve => {
    const request = https.request(url, { method: 'HEAD' }, response => {
      const contentLength = parseInt(response.headers['content-length'] || '0', 10)
      resolve(contentLength)
    })
    request.on('error', () => resolve(0))
    request.end()
  })
}

/**
 * Setup resume context by checking content length and partial file
 */
export async function setupResumeContext(ctx: DownloadContext) {
  const totalBytes = await getContentLength(ctx.url)
  const resumeDecision = await shouldResume(ctx.destination, totalBytes, ctx.fs)

  if (resumeDecision.shouldResume) {
    logDiag(`Resuming download from byte ${resumeDecision.bytesDownloaded} of ${totalBytes}`)
  }

  return {
    totalBytes,
    resumeFrom: resumeDecision.shouldResume ? resumeDecision.bytesDownloaded : 0,
  }
}

/**
 * Finalize download by renaming partial file to destination
 */
export async function finalizeDownload(
  destination: string,
  partialPath: string,
  resumeFrom: number,
  fs: FileSystemService,
): Promise<void> {
  if (resumeFrom <= 0) return

  const content = fs.readFileSync(partialPath)
  await fs.writeFile(destination, content)
  await cleanupPartialFile(destination, fs)
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
 * @param fs - Filesystem service
 * @returns True if partial file exists
 */
export async function hasPartialDownload(
  filePath: string,
  fs: FileSystemService,
): Promise<boolean> {
  const partialPath = getPartialFilePath(filePath)
  return fs.existsSync(partialPath)
}

/**
 * Get the size of a partial download file
 * @param filePath - Original file path
 * @param fs - Filesystem service
 * @returns Size in bytes, or 0 if file doesn't exist
 */
export async function getPartialFileSize(filePath: string, fs: FileSystemService): Promise<number> {
  const partialPath = getPartialFilePath(filePath)

  try {
    if (!fs.existsSync(partialPath)) return 0
    const content = fs.readFileSync(partialPath)
    return Buffer.from(content).length
  } catch {
    return 0
  }
}

/**
 * Delete a partial download file
 * @param filePath - Original file path
 * @param fs - Filesystem service
 */
export async function cleanupPartialFile(filePath: string, fs: FileSystemService): Promise<void> {
  const partialPath = getPartialFilePath(filePath)

  try {
    if (fs.existsSync(partialPath)) {
      await fs.unlink(partialPath)
    }
  } catch {
    // Ignore errors (file might not exist)
  }
}

/**
 * Determine if download should resume
 * @param filePath - Original file path
 * @param totalBytes - Total file size from Content-Length header
 * @param fs - Filesystem service
 * @returns Resume decision with bytes already downloaded
 */
export async function shouldResume(
  filePath: string,
  totalBytes: number,
  fs: FileSystemService,
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
