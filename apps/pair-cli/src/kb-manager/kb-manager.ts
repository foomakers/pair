import { join } from 'path'
import { homedir, tmpdir } from 'os'
import * as https from 'https'
import type { FileSystemService } from '@pair/content-ops'
import { type ProgressWriter } from './progress-reporter'
import { downloadFile } from './download-manager'
import { validateChecksum, getExpectedChecksum } from './checksum-validator'

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
  const cached = await isKBCached(version, deps?.fs)

  if (cached) {
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

  console.log(`KB not found, downloading v${version} from GitHub...`)

  const downloadUrl = deps?.customUrl || buildDownloadUrl(version)
  const zipPath = join(tmpdir(), `kb-${cleanVersion}.zip`)

  try {
    await ensureCacheDirectory(cachePath, fs)
    await downloadFile(downloadUrl, zipPath, {
      fs,
      progressWriter: deps?.progressWriter,
      isTTY: deps?.isTTY,
    })

    // Validate checksum if available
    await validateDownloadChecksum(downloadUrl, zipPath, fs)

    await extract(zipPath, cachePath)
    await cleanupZip(zipPath, fs)

    console.log(`✅ KB v${cleanVersion} installed at ${cachePath}`)
    return cachePath
  } catch (error) {
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
      return
    }

    const expectedChecksum = await getExpectedChecksum(checksumContent)
    if (!expectedChecksum) {
      return
    }

    // Only validate when checksum looks like a SHA256 hex string
    if (!/^[a-f0-9]{64}$/i.test(expectedChecksum)) {
      return
    }

    const result = await validateChecksum(filePath, expectedChecksum, fs)

    if (!result.isValid) {
      throw new Error(
        `Checksum validation failed!\n` +
          `Expected: ${result.expectedChecksum}\n` +
          `Actual:   ${result.actualChecksum}\n` +
          `File may be corrupted. Please retry the download.`,
      )
    }
  } catch (error) {
    // If checksum file doesn't exist (404), skip validation
    const httpError = error as HttpError
    if (httpError.message?.includes('404')) {
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
