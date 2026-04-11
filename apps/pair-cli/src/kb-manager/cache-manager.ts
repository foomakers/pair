import { join } from 'path'
import { homedir } from 'os'
import type { FileSystemService } from '@pair/content-ops'

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

const BACKUP_SUFFIX = '.bak'

export async function backupCachedKB(version: string, fs: FileSystemService): Promise<boolean> {
  const cachePath = getCachedKBPath(version)
  if (fs.existsSync(cachePath)) {
    await fs.rename(cachePath, cachePath + BACKUP_SUFFIX)
    return true
  }
  return false
}

export async function restoreCachedKB(version: string, fs: FileSystemService): Promise<void> {
  const cachePath = getCachedKBPath(version)
  const backupPath = cachePath + BACKUP_SUFFIX
  if (fs.existsSync(backupPath)) {
    await fs.rename(backupPath, cachePath)
  }
}

export async function removeBackupKB(version: string, fs: FileSystemService): Promise<void> {
  const cachePath = getCachedKBPath(version)
  const backupPath = cachePath + BACKUP_SUFFIX
  if (fs.existsSync(backupPath)) {
    await fs.rm(backupPath, { recursive: true })
  }
}

export default {
  getCachedKBPath,
  isKBCached,
  ensureCacheDirectory,
  backupCachedKB,
  restoreCachedKB,
  removeBackupKB,
}
