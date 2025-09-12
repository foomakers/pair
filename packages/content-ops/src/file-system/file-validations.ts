import { relative } from 'path'
import { Stats } from 'fs'
import { FileSystemService } from '.'
import { createError } from '../observability'

type PathValidationContext = {
  source: string
  target: string
  srcPath: string
  destPath: string
  datasetRoot: string
}

/**
 * Validates source and target paths for copy/move operations
 * @param context - Path validation context containing all path information
 */
export function validatePaths(context: PathValidationContext): void {
  const { source, target, srcPath, destPath, datasetRoot } = context
  if (source === target) {
    console.log(`Source and target are the same: ${source}. Nothing to do.`)
    return
  }

  const relSrc = relative(datasetRoot, srcPath)
  const relDest = relative(datasetRoot, destPath)
  if (relSrc.startsWith('..') || relDest.startsWith('..')) {
    throw createError({
      type: 'PATH_ESCAPE',
      message: 'Source or target escapes the dataset root. Aborting.',
      source,
      target,
    })
  }
}

/**
 * Validates that the source path exists
 * @param fileService - File system service
 * @param srcPath - Absolute source path
 * @returns Promise resolving to file stats
 */
export async function validateSourceExists(
  fileService: FileSystemService,
  srcPath: string,
): Promise<Stats> {
  try {
    return await fileService.stat(srcPath)
  } catch {
    throw createError({
      type: 'SOURCE_NOT_EXISTS',
      message: `Source does not exist: ${srcPath}`,
      sourcePath: srcPath,
    })
  }
}
