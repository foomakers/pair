import { join } from 'path'
import { homedir, tmpdir } from 'os'
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
import { validateChecksum, getExpectedChecksum } from './checksum-validator'

// Diagnostic logging (PAIR_DIAG=1)
const DIAG = process.env['PAIR_DIAG'] === '1' || process.env['PAIR_DIAG'] === 'true'

interface HttpError extends Error {
  statusCode?: number
}

export interface KBManagerDeps {
  fs?: FileSystemService
  extract?: (zipPath: string, targetPath: string) => Promise<void>
  progressWriter?: ProgressWriter
  isTTY?: boolean
  customUrl?: string
}

/**
 * Get the cache path for a specific KB version
 * @param version Version string (with or without leading 'v')
 * @returns Absolute path to KB cache directory
 */
export function getCachedKBPath(version: string): string {
  const cleanVersion = version.startsWith('v') ? version.slice(1) : version
  return join(homedir(), '.pair', 'kb', cleanVersion)
}

/**
 * Check if KB is cached locally
 * @param version Version string
 * @param fs Optional filesystem service (for testing)
 * @returns True if KB exists in cache
 */
export async function isKBCached(version: string, fs?: FileSystemService): Promise<boolean> {
  try {
    const cachePath = getCachedKBPath(version)
    logDiag(`Checking KB cache at ${cachePath}`)
    if (fs) {
      return fs.existsSync(cachePath)
    }
    // Production: use fs-extra pathExists
    const { pathExists } = await import('fs-extra')
    const exists = await pathExists(cachePath)
    logDiag(`Cache ${exists ? 'hit' : 'miss'}`)
    return exists
  } catch {
    return false
  }
}

/**
 * Ensure KB is available, downloading if necessary
 * @param version Version string
 * @param deps Optional dependencies (fs, extract) for testing
 * @returns Path to KB cache directory
 */
export async function ensureKBAvailable(version: string, deps?: KBManagerDeps): Promise<string> {
  const cachePath = getCachedKBPath(version)
  const cached = await isKBCached(version, deps?.fs)

  if (cached) {
    logDiag(`Using cached KB at ${cachePath}`)
    return cachePath
  }

  return downloadAndInstallKB(version, cachePath, deps)
}

async function downloadAndInstallKB(
  version: string,
  cachePath: string,
  deps?: KBManagerDeps,
): Promise<string> {
  const fs = deps?.fs
  const extract = deps?.extract || defaultExtract
  const cleanVersion = version.startsWith('v') ? version.slice(1) : version

  logDiag(`KB cache miss, downloading v${version} from GitHub`)
  console.log(`KB not found, downloading v${version} from GitHub...`)

  const downloadUrl = deps?.customUrl || buildDownloadUrl(version)
  const zipPath = join(tmpdir(), `kb-${cleanVersion}.zip`)

  logDiag(`Download URL: ${downloadUrl}`)
  logDiag(`Temp ZIP path: ${zipPath}`)

  try {
    await ensureCacheDirectory(cachePath, fs)
    logDiag('Starting KB download...')
    await downloadFile(downloadUrl, zipPath, {
      fs,
      progressWriter: deps?.progressWriter,
      isTTY: deps?.isTTY,
    })
    logDiag(`Download complete, validating checksum...`)

    // Validate checksum if available
    await validateDownloadChecksum(downloadUrl, zipPath, fs)

    logDiag(`Checksum valid, extracting to ${cachePath}`)
    await extract(zipPath, cachePath)
    logDiag('Extraction complete, cleaning up ZIP')
    await cleanupZip(zipPath, fs)

    console.log(`✅ KB v${cleanVersion} installed at ${cachePath}`)
    logDiag('KB installation successful')
    return cachePath
  } catch (error) {
    logDiag(`KB installation failed: ${String(error)}`)
    await cleanupZip(zipPath, fs)
    throw error
  }
}

function buildDownloadUrl(version: string): string {
  const cleanVersion = version.startsWith('v') ? version.slice(1) : version
  const tagVersion = version.startsWith('v') ? version : `v${version}`
  const assetName = `knowledge-base-${cleanVersion}.zip`
  return `https://github.com/foomakers/pair/releases/download/${tagVersion}/${assetName}`
}

/**
 * Validate downloaded file checksum if .sha256 file is available
 */
async function validateDownloadChecksum(
  downloadUrl: string,
  filePath: string,
  fs?: FileSystemService,
): Promise<void> {
  const checksumUrl = `${downloadUrl}.sha256`

  try {
    // Try to fetch checksum file
    const checksumContent = await fetchChecksumFile(checksumUrl)
    if (!checksumContent) {
      logDiag('No checksum file found, skipping validation')
      return
    }

    const expectedChecksum = await getExpectedChecksum(checksumContent)
    if (!expectedChecksum) {
      logDiag('Could not extract checksum from file, skipping validation')
      return
    }

    // Only validate when checksum looks like a SHA256 hex string
    if (!/^[a-f0-9]{64}$/i.test(expectedChecksum)) {
      logDiag('Checksum content is not a valid SHA256 hash, skipping validation')
      return
    }

    logDiag(`Expected checksum: ${expectedChecksum}`)
    const result = await validateChecksum(filePath, expectedChecksum, fs)

    if (!result.isValid) {
      throw new Error(
        `Checksum validation failed!\n` +
          `Expected: ${result.expectedChecksum}\n` +
          `Actual:   ${result.actualChecksum}\n` +
          `File may be corrupted. Please retry the download.`,
      )
    }

    logDiag('Checksum validation passed')
  } catch (error) {
    // If checksum file doesn't exist (404), skip validation
    const httpError = error as HttpError
    if (httpError.message?.includes('404')) {
      logDiag('Checksum file not found (404), skipping validation')
      return
    }
    throw error
  }
}

/**
 * Fetch checksum file content
 */
function fetchChecksumFile(url: string): Promise<string | null> {
  return new Promise(resolve => {
    https
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

function logDiag(message: string): void {
  if (DIAG) console.error(`[diag] ${message}`)
}

async function defaultExtract(zipPath: string, targetPath: string): Promise<void> {
  const AdmZip = (await import('adm-zip')).default
  const zip = new AdmZip(zipPath)
  zip.extractAllTo(targetPath, true)
}

async function ensureCacheDirectory(cachePath: string, fs?: FileSystemService): Promise<void> {
  if (fs) {
    await fs.mkdir(cachePath, { recursive: true })
  } else {
    const { ensureDir } = await import('fs-extra')
    await ensureDir(cachePath)
  }
}

async function cleanupZip(zipPath: string, fs?: FileSystemService): Promise<void> {
  try {
    if (fs) {
      if (fs.existsSync(zipPath)) {
        await fs.unlink(zipPath)
      }
    } else {
      const { remove } = await import('fs-extra')
      await remove(zipPath)
    }
  } catch {
    // Ignore cleanup errors
  }
}

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

/**
 * Download file via HTTPS with optional progress reporting and resume support
 */
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

async function downloadFile(
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

/**
 * Execute download with promise-based HTTPS request
 */
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

/**
 * Handle download HTTP response
 */
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

/**
 * Process download stream and handle completion
 */
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
