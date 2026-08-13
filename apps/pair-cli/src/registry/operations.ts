import {
  handleMirrorCleanup,
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
    return { skipped: true, reason: `Source path does not exist: ${srcPath}` }
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

function buildCopyDirHelperContext(ctx: {
  fsService: FileSystemService
  srcPath: string
  tgtPath: string
  datasetRoot: string
  options?: SyncOptions
}) {
  const { fsService, srcPath, tgtPath, datasetRoot, options } = ctx
  return {
    fileService: fsService,
    oldDir: srcPath,
    newDir: tgtPath,
    defaultBehavior: options?.defaultBehavior ?? 'overwrite',
    datasetRoot,
    ...(options?.folderBehavior && { folderBehavior: options.folderBehavior }),
    // A registry may declare `exclude` without flatten/prefix; this is the path it
    // takes then, so the entries must be honored here as well as in the transform path.
    ...(options?.exclude?.length && { exclude: options.exclude, excludeRoot: srcPath }),
  }
}

/**
 * Whether this registry mirrors ANY path — the top-level `behavior: "mirror"`, or a
 * per-folder override that resolves to `mirror`.
 *
 * The distinction is load-bearing, not defensive: `buildCopyOptions` (below) REWRITES
 * `defaultBehavior` to `'skip'` for a mirror registry that declares `include`, moving the
 * mirror into `folderBehavior`. The shipped `github` registry is exactly that shape
 * (`include: ["/agents"]`), and `update/handler.ts` feeds `buildCopyOptions`' output
 * straight in — so gating cleanup on the raw `defaultBehavior` skipped cleanup for the one
 * registry whose mirror is expressed per folder, and an agent file retired from
 * `dataset/.github/agents/` stayed installed in an adopting project forever.
 *
 * Widening the gate does NOT widen the blast radius: the bound lives in
 * `handleMirrorCleanup`'s ownership check, which resolves each entry's behavior through the
 * same `folderBehavior` map. Under `.github` that makes `agents` owned (`mirror`) and
 * `workflows` / `ISSUE_TEMPLATE` / `skills` not owned (`skip`) — never removed, never even
 * descended into.
 *
 * `folderBehavior` is only ever emitted by `buildCopyOptions` alongside `defaultBehavior:
 * 'skip'`, so "mirrors any path" cannot widen cleanup past the included folders from a
 * config-built registry; a hand-built options object mixing an owned default with a mirror
 * subfolder would be cleaned across that default, which is the ownership resolution's
 * answer, not this predicate's.
 */
function mirrorsAnyPath(options?: SyncOptions): boolean {
  if (options?.defaultBehavior === 'mirror') return true
  return Object.values(options?.folderBehavior ?? {}).includes('mirror')
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
  }

  const helperCtx = buildCopyDirHelperContext({
    fsService,
    srcPath,
    tgtPath,
    datasetRoot,
    ...(options && { options }),
  })

  // A `mirror` registry deletes what the dataset no longer ships — and until now that only
  // happened on the content-ops generic copy path, never on `pair update`. `copyDirHelper`
  // is a pure source->dest copy, so a file removed from the dataset survived every update
  // forever: two how-to guides dropped in #246 were still installed ~5 months later and were
  // still advertised by `.pair/llms.txt`, pointing agents at guides the KB no longer ships.
  //
  // Gate on the EFFECTIVE behavior (see `mirrorsAnyPath`), never on the raw default. The
  // ownership context is the SAME object the copy below uses, so cleanup and copy can
  // never disagree about what the registry owns: `handleMirrorCleanup` refuses to touch an
  // `exclude`d path, or one whose resolved behavior is `add` or `skip` — the cases where a
  // target-only file is the point, and the adopter's to keep.
  if (mirrorsAnyPath(options)) {
    await handleMirrorCleanup(fsService, srcPath, tgtPath, helperCtx)
  }

  await copyDirHelper(helperCtx)
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
    // #407: without this the copy pipeline always ran unbounded, so a skill's
    // nested `references/` installed as a sibling pseudo-skill.
    ...(registryConfig.flattenDepth !== undefined && {
      flattenDepth: registryConfig.flattenDepth,
    }),
    // Optional access on purpose: `buildCopyOptions` is called with hand-built
    // RegistryConfig objects too, not only with output of `parseRegistry`.
    ...(registryConfig.exclude?.length ? { exclude: registryConfig.exclude } : {}),
    ...(registryConfig.prefix && { prefix: registryConfig.prefix }),
  }

  if (include.length > 0 && behavior === 'mirror') {
    const folderBehavior: Record<string, string> = {}
    const normalizedSource = registryConfig.source.replace(/^\/+/, '').replace(/\/+$/, '')
    include.forEach((folder: string) => {
      // Prefix with registry source so keys match paths relative to datasetRoot
      const stripped = folder.replace(/^\/+/, '').replace(/\/+$/, '')
      const key = normalizedSource ? `${normalizedSource}/${stripped}` : stripped
      folderBehavior[key] = 'mirror'
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
 * Writes a single secondary target: applies a transform, creates a symlink,
 * or copies from the canonical path, depending on the target's mode.
 */
async function writeSecondaryTarget(params: {
  fileService: FileSystemService
  sourcePath: string
  canonicalPath: string
  target: TargetConfig
  targetPath: string
}): Promise<void> {
  const { fileService, sourcePath, canonicalPath, target, targetPath } = params
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

    await writeSecondaryTarget({ fileService, sourcePath, canonicalPath, target, targetPath })
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
