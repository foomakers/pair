import { relative } from 'path'
import { Stats } from 'fs'
import { FileSystemService } from '.'
import { createError } from '../observability'
import { resolvesWithin } from './path-containment'

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
 * The same rule as `validatePaths`, decided on the PHYSICAL path.
 *
 * `validatePaths` compares names, and a name cannot describe where a symlink points:
 * a source root that IS a symlink out of the dataset (`leak -> ../../.ssh`) reads as
 * contained and is then `stat`ed through the link, so the copy walks someone else's
 * directory. Untrusted dataset content (an external KB, US-396) makes that reachable
 * from configuration, so containment is checked where the read actually happens.
 */
export async function validateSourceContained(context: {
  fileService: FileSystemService
  srcPath: string
  datasetRoot: string
  source: string
  target: string
}): Promise<void> {
  const { fileService, srcPath, datasetRoot, source, target } = context
  if (await resolvesWithin(fileService, srcPath, datasetRoot)) return
  throw createError({
    type: 'PATH_ESCAPE',
    message: `Source escapes the dataset root once symlinks are resolved: ${srcPath}. Aborting.`,
    source,
    target,
  })
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
