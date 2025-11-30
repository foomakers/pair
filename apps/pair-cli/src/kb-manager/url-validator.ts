/**
 * URL validation utilities for KB downloads
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
 * Validates a KB source URL and returns it if valid
 * @param urlString - The URL to validate
 * @returns The validated URL string
 * @throws Error if URL is invalid or uses non-HTTP protocol
 */
export function validateKBUrl(urlString: string): string {
  try {
    const url = new URL(urlString)
    
    if (!ALLOWED_PROTOCOLS.includes(url.protocol)) {
      throw new Error(
        `Invalid URL protocol: ${url.protocol}. Only http:// and https:// are allowed.`
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
