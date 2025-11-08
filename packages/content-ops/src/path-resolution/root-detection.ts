import { join, dirname } from 'path'
import { FileSystemService } from '../file-system/file-system-service'

/**
 * Detect repository root using multiple strategies in priority order:
 * 1. Provided cwd that contains a .git folder
 * 2. package.json presence walking up
 * 3. explicit marker '.pair' folder
 * Returns the detected root or null if none found within maxDepth.
 */
export async function detectRepoRoot(startDir: string, fs: FileSystemService, maxDepth = 10) {
  let dir = startDir
  for (let i = 0; i < maxDepth; i++) {
    try {
      // check .git
      const gitPath = join(dir, '.git')
      if (await fs.exists(gitPath)) return dir

      // check package.json
      const pkg = join(dir, 'package.json')
      if (await fs.exists(pkg)) return dir

      // check .pair marker
      const marker = join(dir, '.pair')
      if (await fs.exists(marker)) return dir
    } catch {
      // ignore and continue upwards
    }

    const parentDir = dirname(dir)
    if (!parentDir || parentDir === dir) break
    dir = parentDir
  }
  return null
}
