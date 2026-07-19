import { logger, createError } from '../../observability'
import { copyFileHelper } from '../../file-system'
import { FileSystemService } from '../../file-system'
import { SyncOptions } from '../SyncOptions'
import { Behavior } from '../behavior'
import { determineFinalDestination, updateMarkdownLinks } from '../path-operation-helpers'
import {
  rewriteSkillReferencesInFiles,
  rewriteSkillLinkPathsInFiles,
  SkillNameMap,
  SkillLinkPathMap,
} from '../skill-reference-rewriter'

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
  skillLinkPathMap?: SkillLinkPathMap
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
    skillLinkPathMap,
  } = params

  const finalDest = await determineFinalDestination(fileService, destPath, source, normTarget)

  try {
    await copyFileHelper(fileService, srcPath, finalDest, defaultBehavior)
  } catch (err) {
    logger.error(`Failed to copy file ${srcPath} -> ${finalDest}: ${String(err)}`)
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

  await applySkillRewrites(fileService, finalDest, skillNameMap, skillLinkPathMap)
}

/** Applies skill-command and skill-link-path rewrites to a copied markdown file. */
async function applySkillRewrites(
  fileService: FileSystemService,
  finalDest: string,
  skillNameMap?: SkillNameMap,
  skillLinkPathMap?: SkillLinkPathMap,
): Promise<void> {
  if (!finalDest.endsWith('.md')) return
  if (skillNameMap && skillNameMap.size > 0) {
    await rewriteSkillReferencesInFiles({ fileService, files: [finalDest], skillNameMap })
  }
  if (skillLinkPathMap && skillLinkPathMap.size > 0) {
    await rewriteSkillLinkPathsInFiles({
      fileService,
      files: [finalDest],
      linkMap: skillLinkPathMap,
    })
  }
}
