import {
  copyDirHelper,
  copyDirectoryWithTransforms,
  copyFileHelper,
  FileSystemService,
  type TargetConfig,
  type TransformConfig,
  type CopyPathOpsResult,
  stripAllMarkers,
  applyTransformCommands,
  validateMarkers,
} from '@pair/content-ops'
import { type SyncOptions, defaultSyncOptions } from '@pair/content-ops'
import type { RegistryConfig } from './resolver'
import { isAbsolute, dirname, relative } from 'path'
import { getCanonicalTarget } from './layout'

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
    return await copyDirectory(fsService, {
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
): Promise<CopyPathOpsResult> {
  const { srcPath, tgtPath, source, target, datasetRoot, options } = ctx
  if (options?.flatten || options?.prefix) {
    return await copyDirectoryWithTransforms({
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
    return {}
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

function throwOnMarkerErrors(content: string, filePath: string): void {
  const errors = validateMarkers(content)
  if (errors.length > 0) {
    const details = errors.map(e => `  line ${e.line}: ${e.message}`).join('\n')
    throw new Error(`Invalid markers in '${filePath}':\n${details}`)
  }
}

/**
 * Strips marker comments from a target file. Optionally applies transform commands first.
 * Validates markers before processing — throws on malformed or unsupported markers.
 */
export async function stripMarkersFromTarget(
  fsService: FileSystemService,
  targetPath: string,
  transform?: TransformConfig,
): Promise<void> {
  const content = await fsService.readFile(targetPath)
  throwOnMarkerErrors(content, targetPath)
  let result = content
  if (transform) {
    result = applyTransformCommands(result, transform.prefix)
  }
  result = stripAllMarkers(result)
  await fsService.writeFile(targetPath, result)
}

/**
 * Distributes content from canonical target to secondary targets (symlinks and copies).
 * For targets with a transform config, reads from the original source and applies the transform.
 * Called after the primary copy to canonical target is complete.
 */
export async function distributeToSecondaryTargets(params: {
  fileService: FileSystemService
  sourcePath: string
  targets: TargetConfig[]
  baseTarget: string
}): Promise<void> {
  const { fileService, sourcePath, targets, baseTarget } = params

  const canonical = getCanonicalTarget(targets)
  if (!canonical) return

  const canonicalPath = isAbsolute(canonical.path)
    ? canonical.path
    : fileService.resolve(baseTarget, canonical.path)

  if (!(await fileService.exists(canonicalPath))) {
    const { logger } = await import('@pair/content-ops')
    logger.warn(`Canonical path does not exist, skipping secondary distribution: ${canonicalPath}`)
    return
  }

  for (const target of targets) {
    if (target.mode === 'canonical') continue

    const targetPath = isAbsolute(target.path)
      ? target.path
      : fileService.resolve(baseTarget, target.path)

    if (target.transform) {
      const content = await fileService.readFile(sourcePath)
      throwOnMarkerErrors(content, sourcePath)
      const transformed = applyTransformCommands(content, target.transform.prefix)
      const clean = stripAllMarkers(transformed)
      await fileService.mkdir(dirname(targetPath), { recursive: true })
      await fileService.writeFile(targetPath, clean)
    } else if (target.mode === 'symlink') {
      await createOrReplaceSymlink(fileService, canonicalPath, targetPath)
    } else if (target.mode === 'copy') {
      await fileService.copy(canonicalPath, targetPath)
    }
  }
}

/**
 * Post-copy operations for a registry: strips markers from file targets
 * and distributes content to secondary targets (symlinks, copies).
 */
export async function postCopyOps(ctx: {
  fs: FileSystemService
  registryConfig: RegistryConfig
  effectiveTarget: string
  datasetPath: string
  baseTarget: string
}): Promise<void> {
  const { fs, registryConfig, effectiveTarget, datasetPath, baseTarget } = ctx
  const canonicalTarget = getCanonicalTarget(registryConfig.targets)
  if (await fs.exists(effectiveTarget)) {
    const stat = await fs.stat(effectiveTarget)
    if (!stat.isDirectory()) {
      await stripMarkersFromTarget(fs, effectiveTarget, canonicalTarget?.transform)
    }
  }
  if (registryConfig.targets.length > 1) {
    await distributeToSecondaryTargets({
      fileService: fs,
      sourcePath: datasetPath,
      targets: registryConfig.targets,
      baseTarget,
    })
  }
}

async function createOrReplaceSymlink(
  fileService: FileSystemService,
  target: string,
  linkPath: string,
): Promise<void> {
  await fileService.mkdir(dirname(linkPath), { recursive: true })
  if (fileService.existsSync(linkPath)) {
    await fileService.unlink(linkPath)
  }
  // Use relative path so symlinks are portable across machines
  const relTarget = relative(dirname(linkPath), target)
  await fileService.symlink(relTarget, linkPath)
}
