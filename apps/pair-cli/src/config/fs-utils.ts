import { FileSystemService } from '@pair/content-ops'

/**
 * Ensures a directory exists, creating it recursively if needed.
 */
export async function ensureDir(fsService: FileSystemService, absPath: string): Promise<void> {
  await fsService.mkdir(absPath, { recursive: true })
}

/**
 * Identifies if a path points to a directory or a file.
 */
export async function calculatePathType(
  fsService: FileSystemService,
  path: string,
): Promise<'dir' | 'file'> {
  const stat = await fsService.stat(path)
  return stat.isDirectory() ? 'dir' : 'file'
}
