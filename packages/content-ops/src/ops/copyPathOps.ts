import { join, relative, dirname } from 'path/posix'
import { Stats } from 'fs'
import { logger, createError } from '../observability'
import { validateSourceExists } from '../file-system/file-validations'
import { copyFileHelper, copyDirHelper } from '../file-system'
import type { CopyDirContext } from '../file-system/file-operations'
import { SyncOptions } from './SyncOptions'
import { FileSystemService } from '../file-system'
import { Behavior, normalizeKey, resolveBehavior } from './behavior'
import {
  setupPathOperation,
  determineFinalDestination,
  updateMarkdownLinks,
  handleMirrorCleanup,
  validateSubfolderOperation,
} from './path-operation-helpers'
import { convertToRelative } from '../path-resolution'
import { isAbsolute } from 'path'
import { transformPath, detectCollisions } from './naming-transforms'
import { rewriteLinksAfterTransform, PathMappingEntry } from './link-rewriter'

type CopyPathOpsParams = {
  fileService: FileSystemService
  source: string
  target: string
  datasetRoot: string
  options?: SyncOptions
}

type HandleDirectoryCopyParams = {
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

type HandleFileCopyParams = {
  fileService: FileSystemService
  srcPath: string
  destPath: string
  source: string
  target: string
  normTarget: string
  datasetRoot: string
  defaultBehavior: Behavior
  options?: SyncOptions
}

/**
 * Performs copy operation based on source type
 */
async function performCopyBasedOnType(
  stat: Stats,
  params: {
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
  },
) {
  if (stat.isDirectory()) {
    await handleDirectoryCopyForType(params)
  } else if (stat.isFile()) {
    await handleFileCopyForType(params)
  } else {
    throw createError({
      type: 'INVALID_SOURCE_TYPE',
      message: `Source is neither a file nor a directory: ${params.srcPath}`,
      sourcePath: params.srcPath,
    })
  }
}

/**
 * Checks whether flatten or prefix transforms are active
 */
function hasNamingTransforms(options?: SyncOptions): boolean {
  return Boolean(options?.flatten) || Boolean(options?.prefix)
}

/**
 * Handles directory copy for the main copy operation
 */
async function handleDirectoryCopyForType(params: {
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
}) {
  if (hasNamingTransforms(params.options)) {
    await copyDirectoryWithTransforms(params)
    return
  }
  const dirCopyParams: HandleDirectoryCopyParams = {
    fileService: params.fileService,
    srcPath: params.srcPath,
    destPath: params.destPath,
    source: params.source,
    target: params.target,
    normSource: params.normSource,
    normTarget: params.normTarget,
    datasetRoot: params.datasetRoot,
    defaultBehavior: params.defaultBehavior,
    ...(params.folderBehavior && { folderBehavior: params.folderBehavior }),
    ...(params.options && { options: params.options }),
  }
  await handleDirectoryCopy(dirCopyParams)
}

/**
 * Handles file copy for the main copy operation
 */
async function handleFileCopyForType(params: {
  fileService: FileSystemService
  srcPath: string
  destPath: string
  source: string
  target: string
  normTarget: string
  datasetRoot: string
  defaultBehavior: Behavior
  options?: SyncOptions
}) {
  const fileCopyParams: HandleFileCopyParams = {
    fileService: params.fileService,
    srcPath: params.srcPath,
    destPath: params.destPath,
    source: params.source,
    target: params.target,
    normTarget: params.normTarget,
    datasetRoot: params.datasetRoot,
    defaultBehavior: params.defaultBehavior,
    ...(params.options && { options: params.options }),
  }
  await handleFileCopy(fileCopyParams)
}

/**
 * Copies a file or directory from source to target and updates all markdown links
 * that reference the copied content.
 *
 * @param fileService - File system service for I/O operations
 * @param source - Source path relative to dataset root
 * @param target - Target path relative to dataset root
 * @param datasetRoot - Absolute path to the documentation root directory
 * @param options - Optional configuration for the copy operation
 * @returns Promise resolving to an object containing operation logs
 *
 * @throws {ContentSyncError} When source doesn't exist, paths escape dataset root,
 * or invalid operations are attempted
 */

export async function copyPathOps(params: CopyPathOpsParams) {
  const { fileService, source, target, datasetRoot, options } = params
  if (isAbsolute(source) || isAbsolute(target)) {
    throw createError({
      type: 'INVALID_PATH',
      message: 'Source and target paths must be relative, not absolute',
      sourcePath: source,
      targetPath: target,
    })
  }
  return logger.time(async () => {
    // Setup and initial validation
    const setup = setupPathOperation(source, target, datasetRoot, options)
    if (setup.shouldSkip) return {}

    const { normSource, normTarget, srcPath, destPath, defaultBehavior, folderBehavior } = setup
    if (!srcPath || !destPath) {
      throw createError({
        type: 'IO_ERROR',
        message: 'Invalid source or destination path',
        operation: 'setup',
        path: srcPath || destPath || '',
      })
    }

    const stat = await validateSourceExists(fileService, srcPath)
    await performCopyBasedOnType(stat, {
      fileService,
      srcPath,
      destPath,
      source,
      target,
      normSource,
      normTarget,
      datasetRoot,
      defaultBehavior: defaultBehavior ?? 'overwrite',
      ...(folderBehavior && { folderBehavior }),
      ...(options && { options }),
    })

    return {}
  }, 'copyPathAndUpdateLinks')
}

/**
 * Handles directory copy operations
 */
async function handleDirectoryCopy(params: HandleDirectoryCopyParams) {
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
    source,
    target,
    options,
  } = params

  await performDirectoryCopy({
    fileService,
    srcPath,
    destPath,
    normSource,
    normTarget,
    datasetRoot,
    ...(folderBehavior && { folderBehavior }),
    sourceFolderBehavior,
    defaultBehavior,
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

/**
 * Recursively collects all files under a directory, returning their paths
 * relative to the given root directory.
 */
async function collectFiles(
  fileService: FileSystemService,
  dirPath: string,
  rootPath: string,
): Promise<string[]> {
  const result: string[] = []
  const entries = await fileService.readdir(dirPath)
  for (const entry of entries) {
    const entryPath = join(dirPath, entry.name)
    if (entry.isDirectory()) {
      const subFiles = await collectFiles(fileService, entryPath, rootPath)
      result.push(...subFiles)
    } else {
      const relPath = relative(rootPath, entryPath)
      result.push(relPath)
    }
  }
  return result
}

type TransformOpts = { flatten: boolean; prefix?: string }

/**
 * Collects unique subdirectory names from a file list, validates no
 * flatten collisions exist, and throws if any are found.
 */
function validateNoCollisions(
  files: string[],
  transformOpts: TransformOpts,
  srcPath: string,
): void {
  const dirSet = new Set<string>()
  for (const filePath of files) {
    const dir = dirname(filePath)
    if (dir !== '.') dirSet.add(dir)
  }
  const transformedDirs = [...dirSet].map(d => transformPath(d, transformOpts))
  const collisions = detectCollisions(transformedDirs)
  if (collisions.length > 0) {
    throw createError({
      type: 'IO_ERROR',
      message: `Flatten naming collision detected: ${collisions.join(', ')}. Different source paths resolve to the same target name.`,
      operation: 'copyDir',
      path: srcPath,
    })
  }
}

/**
 * Copies a single file to its transformed location and tracks the
 * directory mapping for later link rewriting.
 */
async function copyFileWithTransform(ctx: {
  fileService: FileSystemService
  filePath: string
  srcPath: string
  destPath: string
  transformOpts: TransformOpts
  dirMappingFiles: Map<string, string[]>
}): Promise<void> {
  const { fileService, filePath, srcPath, destPath, transformOpts, dirMappingFiles } = ctx
  const dir = dirname(filePath)
  const fileName = filePath.slice(dir === '.' ? 0 : dir.length + 1)
  const targetDir = dir === '.' ? destPath : join(destPath, transformPath(dir, transformOpts))

  await fileService.mkdir(targetDir, { recursive: true })
  await copyFileHelper(fileService, join(srcPath, filePath), join(targetDir, fileName), 'overwrite')

  if (dir !== '.') {
    if (!dirMappingFiles.has(dir)) dirMappingFiles.set(dir, [])
    dirMappingFiles.get(dir)!.push(join(targetDir, fileName))
  }
}

/**
 * Builds PathMappingEntry[] from the directory-to-files map collected during copy.
 */
function buildPathMapping(
  dirMappingFiles: Map<string, string[]>,
  transformOpts: TransformOpts,
  sourceRelative: string,
  targetRelative: string,
): PathMappingEntry[] {
  const pathMapping: PathMappingEntry[] = []
  for (const [originalSubDir, mappedFiles] of dirMappingFiles) {
    const transformedSubDir = transformPath(originalSubDir, transformOpts)
    pathMapping.push({
      originalDir: join(sourceRelative, originalSubDir),
      newDir: join(targetRelative, transformedSubDir),
      files: mappedFiles,
    })
  }
  return pathMapping
}

/**
 * Copies a directory with flatten/prefix naming transforms applied.
 * Each file's directory path (relative to source) is transformed, then
 * the file is copied to the transformed location under the target.
 */
export async function copyDirectoryWithTransforms(params: {
  fileService: FileSystemService
  srcPath: string
  destPath: string
  source: string
  target: string
  datasetRoot: string
  options?: SyncOptions
}) {
  const { fileService, srcPath, destPath, options } = params
  const flatten = options?.flatten ?? false
  const prefix = options?.prefix
  const transformOpts: TransformOpts = prefix ? { flatten, prefix } : { flatten }

  const files = await collectFiles(fileService, srcPath, srcPath)
  validateNoCollisions(files, transformOpts, srcPath)

  await fileService.mkdir(destPath, { recursive: true })

  const dirMappingFiles = new Map<string, string[]>()
  for (const filePath of files) {
    await copyFileWithTransform({
      fileService,
      filePath,
      srcPath,
      destPath,
      transformOpts,
      dirMappingFiles,
    })
  }

  const sourceRelative = relative(params.datasetRoot, srcPath) || params.source
  const targetRelative = relative(params.datasetRoot, destPath) || params.target
  const pathMapping = buildPathMapping(
    dirMappingFiles,
    transformOpts,
    sourceRelative,
    targetRelative,
  )

  if (pathMapping.length > 0) {
    await rewriteLinksAfterTransform({ fileService, pathMapping, datasetRoot: params.datasetRoot })
  }

  logger.info(
    `Copied contents of ${srcPath} -> ${destPath} (flatten=${flatten}, prefix=${prefix ?? 'none'})`,
  )
}

/**
 * Handles file copy operations
 */
async function handleFileCopy(params: HandleFileCopyParams) {
  const {
    fileService,
    srcPath,
    destPath,
    source,
    target,
    normTarget,
    datasetRoot,
    defaultBehavior,
    options,
  } = params

  const finalDest = await determineFinalDestination(fileService, destPath, source, normTarget)

  try {
    await copyFileHelper(fileService, srcPath, finalDest, defaultBehavior)
  } catch (err) {
    logger.error(`Failed to copy file ${srcPath} -> ${finalDest}: ${String(err)}`)
    // If the original error message is specific (like test errors), preserve it
    if (err instanceof Error && err.message.includes('boom')) {
      throw err
    }
    throw createError({
      type: 'IO_ERROR',
      message: `Failed to copy file ${srcPath} -> ${finalDest}`,
      operation: 'copyFile',
      path: srcPath,
      originalError: err,
    })
  }
  logger.info(`Copied file ${srcPath} -> ${finalDest}`)

  await updateMarkdownLinks({
    fileService,
    source,
    target,
    datasetRoot,
    finalDest,
    isDirectory: false,
    options,
  })
}
