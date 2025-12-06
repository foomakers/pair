import * as https from 'https'
import { IncomingMessage } from 'http'
import { createWriteStream } from 'fs'
import type { FileSystemService } from '@pair/content-ops'
import { ProgressReporter, type ProgressWriter } from './progress-reporter'
import {
  getPartialFilePath,
  cleanupPartialFile,
  setupResumeContext,
  finalizeDownload,
  type DownloadContext,
} from './resume-manager'

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

function writeToRealFs(
  response: IncomingMessage,
  destination: string,
  progressReporter?: ProgressReporter,
  resumeFrom?: number,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const flags = resumeFrom && resumeFrom > 0 ? 'a' : 'w'
    const fileStream = createWriteStream(destination, { flags })
    let bytesDownloaded = resumeFrom || 0

    response.on('data', (chunk: Buffer) => {
      bytesDownloaded += chunk.length
      if (progressReporter) {
        progressReporter.update(bytesDownloaded)
      }
    })

    response.pipe(fileStream)
    fileStream.on('finish', () => {
      fileStream.close()
      resolve()
    })
    fileStream.on('error', reject)
  })
}

interface ProgressReporterContext {
  totalBytes: number
  resumeFrom: number
  progressWriter?: ProgressWriter | undefined
  isTTY?: boolean | undefined
}

function createProgressReporter(
  response: IncomingMessage,
  context: ProgressReporterContext,
): ProgressReporter | undefined {
  const { totalBytes, resumeFrom, progressWriter, isTTY } = context
  if (!progressWriter) return undefined

  const contentLength = parseInt(response.headers['content-length'] || '0', 10)
  const total = contentLength > 0 ? contentLength + resumeFrom : totalBytes

  if (total <= 0) return undefined

  const reporter = new ProgressReporter(
    total,
    isTTY !== undefined ? isTTY : process.stdout.isTTY || false,
    progressWriter,
  )

  if (resumeFrom > 0) {
    reporter.update(resumeFrom)
  }

  return reporter
}

interface DownloadOptions {
  fs?: FileSystemService | undefined
  progressWriter?: ProgressWriter | undefined
  isTTY?: boolean | undefined
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
  fs: FileSystemService | undefined
  progressReporter: ProgressReporter | undefined
}): Promise<void> {
  const { destination, partialPath, resumeFrom, fs, progressReporter } = params
  if (progressReporter) {
    progressReporter.complete()
  }
  await finalizeDownload(destination, partialPath, resumeFrom, fs)
}

// use getContentLength from resume-manager

function handleHttpError(statusCode: number, url: string): Error | null {
  if (statusCode === 404) {
    const version = url.match(/v(\d+\.\d+\.\d+)/)?.[1] || 'unknown'
    return new Error(
      `KB v${version} not found (404). Download manually from: ${url.replace(/\/[^/]+\.zip$/, '')}`,
    )
  }
  if (statusCode === 403) {
    return new Error(`Access denied (403). Check network/permissions. URL: ${url}`)
  }
  if (statusCode !== 200 && statusCode !== 206) {
    return new Error(`Download failed: HTTP ${statusCode}`)
  }
  return null
}

function executeDownload(params: {
  url: string
  destination: string
  targetPath: string
  partialPath: string
  resumeFrom: number
  totalBytes: number
  fs?: FileSystemService | undefined
  progressWriter?: ProgressWriter | undefined
  isTTY?: boolean | undefined
  options: DownloadOptions
}): Promise<void> {
  const { url, destination, resumeFrom, fs, options } = params

  return new Promise((resolve, reject) => {
    const headers: Record<string, string> = resumeFrom > 0 ? { Range: `bytes=${resumeFrom}-` } : {}

    const request = https.get(url, { headers }, response => {
      handleDownloadResponse({ response, params, resolve, reject, url, destination, options })
    })

    request.on('error', async error => {
      await cleanupPartialFile(destination, fs)
      reject(new Error(`Network error downloading KB: ${error.message}. Check connectivity.`))
    })
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
    fs?: FileSystemService | undefined
    progressWriter?: ProgressWriter | undefined
    isTTY?: boolean | undefined
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

  const error = handleHttpError(response.statusCode || 0, url)
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
    fs?: FileSystemService | undefined
    progressWriter?: ProgressWriter | undefined
    isTTY?: boolean | undefined
  }
  resolve: (value: void | PromiseLike<void>) => void
  reject: (reason: unknown) => void
}): void {
  const { response, params, resolve, reject } = ctx
  const { targetPath, resumeFrom, totalBytes, fs, progressWriter, isTTY, destination } = params

  const progressReporter = createProgressReporter(response, {
    totalBytes,
    resumeFrom,
    progressWriter,
    isTTY,
  })

  const writePromise = fs
    ? writeToInMemoryFs(response, targetPath, fs, { progressReporter, resumeFrom })
    : writeToRealFs(response, targetPath, progressReporter, resumeFrom)

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

export async function downloadFile(
  url: string,
  destination: string,
  options: DownloadOptions = {},
): Promise<void> {
  const { fs, progressWriter, isTTY } = options
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
    options,
  })
}
