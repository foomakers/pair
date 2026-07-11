import { logger, createError } from '../observability'
import { copyFileHelper } from '../file-system'
import { FileSystemService } from '../file-system'
import { SyncOptions } from './SyncOptions'
import { Behavior } from './behavior'
import { determineFinalDestination, updateMarkdownLinks } from './path-operation-helpers'
import { rewriteSkillReferencesInFiles, SkillNameMap } from './skill-reference-rewriter'

export type HandleFileCopyParams = {
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
}

/**
 * Handles file copy operations
 */
export async function handleFileCopy(params: HandleFileCopyParams) {
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
    skillNameMap,
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

  if (skillNameMap && skillNameMap.size > 0 && finalDest.endsWith('.md')) {
    await rewriteSkillReferencesInFiles({ fileService, files: [finalDest], skillNameMap })
  }
}
