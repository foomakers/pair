/**
 * Source type detector for local and remote paths
 */

import type { FileSystemService } from '../file-system'

export enum SourceType {
  REMOTE_URL = 'REMOTE_URL',
  LOCAL_ZIP = 'LOCAL_ZIP',
  LOCAL_DIRECTORY = 'LOCAL_DIRECTORY',
  INVALID = 'INVALID',
}

/** True when source is an http:// or https:// URL */
export function isRemoteUrl(source: string): boolean {
  return /^https?:\/\//i.test(source)
}

/** True when source uses an unsupported protocol (file://, ftp://) */
export function isUnsupportedProtocol(source: string): boolean {
  return /^(file|ftp):\/\//i.test(source)
}

/**
 * Detect the type of source (remote URL, local ZIP, or local directory)
 */
export function detectSourceType(source: string, fs: FileSystemService): SourceType {
  // Reject unsafe protocols
  if (isUnsupportedProtocol(source)) return SourceType.INVALID
  // Remote URL
  if (isRemoteUrl(source)) return SourceType.REMOTE_URL
  // Local path resolution
  const resolved = fs.resolve(fs.currentWorkingDirectory(), source)
  // Local ZIP (absolute or relative)
  if (source.endsWith('.zip') && fs.existsSync(resolved)) {
    return SourceType.LOCAL_ZIP
  }
  // Local directory
  if (fs.existsSync(resolved)) {
    return SourceType.LOCAL_DIRECTORY
  }
  return SourceType.INVALID
}
