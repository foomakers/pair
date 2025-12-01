import { join } from 'path'
import { homedir, tmpdir } from 'os'
import * as https from 'https'
import { IncomingMessage } from 'http'
import { createWriteStream } from 'fs'
import type { FileSystemService } from '@pair/content-ops'
import { ProgressReporter, type ProgressWriter } from './kb-manager/progress-reporter'
import { shouldResume, getPartialFilePath, cleanupPartialFile } from './kb-manager/resume-manager'
import { validateChecksum, getExpectedChecksum } from './kb-manager/checksum-validator'

interface WriteOptions {
  progressReporter?: ProgressReporter | undefined
  resumeFrom?: number | undefined
}

interface ProgressConfig {
  resumeFrom: number
  totalBytes: number
  progressWriter?: ProgressWriter | undefined
  isTTY?: boolean | undefined
}

interface DownloadDeps {
  fs?: FileSystemService | undefined
  progressWriter?: ProgressWriter | undefined
  isTTY?: boolean | undefined
}

// Diagnostic logging (PAIR_DIAG=1)
const DIAG = process.env['PAIR_DIAG'] === '1' || process.env['PAIR_DIAG'] === 'true'

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
    const checksumContent = await fetchChecksumFile(checksumUrl)
    if (!checksumContent) {
      logDiag('No checksum file found, skipping validation')
      return
    }

    await performChecksumValidation(filePath, checksumContent, fs)
    logDiag('Checksum validation passed')
  } catch (error) {
    handleChecksumError(error)
  }
}

/**
 * Perform checksum validation
 */
async function performChecksumValidation(
  filePath: string,
  checksumContent: string,
  fs?: FileSystemService,
): Promise<void> {
  const expectedChecksum = await getExpectedChecksum(checksumContent)
  if (!expectedChecksum) {
    logDiag('Could not extract checksum from file, skipping validation')
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
}

/**
 * Handle checksum validation errors
 */
function handleChecksumError(error: unknown): void {
  const isError = error && typeof error === 'object' && error !== null
  const hasMessage = isError && 'message' in error && typeof error.message === 'string'
  const is404 =
    hasMessage &&
    typeof (error as { message: string }).message === 'string' &&
    (error as { message: string }).message.includes('404')

  if (is404) {
    logDiag('Checksum file not found (404), skipping validation')
    return
  }
  throw error
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
  options: WriteOptions = {},
): Promise<void> {
  return new Promise((resolve, reject) => {
    const { progressReporter, resumeFrom = 0 } = options
    const flags = resumeFrom > 0 ? 'a' : 'w'
    const fileStream = createWriteStream(destination, { flags })
    let bytesDownloaded = resumeFrom

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

interface DownloadContext {
  url: string
  destination: string
  fs?: FileSystemService | undefined
  progressWriter?: ProgressWriter | undefined
  isTTY?: boolean | undefined
  resumeFrom: number
  totalBytes: number
}

interface ResponseHandlerResult {
  progressReporter?: ProgressReporter | undefined
  writePromise: Promise<void>
}

/**
 * Setup progress reporter
 */
function createProgressReporter(
  response: IncomingMessage,
  config: ProgressConfig,
): ProgressReporter | undefined {
  if (!config.progressWriter) return undefined

  const contentLength = parseInt(response.headers['content-length'] || '0', 10)
  const total = contentLength > 0 ? contentLength + config.resumeFrom : config.totalBytes
  if (total <= 0) return undefined

  const reporter = new ProgressReporter(
    total,
    config.isTTY !== undefined ? config.isTTY : process.stdout.isTTY || false,
    config.progressWriter,
  )

  if (config.resumeFrom > 0) {
    reporter.update(config.resumeFrom)
  }

  return reporter
}

/**
 * Handle response and start download
 */
function handleDownloadResponse(
  response: IncomingMessage,
  ctx: DownloadContext,
): ResponseHandlerResult {
  const partialPath = getPartialFilePath(ctx.destination)
  const targetPath = ctx.resumeFrom > 0 ? partialPath : ctx.destination

  const progressConfig: ProgressConfig = {
    resumeFrom: ctx.resumeFrom,
    totalBytes: ctx.totalBytes,
    progressWriter: ctx.progressWriter,
    isTTY: ctx.isTTY,
  }

  const progressReporter = createProgressReporter(response, progressConfig)

  const writeOptions: WriteOptions = {
    progressReporter,
    resumeFrom: ctx.resumeFrom,
  }

  const writePromise = ctx.fs
    ? writeToInMemoryFs(response, targetPath, ctx.fs, writeOptions)
    : writeToRealFs(response, targetPath, writeOptions)

  return { progressReporter, writePromise }
}

/**
 * Finalize download by moving partial file to final destination
 */
async function finalizeDownload(ctx: DownloadContext): Promise<void> {
  if (ctx.resumeFrom <= 0) return

  const partialPath = getPartialFilePath(ctx.destination)

  if (ctx.fs) {
    const content = ctx.fs.readFileSync(partialPath)
    await ctx.fs.writeFile(ctx.destination, content)
    await cleanupPartialFile(ctx.destination, ctx.fs)
  } else {
    const { rename } = await import('fs-extra')
    await rename(partialPath, ctx.destination)
  }
}

/**
 * Download file via HTTPS with optional progress reporting and resume support
 */
async function downloadFile(
  url: string,
  destination: string,
  deps: DownloadDeps = {},
): Promise<void> {
  const totalBytes = await getContentLength(url)
  const resumeDecision = await shouldResume(destination, totalBytes, deps.fs)
  const resumeFrom = resumeDecision.shouldResume ? resumeDecision.bytesDownloaded : 0

  if (resumeFrom > 0) {
    logDiag(`Resuming download from byte ${resumeFrom} of ${totalBytes}`)
  }

  const ctx: DownloadContext = {
    url,
    destination,
    fs: deps.fs,
    progressWriter: deps.progressWriter,
    isTTY: deps.isTTY,
    resumeFrom,
    totalBytes,
  }

  return downloadFileImpl(ctx)
}

/**
 * Implementation of file download
 */
function downloadFileImpl(ctx: DownloadContext): Promise<void> {
  return new Promise((resolve, reject) => {
    const headers: Record<string, string> = {}
    if (ctx.resumeFrom > 0) {
      headers['Range'] = `bytes=${ctx.resumeFrom}-`
    }

    const request = https.get(ctx.url, { headers }, response => {
      if (handleRedirect(response, ctx, resolve, reject)) return

      const error = handleHttpError(response.statusCode || 0, ctx.url)
      if (error) {
        reject(error)
        return
      }

      const { progressReporter, writePromise } = handleDownloadResponse(response, ctx)

      writePromise
        .then(async () => {
          if (progressReporter) progressReporter.complete()
          await finalizeDownload(ctx)
          resolve()
        })
        .catch(async err => {
          await cleanupPartialFile(ctx.destination, ctx.fs)
          reject(err)
        })
    })

    request.on('error', async error => {
      await cleanupPartialFile(ctx.destination, ctx.fs)
      reject(new Error(`Network error downloading KB: ${error.message}. Check connectivity.`))
    })
  })
}

/**
 * Handle HTTP redirects
 */
function handleRedirect(
  response: IncomingMessage,
  ctx: DownloadContext,
  resolve: (value: void | PromiseLike<void>) => void,
  reject: (reason: unknown) => void,
): boolean {
  if (response.statusCode === 301 || response.statusCode === 302) {
    const redirectUrl = response.headers.location
    if (redirectUrl) {
      const deps: DownloadDeps = {
        fs: ctx.fs,
        progressWriter: ctx.progressWriter,
        isTTY: ctx.isTTY,
      }
      downloadFile(redirectUrl, ctx.destination, deps).then(resolve).catch(reject)
      return true
    }
  }
  return false
}

/**
 * Get content length via HEAD request
 */
function getContentLength(url: string): Promise<number> {
  return new Promise(resolve => {
    const request = https.request(url, { method: 'HEAD' }, response => {
      const contentLength = parseInt(response.headers['content-length'] || '0', 10)
      resolve(contentLength)
    })
    request.on('error', () => resolve(0))
    request.end()
  })
}
