import {
  downloadFile as genericDownloadFile,
  type DownloadOptions as GenericDownloadOptions,
  type DownloadErrorHandler,
  type ProgressWriter,
} from '@pair/content-ops/http'
import type { FileSystemService } from '@pair/content-ops'
import { fileSystemService } from '@pair/content-ops'

/**
 * KB-specific error handler with helpful messages for knowledge base downloads
 */
const kbErrorHandler: DownloadErrorHandler = {
  handleHttpError(statusCode: number, url: string): Error | null {
    if (statusCode === 404) {
      const version = url.match(/v(\d+\.\d+\.\d+)/)?.[1] || 'unknown'
      return new Error(
        `KB v${version} not found (404). Download manually from: ${url.replace(
          /\/[^/]+\.zip$/,
          '',
        )}`,
      )
    }
    if (statusCode === 403) {
      return new Error(`Access denied (403). Check network/permissions. URL: ${url}`)
    }
    if (statusCode !== 200 && statusCode !== 206) {
      return new Error(`Download failed: HTTP ${statusCode}`)
    }
    return null
  },

  handleNetworkError(error: Error): Error {
    return new Error(`Network error downloading KB: ${error.message}. Check connectivity.`)
  },
}

interface DownloadOptions {
  fs?: FileSystemService | undefined
  progressWriter?: ProgressWriter | undefined
  isTTY?: boolean | undefined
}

/**
 * Download KB file with KB-specific error messages
 * Thin wrapper around generic downloadFile with kbErrorHandler
 */
export async function downloadFile(
  url: string,
  destination: string,
  options: DownloadOptions = {},
): Promise<void> {
  const fs = options.fs || fileSystemService
  const { progressWriter, isTTY } = options

  const genericOptions: GenericDownloadOptions = {
    fs,
    progressWriter,
    isTTY,
    label: 'Downloading KB',
    errorHandler: kbErrorHandler,
  }

  return genericDownloadFile(url, destination, genericOptions)
}
