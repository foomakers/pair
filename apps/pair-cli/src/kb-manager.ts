import { join } from 'path'
import { homedir, tmpdir } from 'os'
import * as https from 'https'
import { IncomingMessage } from 'http'
import { createWriteStream } from 'fs'
import type { FileSystemService } from '@pair/content-ops'
import { ProgressReporter, type ProgressWriter } from './progress-reporter'

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
    await downloadFile(downloadUrl, zipPath, fs, deps?.progressWriter, deps?.isTTY)
    logDiag(`Download complete, extracting to ${cachePath}`)
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
  if (statusCode !== 200) {
    return new Error(`Download failed: HTTP ${statusCode}`)
  }
  return null
}

function writeToInMemoryFs(
  response: IncomingMessage,
  destination: string,
  fs: FileSystemService,
  progressReporter?: ProgressReporter,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let bytesDownloaded = 0

    response.on('data', (chunk: Buffer) => {
      chunks.push(chunk)
      bytesDownloaded += chunk.length
      if (progressReporter) {
        progressReporter.update(bytesDownloaded)
      }
    })

    response.on('end', () => {
      try {
        const buffer = Buffer.concat(chunks)
        fs.writeFile(destination, buffer.toString())
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
): Promise<void> {
  return new Promise((resolve, reject) => {
    const fileStream = createWriteStream(destination)
    let bytesDownloaded = 0

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

/**
 * Download file via HTTPS with optional progress reporting
 */
function downloadFile(
  url: string,
  destination: string,
  fs?: FileSystemService,
  progressWriter?: ProgressWriter,
  isTTY?: boolean,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = https.get(url, response => {
      // Handle redirects
      if (response.statusCode === 301 || response.statusCode === 302) {
        const redirectUrl = response.headers.location
        if (redirectUrl) {
          downloadFile(redirectUrl, destination, fs, progressWriter, isTTY)
            .then(resolve)
            .catch(reject)
          return
        }
      }

      // Handle errors
      const error = handleHttpError(response.statusCode || 0, url)
      if (error) {
        reject(error)
        return
      }

      // Setup progress reporter if writer provided
      let progressReporter: ProgressReporter | undefined
      if (progressWriter) {
        const contentLength = parseInt(response.headers['content-length'] || '0', 10)
        if (contentLength > 0) {
          progressReporter = new ProgressReporter(
            contentLength,
            isTTY !== undefined ? isTTY : process.stdout.isTTY || false,
            progressWriter,
          )
        }
      }

      // Write to file with progress tracking
      const writePromise = fs
        ? writeToInMemoryFs(response, destination, fs, progressReporter)
        : writeToRealFs(response, destination, progressReporter)

      writePromise
        .then(() => {
          if (progressReporter) {
            progressReporter.complete()
          }
          resolve()
        })
        .catch(reject)
    })

    request.on('error', error => {
      reject(new Error(`Network error downloading KB: ${error.message}. Check connectivity.`))
    })
  })
}
