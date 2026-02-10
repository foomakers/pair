import {
  copyDirHelper,
  copyDirectoryWithTransforms,
  copyFileHelper,
  FileSystemService,
  type TargetConfig,
} from '@pair/content-ops'
import { type SyncOptions, defaultSyncOptions } from '@pair/content-ops'
import type { RegistryConfig } from './resolver'
import { isAbsolute, dirname } from 'path'

/**
 * Performs the actual copy/mirror operation for a registry.
 */
export async function doCopyAndUpdateLinks(
  fsService: FileSystemService,
  copyOptions: {
    source: string
    target: string
    datasetRoot: string
    options?: SyncOptions
  },
): Promise<Record<string, unknown>> {
  const { source, target, datasetRoot, options } = copyOptions

  const srcPath = isAbsolute(source) ? source : fsService.resolve(datasetRoot, source)
  const tgtPath = isAbsolute(target) ? target : fsService.resolve(datasetRoot, target)

  if (!(await fsService.exists(srcPath))) {
    const { logger } = await import('@pair/content-ops')
    logger.warn(`Source path does not exist, skipping copy: ${srcPath}`)
    return {}
  }

  const stat = await fsService.stat(srcPath)
  if (stat.isDirectory()) {
    await copyDirectory(fsService, {
      srcPath,
      tgtPath,
      source,
      target,
      datasetRoot,
      ...(options && { options }),
    })
  } else {
    await fsService.mkdir(dirname(tgtPath), { recursive: true })
    await copyFileHelper(fsService, srcPath, tgtPath, 'overwrite')
  }

  return {}
}

async function copyDirectory(
  fsService: FileSystemService,
  ctx: {
    srcPath: string
    tgtPath: string
    source: string
    target: string
    datasetRoot: string
    options?: SyncOptions
  },
): Promise<void> {
  const { srcPath, tgtPath, source, target, datasetRoot, options } = ctx
  if (options?.flatten || options?.prefix) {
    await copyDirectoryWithTransforms({
      fileService: fsService,
      srcPath,
      destPath: tgtPath,
      source,
      target,
      datasetRoot,
      options,
    })
  } else {
    await copyDirHelper({
      fileService: fsService,
      oldDir: srcPath,
      newDir: tgtPath,
      defaultBehavior: options?.defaultBehavior ?? 'overwrite',
      ...(options?.folderBehavior && { folderBehavior: options.folderBehavior }),
      datasetRoot,
    })
  }
}

/**
 * Calculates absolute and relative paths for a source/target pair within a dataset.
 */
export function calculatePaths(
  fsService: FileSystemService,
  datasetRoot: string,
  absTarget: string,
  source?: string,
) {
  const fullSourcePath = fsService.resolve(datasetRoot, source || '.')
  const cwd = fsService.currentWorkingDirectory()

  const fullTargetPath = fsService.resolve(cwd, absTarget)

  const effectiveMonorepoRoot = fsService.currentWorkingDirectory()
  const canUseRelativePaths =
    fullSourcePath.startsWith(effectiveMonorepoRoot) &&
    fullTargetPath.startsWith(effectiveMonorepoRoot)

  const relativeSourcePath = canUseRelativePaths
    ? fullSourcePath.replace(effectiveMonorepoRoot + '/', '')
    : undefined
  const relativeTargetPath = canUseRelativePaths
    ? fullTargetPath.replace(effectiveMonorepoRoot + '/', '')
    : undefined

  return {
    fullSourcePath,
    cwd,
    monorepoRoot: effectiveMonorepoRoot,
    relativeSourcePath,
    fullTargetPath,
    relativeTargetPath,
  }
}

/**
 * Build SyncOptions from a RegistryConfig for use with content-ops copy operations.
 */
export function buildCopyOptions(registryConfig: RegistryConfig): SyncOptions {
  const behavior = registryConfig.behavior
  const include = registryConfig.include

  const defaults = defaultSyncOptions()
  const options: SyncOptions = {
    ...defaults,
    defaultBehavior: behavior,
    include,
    flatten: registryConfig.flatten,
    targets: registryConfig.targets,
    ...(registryConfig.prefix && { prefix: registryConfig.prefix }),
  }

  if (include.length > 0 && behavior === 'mirror') {
    const folderBehavior: Record<string, string> = {}
    include.forEach((folder: string) => {
      folderBehavior[folder] = 'mirror'
    })
    options.folderBehavior = folderBehavior as Record<
      string,
      SyncOptions['defaultBehavior'] & string
    >
    options.defaultBehavior = 'skip'
  }

  return options
}

/**
 * Distributes content from canonical target to secondary targets (symlinks and copies).
 * Called after the primary copy to canonical target is complete.
 */
export async function distributeToSecondaryTargets(params: {
  fileService: FileSystemService
  canonicalPath: string
  targets: TargetConfig[]
  baseTarget: string
}): Promise<void> {
  const { fileService, canonicalPath, targets, baseTarget } = params

  for (const target of targets) {
    if (target.mode === 'canonical') continue

    const targetPath = isAbsolute(target.path)
      ? target.path
      : fileService.resolve(baseTarget, target.path)

    if (target.mode === 'symlink') {
      await fileService.mkdir(dirname(targetPath), { recursive: true })
      await fileService.symlink(canonicalPath, targetPath)
    } else if (target.mode === 'copy') {
      await fileService.copy(canonicalPath, targetPath)
    }
  }
}
