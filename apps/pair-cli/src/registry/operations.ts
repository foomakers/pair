import {
  copyDirHelper,
  copyFileHelper,
  FileSystemService,
  type TargetConfig,
} from '@pair/content-ops'
import type { SyncOptions } from '@pair/content-ops'
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
    options?: Record<string, unknown>
  },
): Promise<Record<string, unknown>> {
  const { source, target, datasetRoot } = copyOptions

  const srcPath = isAbsolute(source) ? source : fsService.resolve(datasetRoot, source)
  const tgtPath = isAbsolute(target) ? target : fsService.resolve(datasetRoot, target)

  if (!(await fsService.exists(srcPath))) {
    return {}
  }

  const stat = await fsService.stat(srcPath)
  if (stat.isDirectory()) {
    await copyDirHelper({
      fileService: fsService,
      oldDir: srcPath,
      newDir: tgtPath,
      defaultBehavior: 'overwrite',
      datasetRoot,
    })
  } else {
    await fsService.mkdir(dirname(tgtPath), { recursive: true })
    await copyFileHelper(fsService, srcPath, tgtPath, 'overwrite')
  }

  return {}
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
 * Backward compatible: existing registries without flatten/prefix/targets get defaults.
 */
export function buildCopyOptions(registryConfig: RegistryConfig): SyncOptions {
  const behavior = registryConfig.behavior || 'mirror'
  const include = registryConfig.include || []

  const options: SyncOptions = {
    defaultBehavior: behavior,
    flatten: registryConfig.flatten ?? false,
    targets: registryConfig.targets ?? [],
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
