import { join } from 'path'
import { homedir } from 'os'
import type { FileSystemService } from '@pair/content-ops'

export function getCachedKBPath(version: string): string {
  const cleanVersion = version.startsWith('v') ? version.slice(1) : version
  return join(homedir(), '.pair', 'kb', cleanVersion)
}

export async function isKBCached(version: string, fs?: FileSystemService): Promise<boolean> {
  try {
    const cachePath = getCachedKBPath(version)
    if (fs) {
      return fs.existsSync(cachePath)
    }
    const { pathExists } = await import('fs-extra')
    return await pathExists(cachePath)
  } catch {
    return false
  }
}

export async function ensureCacheDirectory(
  cachePath: string,
  fs?: FileSystemService,
): Promise<void> {
  if (fs) {
    await fs.mkdir(cachePath, { recursive: true })
  } else {
    const { ensureDir } = await import('fs-extra')
    await ensureDir(cachePath)
  }
}

export async function cleanupZip(zipPath: string, fs?: FileSystemService): Promise<void> {
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

export default {
  getCachedKBPath,
  isKBCached,
  ensureCacheDirectory,
  cleanupZip,
}
