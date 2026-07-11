import { join, relative, basename, dirname } from 'path/posix'
import { logger, createMirrorConstraintError, createError } from '../observability'
import { validatePaths } from '../file-system/file-validations'
import { SyncOptions } from './SyncOptions'
import { FileSystemService } from '../file-system'
import { Behavior, validateMirrorConstraints } from './behavior'
import { processPathSubstitution } from './link-batch-processor'

/**
 * Common setup and validation for path operations
 */
export function setupPathOperation(
  source: string,
  target: string,
  datasetRoot: string,
  options?: SyncOptions,
) {
  const defaultBehavior: Behavior = options?.defaultBehavior || 'overwrite'
  const folderBehavior = options?.folderBehavior
  validateMirrorConstraints(folderBehavior, createMirrorConstraintError)

  const normSource = source.replace(/\\/g, '/')
  const normTarget = target.replace(/\\/g, '/')

  // If source and target are the same, no operation needed
  if (normSource === normTarget) {
    logger.info(`Source and target are the same: ${normSource}. Nothing to do.`)
    return { shouldSkip: true, normSource, normTarget, options, defaultBehavior, folderBehavior }
  }

  const srcPath = join(datasetRoot, normSource)
  const destPath = join(datasetRoot, normTarget)

  validatePaths({
    source: normSource,
    target: normTarget,
    srcPath,
    destPath,
    datasetRoot,
  })

  return {
    shouldSkip: false,
    normSource,
    normTarget,
    srcPath,
    destPath,
    options,
    defaultBehavior,
    folderBehavior,
  }
}

/**
 * Determines the final destination path for file operations
 */
export async function determineFinalDestination(
  fileService: FileSystemService,
  destPath: string,
  source: string,
  normTarget: string,
): Promise<string> {
  try {
    const destStat = await fileService.stat(destPath)
    if (destStat.isDirectory()) {
      return join(destPath, basename(source))
    } else {
      return destPath
    }
  } catch {
    if (normTarget.endsWith('.md')) {
      await fileService.mkdir(dirname(destPath), { recursive: true })
      return destPath
    } else {
      await fileService.mkdir(destPath, { recursive: true })
      return join(destPath, basename(source))
    }
  }
}

/**
 * Updates markdown links after path operation
 */
export type UpdateMarkdownLinksParams = {
  fileService: FileSystemService
  source: string
  target: string
  datasetRoot: string
  finalDest: string
  isDirectory: boolean
  options: SyncOptions | undefined
}

export async function updateMarkdownLinks(params: UpdateMarkdownLinksParams) {
  const { fileService, source, target, datasetRoot, finalDest, isDirectory, options } = params

  const oldBase = isDirectory ? source.replace(/\\/g, '/') + '/' : source.replace(/\\/g, '/')

  const newBase = isDirectory
    ? target.replace(/\\/g, '/') + '/'
    : relative(datasetRoot, finalDest).replace(/\\/g, '/')

  const concurrencyLimit = options?.concurrencyLimit || DEFAULT_CONCURRENCY_LIMIT
  await bulkUpdateMarkdownLinks({ fileService, oldBase, newBase, datasetRoot, concurrencyLimit })
}

/**
 * Handles mirror behavior cleanup for directories
 */
export async function handleMirrorCleanup(
  fileService: FileSystemService,
  srcPath: string,
  destPath: string,
) {
  const destEntries = await fileService.readdir(destPath).catch(() => [])
  const srcNames = new Set((await fileService.readdir(srcPath).catch(() => [])).map(e => e.name))

  for (const de of destEntries) {
    if (!srcNames.has(de.name)) {
      const toRemove = join(destPath, de.name)
      if (fileService.rm) {
        await fileService.rm(toRemove, { recursive: true, force: true })
        logger.info(`Mirror: removed ${toRemove}`)
      }
    }
  }
}

/**
 * Validates that directory operation doesn't create invalid subfolder relationships
 */
export function validateSubfolderOperation(params: {
  srcPath: string
  destPath: string
  normSource: string
  normTarget: string
  operation: 'copy' | 'move'
}) {
  const { srcPath, destPath, normSource, normTarget, operation } = params
  const subTest = relative(srcPath, destPath)
  if (subTest && !subTest.startsWith('..')) {
    const errorType = operation === 'copy' ? 'INVALID_SUBFOLDER_COPY' : 'INVALID_SUBFOLDER_MOVE'
    const message = `Cannot ${operation} a folder into one of its own subfolders. Aborting.`
    throw createError({
      type: errorType,
      message,
      source: normSource,
      target: normTarget,
    })
  }
} // Constants

export const DEFAULT_CONCURRENCY_LIMIT = 10

export async function bulkUpdateMarkdownLinks(params: {
  fileService: FileSystemService
  oldBase: string
  newBase: string
  datasetRoot: string
  concurrencyLimit?: number
}) {
  const {
    fileService,
    oldBase,
    newBase,
    datasetRoot,
    concurrencyLimit = DEFAULT_CONCURRENCY_LIMIT,
  } = params
  return logger.time(async () => {
    const result = await processPathSubstitution({
      datasetRoot,
      oldBase,
      newBase,
      config: { concurrencyLimit },
      fileService,
    })

    // Log results
    if (result.processedFiles > 0) {
      logger.info(
        `✅ Links updated: ${result.totalLinksUpdated} (in ${result.processedFiles} files)`,
      )
    }

    // Log errors if any
    if (result.errors.length > 0) {
      logger.warn(`⚠️  ${result.errors.length} errors occurred during processing:`)
      for (const error of result.errors) {
        logger.warn(`  - ${error.file}: ${error.error}`)
      }
    }

    return result
  }, 'bulkUpdateMarkdownLinks')
}
