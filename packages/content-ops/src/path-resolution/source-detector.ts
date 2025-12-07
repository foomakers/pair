/**
 * Source type detector for local and remote paths
 */

import * as path from 'path'
import * as fs from 'fs'

export enum SourceType {
  REMOTE_URL = 'REMOTE_URL',
  LOCAL_ZIP = 'LOCAL_ZIP',
  LOCAL_DIRECTORY = 'LOCAL_DIRECTORY',
  INVALID = 'INVALID',
}

/**
 * Detect the type of source (remote URL, local ZIP, or local directory)
 * @param source - Source string (URL or file path)
 * @returns SourceType enum value
 */
export function detectSourceType(source: string): SourceType {
  // Reject unsafe protocols
  if (/^(file|ftp):\/\//i.test(source)) return SourceType.INVALID
  // Remote URL
  if (/^https?:\/\//i.test(source)) return SourceType.REMOTE_URL
  // Local ZIP (absolute or relative)
  const resolved = path.resolve(process.cwd(), source)
  if (source.endsWith('.zip') && fs.existsSync(resolved) && fs.statSync(resolved).isFile()) {
    return SourceType.LOCAL_ZIP
  }
  // Local directory
  if (fs.existsSync(resolved) && fs.statSync(resolved).isDirectory()) {
    return SourceType.LOCAL_DIRECTORY
  }
  return SourceType.INVALID
}
