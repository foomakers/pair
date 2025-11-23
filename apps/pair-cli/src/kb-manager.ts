import { join } from 'path'
import { homedir, tmpdir } from 'os'
import * as https from 'https'
import { IncomingMessage } from 'http'
import { createWriteStream } from 'fs'
import type { FileSystemService } from '@pair/content-ops'

export interface KBManagerDeps {
  fs?: FileSystemService
  extract?: (zipPath: string, targetPath: string) => Promise<void>
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
    if (fs) {
      return fs.existsSync(cachePath)
    }
    // Production: use fs-extra pathExists
    const { pathExists } = await import('fs-extra')
    return await pathExists(cachePath)
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
  const fs = deps?.fs
  const extract = deps?.extract || defaultExtract

  // Check cache
  const cached = await isKBCached(version, fs)
  if (cached) {
    return cachePath
  }

  // Download and install
  console.log(`KB not found, downloading v${version} from GitHub...`)

  const cleanVersion = version.startsWith('v') ? version.slice(1) : version
  const tagVersion = version.startsWith('v') ? version : `v${version}`
  const assetName = `knowledge-base-${cleanVersion}.zip`
  const downloadUrl = `https://github.com/foomakers/pair/releases/download/${tagVersion}/${assetName}`
  const zipPath = join(tmpdir(), `kb-${cleanVersion}.zip`)

  try {
    await ensureCacheDirectory(cachePath, fs)
    await downloadFile(downloadUrl, zipPath, fs)
    await extract(zipPath, cachePath)
    await cleanupZip(zipPath, fs)

    console.log(`✅ KB v${cleanVersion} installed at ${cachePath}`)
    return cachePath
  } catch (error) {
    await cleanupZip(zipPath, fs)
    throw error
  }
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
): Promise<void> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    response.on('data', (chunk: Buffer) => chunks.push(chunk))
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

function writeToRealFs(response: IncomingMessage, destination: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const fileStream = createWriteStream(destination)
    response.pipe(fileStream)
    fileStream.on('finish', () => {
      fileStream.close()
      resolve()
    })
    fileStream.on('error', reject)
  })
}

/**
 * Download file via HTTPS
 */
function downloadFile(url: string, destination: string, fs?: FileSystemService): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = https.get(url, response => {
      // Handle redirects
      if (response.statusCode === 301 || response.statusCode === 302) {
        const redirectUrl = response.headers.location
        if (redirectUrl) {
          downloadFile(redirectUrl, destination, fs).then(resolve).catch(reject)
          return
        }
      }

      // Handle errors
      const error = handleHttpError(response.statusCode || 0, url)
      if (error) {
        reject(error)
        return
      }

      // Write to file
      const writePromise = fs
        ? writeToInMemoryFs(response, destination, fs)
        : writeToRealFs(response, destination)

      writePromise.then(resolve).catch(reject)
    })

    request.on('error', error => {
      reject(new Error(`Network error downloading KB: ${error.message}. Check connectivity.`))
    })
  })
}
