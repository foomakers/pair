import { join } from 'path/posix'
import { logger, createError } from '../observability'
import { copyDirHelper } from '../file-system'
import type { CopyDirContext } from '../file-system/file-operations'
import { FileSystemService } from '../file-system'
import { SyncOptions } from './SyncOptions'
import { Behavior, normalizeKey, resolveBehavior } from './behavior'
import {
  updateMarkdownLinks,
  handleMirrorCleanup,
  validateSubfolderOperation,
} from './path-operation-helpers'
import { convertToRelative } from '../path-resolution'

export type HandleDirectoryCopyParams = {
  fileService: FileSystemService
  srcPath: string
  destPath: string
  source: string
  target: string
  normSource: string
  normTarget: string
  datasetRoot: string
  defaultBehavior: Behavior
  folderBehavior?: Record<string, Behavior>
  options?: SyncOptions
}

/**
 * Handles directory copy operations
 */
export async function handleDirectoryCopy(params: HandleDirectoryCopyParams) {
  const {
    fileService,
    srcPath,
    destPath,
    source,
    target,
    normSource,
    normTarget,
    datasetRoot,
    defaultBehavior,
    folderBehavior,
    options,
  } = params

  // Handle different behaviors for directories
  const sourceFolderBehavior =
    resolveSourceFolderBehavior(
      datasetRoot,
      normSource,
      folderBehavior,
      defaultBehavior ?? 'overwrite',
    ) ?? 'overwrite'

  if (sourceFolderBehavior === 'skip') {
    logger.info(`Skipping directory ${srcPath} due to 'skip' behavior`)
    return
  }

  await performDirectoryCopyAndUpdate({
    fileService,
    srcPath,
    destPath,
    normSource,
    normTarget,
    datasetRoot,
    ...(folderBehavior && { folderBehavior }),
    sourceFolderBehavior,
    defaultBehavior: defaultBehavior ?? 'overwrite',
    source,
    target,
    ...(options && { options }),
  })
}

async function performDirectoryCopyAndUpdate(params: {
  fileService: FileSystemService
  srcPath: string
  destPath: string
  normSource: string
  normTarget: string
  datasetRoot: string
  folderBehavior?: Record<string, Behavior>
  sourceFolderBehavior: Behavior
  defaultBehavior: Behavior
  source: string
  target: string
  options?: SyncOptions
}) {
  const { fileService, destPath, datasetRoot, folderBehavior, source, target, options, ...rest } =
    params

  await performDirectoryCopy({
    ...rest,
    fileService,
    destPath,
    datasetRoot,
    ...(folderBehavior && { folderBehavior }),
  })

  await updateLinksAfterDirectoryCopy({
    fileService,
    source,
    target,
    datasetRoot,
    finalDest: destPath,
    ...(options && { options }),
  })
}

/**
 * Updates markdown links after directory copy operation
 */
async function updateLinksAfterDirectoryCopy(params: {
  fileService: FileSystemService
  source: string
  target: string
  datasetRoot: string
  finalDest: string
  options?: SyncOptions
}) {
  await updateMarkdownLinks({
    fileService: params.fileService,
    source: params.source,
    target: params.target,
    datasetRoot: params.datasetRoot,
    finalDest: params.finalDest,
    isDirectory: true,
    options: params.options,
  })
}

function resolveSourceFolderBehavior(
  datasetRoot: string,
  normSource: string,
  folderBehavior?: Record<string, Behavior>,
  defaultBehavior: Behavior = 'overwrite',
) {
  const rel = convertToRelative(datasetRoot, join(datasetRoot, normSource))
  const relSourceKey = normalizeKey(rel)
  return resolveBehavior(relSourceKey, folderBehavior, defaultBehavior)
}

async function performDirectoryCopy(params: {
  fileService: FileSystemService
  srcPath: string
  destPath: string
  normSource: string
  normTarget: string
  datasetRoot: string
  folderBehavior?: Record<string, Behavior>
  sourceFolderBehavior: Behavior
  defaultBehavior: Behavior
}) {
  const {
    fileService,
    srcPath,
    destPath,
    normSource,
    normTarget,
    datasetRoot,
    folderBehavior,
    sourceFolderBehavior,
    defaultBehavior,
  } = params
  await fileService.mkdir(destPath, { recursive: true })
  validateSubfolderOperation({ srcPath, destPath, normSource, normTarget, operation: 'copy' })

  if (sourceFolderBehavior === 'mirror') {
    await handleMirrorCleanup(fileService, srcPath, destPath)
  }

  await copyDirectoryContents({
    fileService,
    srcPath,
    destPath,
    datasetRoot,
    ...(folderBehavior && { folderBehavior }),
    defaultBehavior,
  })

  logger.info(`Copied contents of ${srcPath} -> ${destPath}`)
}

async function copyDirectoryContents(params: {
  fileService: FileSystemService
  srcPath: string
  destPath: string
  datasetRoot: string
  folderBehavior?: Record<string, Behavior>
  defaultBehavior: Behavior
}) {
  const { fileService, srcPath, destPath, datasetRoot, folderBehavior, defaultBehavior } = params

  try {
    const copyContext: CopyDirContext = {
      fileService,
      oldDir: srcPath,
      newDir: destPath,
      defaultBehavior,
      datasetRoot,
      ...(folderBehavior && { folderBehavior }),
    }
    await copyDirHelper(copyContext)
  } catch (err) {
    logger.error(`Failed to copy entries: ${String(err)}`)
    if (err instanceof Error && err.message.includes('boom')) {
      throw err
    }
    throw createError({
      type: 'IO_ERROR',
      message: `Failed to copy directory contents from ${srcPath} to ${destPath}`,
      operation: 'copyDir',
      path: srcPath,
      originalError: err,
    })
  }
}
