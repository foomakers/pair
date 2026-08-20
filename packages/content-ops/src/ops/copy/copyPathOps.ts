import { Stats } from 'fs'
import { logger, createError } from '../../observability'
import { validateSourceExists, validateSourceContained } from '../../file-system/file-validations'
import { SyncOptions } from '../SyncOptions'
import { FileSystemService } from '../../file-system'
import { Behavior } from '../behavior'
import { setupPathOperation } from '../path-operation-helpers'
import { isAbsolute } from 'path'
import { SkillNameMap, SkillLinkPathMap } from '../skill-reference-rewriter'
import { handleDirectoryCopy, HandleDirectoryCopyParams } from './copy-directory'
import { handleFileCopy, HandleFileCopyParams } from './copy-file'
import { copyDirectoryWithTransforms } from './copy-directory-transforms'
import type { CopyPathOpsResult } from './copy-types'

export type { CopyPathOpsResult } from './copy-types'
export { copyDirectoryWithTransforms } from './copy-directory-transforms'

type CopyPathOpsParams = {
  fileService: FileSystemService
  source: string
  target: string
  datasetRoot: string
  options?: SyncOptions
  /** Pre-built skill name map from a previous copy (e.g., skills registry).
   *  When provided, rewrites skill references in all copied .md files. */
  skillNameMap?: SkillNameMap
  /** Pre-built skill link-path map from a previous copy (e.g., skills registry).
   *  When provided, rewrites SKILL.md cross-reference paths in all copied .md files. */
  skillLinkPathMap?: SkillLinkPathMap
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
    skillNameMap?: SkillNameMap
    skillLinkPathMap?: SkillLinkPathMap
  },
): Promise<CopyPathOpsResult> {
  if (stat.isDirectory()) {
    return handleDirectoryCopyForType(params)
  } else if (stat.isFile()) {
    await handleFileCopyForType(params)
    return {}
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
  skillNameMap?: SkillNameMap
}): Promise<CopyPathOpsResult> {
  if (hasNamingTransforms(params.options)) {
    return copyDirectoryWithTransforms(params)
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
  return {}
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
  skillNameMap?: SkillNameMap
  skillLinkPathMap?: SkillLinkPathMap
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
    ...(params.skillNameMap && { skillNameMap: params.skillNameMap }),
    ...(params.skillLinkPathMap && { skillLinkPathMap: params.skillLinkPathMap }),
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

type PreparedCopy =
  | { skip: true; result: CopyPathOpsResult }
  | {
      skip: false
      normSource: string
      normTarget: string
      srcPath: string
      destPath: string
      defaultBehavior: Behavior
      folderBehavior?: Record<string, Behavior>
    }

/**
 * Resolves and validates source/target paths for a copy operation, applying
 * the same-path skip up front.
 */
function prepareCopyPathOperation(
  source: string,
  target: string,
  datasetRoot: string,
  options?: SyncOptions,
): PreparedCopy {
  const setup = setupPathOperation(source, target, datasetRoot, options)
  if (setup.shouldSkip) return { skip: true, result: {} }

  const { normSource, normTarget, srcPath, destPath, defaultBehavior, folderBehavior } = setup
  if (!srcPath || !destPath) {
    throw createError({
      type: 'IO_ERROR',
      message: 'Invalid source or destination path',
      operation: 'setup',
      path: srcPath || destPath || '',
    })
  }

  return {
    skip: false,
    normSource,
    normTarget,
    srcPath,
    destPath,
    defaultBehavior: defaultBehavior ?? 'overwrite',
    ...(folderBehavior && { folderBehavior }),
  }
}

export async function copyPathOps(params: CopyPathOpsParams): Promise<CopyPathOpsResult> {
  const { fileService, source, target, datasetRoot, options, skillNameMap, skillLinkPathMap } =
    params
  if (isAbsolute(source) || isAbsolute(target)) {
    throw createError({
      type: 'INVALID_PATH',
      message: 'Source and target paths must be relative, not absolute',
      sourcePath: source,
      targetPath: target,
    })
  }
  return logger.time(async () => {
    const prepared = prepareCopyPathOperation(source, target, datasetRoot, options)
    if (prepared.skip) return prepared.result

    await validateSourceContained({
      fileService,
      srcPath: prepared.srcPath,
      datasetRoot,
      source,
      target,
    })
    const stat = await validateSourceExists(fileService, prepared.srcPath)
    return performCopyBasedOnType(stat, {
      fileService,
      srcPath: prepared.srcPath,
      destPath: prepared.destPath,
      source,
      target,
      normSource: prepared.normSource,
      normTarget: prepared.normTarget,
      datasetRoot,
      defaultBehavior: prepared.defaultBehavior,
      ...(prepared.folderBehavior && { folderBehavior: prepared.folderBehavior }),
      ...(options && { options }),
      ...(skillNameMap && { skillNameMap }),
      ...(skillLinkPathMap && { skillLinkPathMap }),
    })
  }, 'copyPathAndUpdateLinks')
}
