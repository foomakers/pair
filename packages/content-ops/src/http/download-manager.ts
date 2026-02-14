/**
 * Generic HTTP download manager with resume capability
 */

import type { IncomingMessage, ClientRequest, RequestOptions } from 'http'
import type { FileSystemService } from '../file-system'
import type { HttpClientService } from './http-client-service'
import { ProgressReporter, type ProgressWriter } from './progress-reporter'
import {
  getPartialFilePath,
  cleanupPartialFile,
  setupResumeContext,
  finalizeDownload,
  type DownloadContext,
} from './resume-manager'

/**
 * Custom error handler interface for download errors
 * Allows callers to provide domain-specific error messages
 */
export interface DownloadErrorHandler {
  /**
   * Handle HTTP errors with custom messages
   * @param statusCode - HTTP status code
   * @param url - Request URL
   * @returns Error object or null to use default handling
   */
  handleHttpError(statusCode: number, url: string): Error | null

  /**
   * Handle network errors with custom messages
   * @param error - Original error
   * @param url - Request URL
   * @returns Error object
   */
  handleNetworkError(error: Error, url: string): Error
}

/**
 * Default error handler with generic messages
 */
const defaultErrorHandler: DownloadErrorHandler = {
  handleHttpError(statusCode: number, url: string): Error | null {
    if (statusCode === 404) {
      return new Error(`Resource not found (404): ${url}`)
    }
    if (statusCode === 403) {
      return new Error(`Access denied (403): ${url}`)
    }
    if (statusCode !== 200 && statusCode !== 206) {
      return new Error(`Download failed: HTTP ${statusCode}`)
    }
    return null
  },

  handleNetworkError(error: Error, url: string): Error {
    return new Error(`Network error: ${error.message}. URL: ${url}`)
  },
}

interface WriteOptions {
  progressReporter?: ProgressReporter | undefined
  resumeFrom?: number | undefined
}

function writeToInMemoryFs(
  response: IncomingMessage,
  destination: string,
  fs: FileSystemService,
  options: WriteOptions = {},
): Promise<void> {
  return new Promise((resolve, reject) => {
    const { progressReporter, resumeFrom = 0 } = options
    const chunks: Buffer[] = []
    let bytesDownloaded = resumeFrom

    response.on('data', (chunk: Buffer) => {
      chunks.push(chunk)
      bytesDownloaded += chunk.length
      if (progressReporter) {
        progressReporter.update(bytesDownloaded)
      }
    })

    response.on('end', () => {
      try {
        const newData = Buffer.concat(chunks)

        // If resuming, append to existing data
        if (resumeFrom > 0 && fs.existsSync(destination)) {
          const existingData = fs.readFileSync(destination)
          const combined = Buffer.concat([Buffer.from(existingData), newData])
          fs.writeFile(destination, combined.toString())
        } else {
          fs.writeFile(destination, newData.toString())
        }
        resolve()
      } catch (error) {
        reject(error)
      }
    })
    response.on('error', reject)
  })
}

interface ProgressReporterContext {
  totalBytes: number
  resumeFrom: number
  progressWriter?: ProgressWriter | undefined
  isTTY?: boolean | undefined
  label?: string | undefined
}

function createProgressReporter(
  response: IncomingMessage,
  context: ProgressReporterContext,
): ProgressReporter | undefined {
  const { totalBytes, resumeFrom, progressWriter, isTTY, label } = context
  if (!progressWriter) return undefined

  const contentLength = parseInt(response.headers['content-length'] || '0', 10)
  const total = contentLength > 0 ? contentLength + resumeFrom : totalBytes

  if (total <= 0) return undefined

  const reporter = new ProgressReporter(
    total,
    isTTY !== undefined ? isTTY : process.stdout.isTTY || false,
    progressWriter,
    label,
  )

  if (resumeFrom > 0) {
    reporter.update(resumeFrom)
  }

  return reporter
}

export interface DownloadOptions {
  httpClient: HttpClientService
  fs: FileSystemService
  progressWriter?: ProgressWriter | undefined
  isTTY?: boolean | undefined
  label?: string | undefined
  errorHandler?: DownloadErrorHandler | undefined
}

function handleRedirect(params: {
  response: IncomingMessage
  url: string
  destination: string
  options: DownloadOptions
  resolve: (value: void | PromiseLike<void>) => void
  reject: (reason?: unknown) => void
}): boolean {
  const { response, destination, options, resolve, reject } = params
  if (response.statusCode === 301 || response.statusCode === 302) {
    const redirectUrl = response.headers.location
    if (redirectUrl) {
      downloadFile(redirectUrl, destination, options).then(resolve).catch(reject)
      return true
    }
  }
  return false
}

async function handleDownloadSuccess(params: {
  destination: string
  partialPath: string
  resumeFrom: number
  fs: FileSystemService
  progressReporter: ProgressReporter | undefined
}): Promise<void> {
  const { destination, partialPath, resumeFrom, fs, progressReporter } = params
  if (progressReporter) {
    progressReporter.complete()
  }
  await finalizeDownload(destination, partialPath, resumeFrom, fs)
}

function executeDownload(params: {
  url: string
  destination: string
  targetPath: string
  partialPath: string
  resumeFrom: number
  totalBytes: number
  fs: FileSystemService
  progressWriter?: ProgressWriter | undefined
  isTTY?: boolean | undefined
  label?: string | undefined
  options: DownloadOptions
}): Promise<void> {
  const { url, destination, resumeFrom, fs, options } = params
  const { httpClient } = options

  return new Promise((resolve, reject) => {
    const headers: Record<string, string> = resumeFrom > 0 ? { Range: `bytes=${resumeFrom}-` } : {}

    const errorCallback = (error: Error) => {
      cleanupPartialFile(destination, fs)
        .then(() => {
          const errorHandler = options.errorHandler || defaultErrorHandler
          reject(errorHandler.handleNetworkError(error, url))
        })
        .catch(reject)
    }

    const successCallback = (response: IncomingMessage) => {
      handleDownloadResponse({ response, params, resolve, reject, url, destination, options })
    }

    ;(
      httpClient.get as unknown as (
        url: string,
        options: RequestOptions,
        callback: (res: IncomingMessage) => void,
        errorCallback: (error: Error) => void,
      ) => ClientRequest
    )(url, { headers }, successCallback, errorCallback)
  })
}

function handleDownloadResponse(ctx: {
  response: IncomingMessage
  params: {
    url: string
    destination: string
    targetPath: string
    partialPath: string
    resumeFrom: number
    totalBytes: number
    fs: FileSystemService
    progressWriter?: ProgressWriter | undefined
    isTTY?: boolean | undefined
    label?: string | undefined
    options: DownloadOptions
  }
  resolve: (value: void | PromiseLike<void>) => void
  reject: (reason: unknown) => void
  url: string
  destination: string
  options: DownloadOptions
}): void {
  const { response, params, resolve, reject, url, destination, options } = ctx

  if (handleRedirect({ response, url, destination, options, resolve, reject })) return

  const errorHandler = options.errorHandler || defaultErrorHandler
  const error = errorHandler.handleHttpError(response.statusCode || 0, url)
  if (error) {
    reject(error)
    return
  }

  processDownloadStream({ response, params, resolve, reject })
}

function processDownloadStream(ctx: {
  response: IncomingMessage
  params: {
    targetPath: string
    partialPath: string
    resumeFrom: number
    totalBytes: number
    destination: string
    fs: FileSystemService
    progressWriter?: ProgressWriter | undefined
    isTTY?: boolean | undefined
    label?: string | undefined
  }
  resolve: (value: void | PromiseLike<void>) => void
  reject: (reason: unknown) => void
}): void {
  const { response, params, resolve, reject } = ctx
  const { targetPath, resumeFrom, totalBytes, fs, progressWriter, isTTY, label, destination } =
    params

  const progressReporter = createProgressReporter(response, {
    totalBytes,
    resumeFrom,
    progressWriter,
    isTTY,
    label,
  })

  const writePromise = writeToInMemoryFs(response, targetPath, fs, { progressReporter, resumeFrom })

  writePromise
    .then(() =>
      handleDownloadSuccess({
        destination,
        partialPath: params.partialPath,
        resumeFrom,
        fs,
        progressReporter,
      }),
    )
    .then(resolve)
    .catch(async err => {
      await cleanupPartialFile(destination, fs)
      reject(err)
    })
}

/**
 * Download a file from URL with optional resume support
 * @param url - Source URL
 * @param destination - Target file path
 * @param options - Download options including filesystem, progress, and error handling
 */
export async function downloadFile(
  url: string,
  destination: string,
  options: DownloadOptions,
): Promise<void> {
  const { fs } = options
  const { progressWriter, isTTY, label } = options
  const ctx: DownloadContext = { url, destination, fs, progressWriter, isTTY }
  const { totalBytes, resumeFrom } = await setupResumeContext(ctx)

  const partialPath = getPartialFilePath(destination)
  const targetPath = resumeFrom > 0 ? partialPath : destination

  return executeDownload({
    url,
    destination,
    targetPath,
    partialPath,
    resumeFrom,
    totalBytes,
    fs,
    progressWriter,
    isTTY,
    label,
    options,
  })
}
