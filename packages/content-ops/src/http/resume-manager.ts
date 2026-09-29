/**
 * Download resume management utilities for HTTP downloads
 */

import type { ClientRequest, IncomingMessage } from 'http'
import type { FileSystemService } from '../file-system'
import { cleanupFile } from '../file-system'
import type { HttpClientService } from './http-client-service'
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
  httpClient: HttpClientService
  progressWriter?: ProgressWriter | undefined
  isTTY?: boolean | undefined
}

export interface ContentLengthProbeOptions {
  /** Redirect hops followed; one more redirect resolves 0. Default 5 */
  maxRedirects?: number
  /** Per-probe timeout; on expiry the request is destroyed and the probe resolves 0. Default 10_000 */
  timeoutMs?: number
}

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308])
const DEFAULT_MAX_REDIRECTS = 5
const DEFAULT_PROBE_TIMEOUT_MS = 10_000

/**
 * Get content length via HEAD request, through the injected client (never `https` directly:
 * a hardwired probe made every mocked download hit the real network).
 * Follows redirects (GitHub release URLs answer 302), bounded; resolves 0 on error, timeout
 * or redirect loop.
 */
export function getContentLength(
  url: string,
  httpClient: HttpClientService,
  options: ContentLengthProbeOptions = {},
): Promise<number> {
  const maxRedirects = options.maxRedirects ?? DEFAULT_MAX_REDIRECTS
  const timeoutMs = options.timeoutMs ?? DEFAULT_PROBE_TIMEOUT_MS

  return new Promise(resolve => {
    let settled = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const finish = (value: number): void => {
      if (settled) return
      settled = true
      if (timer) clearTimeout(timer)
      resolve(value)
    }

    const onResponse = (response: IncomingMessage, currentUrl: string, hops: number): void => {
      if (settled) return
      if (timer) clearTimeout(timer)
      response.resume?.()
      const next = redirectTarget(response, currentUrl)
      if (next === undefined) return finish(parseContentLength(response))
      if (next === null || hops >= maxRedirects) return finish(0)
      probe(next, hops + 1)
    }

    const probe = (currentUrl: string, hops: number): void => {
      if (timer) clearTimeout(timer)
      let request: ClientRequest
      try {
        request = httpClient.request(currentUrl, { method: 'HEAD' }, response =>
          onResponse(response, currentUrl, hops),
        )
      } catch {
        return finish(0)
      }
      timer = setTimeout(() => {
        request.destroy()
        finish(0)
      }, timeoutMs)
      request.on('error', () => finish(0))
      request.end()
    }

    probe(url, 0)
  })
}

function parseContentLength(response: IncomingMessage): number {
  return parseInt(response.headers['content-length'] || '0', 10) || 0
}

/** undefined: not a redirect; null: redirect with an unusable location; string: next URL */
function redirectTarget(response: IncomingMessage, currentUrl: string): string | null | undefined {
  const location = response.headers['location']
  if (!REDIRECT_STATUSES.has(response.statusCode ?? 0) || !location) return undefined
  try {
    return new URL(location, currentUrl).toString()
  } catch {
    return null
  }
}

/**
 * Setup resume context by checking content length and partial file
 */
export async function setupResumeContext(ctx: DownloadContext) {
  const totalBytes = await getContentLength(ctx.url, ctx.httpClient)
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
  await cleanupFile(partialPath, fs)
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
