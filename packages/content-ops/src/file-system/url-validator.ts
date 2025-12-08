/**
 * URL validation utilities for HTTP(S) URLs
 */

import { URL } from 'url'

const ALLOWED_PROTOCOLS = ['http:', 'https:']

/**
 * Checks if a URL uses HTTP or HTTPS protocol
 * @param urlString - The URL to validate
 * @returns True if URL uses http:// or https://, false otherwise
 */
export function isValidHttpUrl(urlString: string): boolean {
  try {
    const url = new URL(urlString)
    return ALLOWED_PROTOCOLS.includes(url.protocol)
  } catch {
    return false
  }
}

/**
 * Validates a URL or local path and returns it if valid
 * @param urlString - The URL or local path to validate
 * @returns The validated URL or path string
 * @throws Error if URL is invalid or uses non-HTTP protocol
 */
export function validateUrl(urlString: string): string {
  // Check if it's a local path (absolute or relative)
  // Absolute paths start with /
  // Relative paths start with ./ or ../
  // Windows paths have a drive letter (e.g., C:\)
  if (
    urlString.startsWith('/') ||
    urlString.startsWith('./') ||
    urlString.startsWith('../') ||
    (urlString.length > 1 && urlString[1] === ':')
  ) {
    // It's a local path - return it as-is
    return urlString
  }

  // Otherwise, validate as URL
  try {
    const url = new URL(urlString)

    if (!ALLOWED_PROTOCOLS.includes(url.protocol)) {
      throw new Error(
        `Invalid URL protocol: ${url.protocol}. Only http:// and https:// are allowed.`,
      )
    }

    return urlString
  } catch (error) {
    if (error instanceof Error && error.message.includes('Invalid URL protocol')) {
      throw error
    }
    throw new Error(`Invalid URL format: ${urlString}`)
  }
}
