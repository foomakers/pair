import { join } from 'path'
import { homedir } from 'os'
import type { FileSystemService } from '@pair/content-ops'
import { cleanupFile } from '@pair/content-ops'

export function getCachedKBPath(version: string): string {
  const cleanVersion = version.startsWith('v') ? version.slice(1) : version
  return join(homedir(), '.pair', 'kb', cleanVersion)
}

export async function isKBCached(version: string, fs: FileSystemService): Promise<boolean> {
  try {
    const cachePath = getCachedKBPath(version)
    return fs.existsSync(cachePath)
  } catch {
    return false
  }
}

export async function ensureCacheDirectory(
  cachePath: string,
  fs: FileSystemService,
): Promise<void> {
  await fs.mkdir(cachePath, { recursive: true })
}

export async function cleanupZip(zipPath: string, fs: FileSystemService): Promise<void> {
  await cleanupFile(zipPath, fs)
}

export default {
  getCachedKBPath,
  isKBCached,
  ensureCacheDirectory,
  cleanupZip,
}
