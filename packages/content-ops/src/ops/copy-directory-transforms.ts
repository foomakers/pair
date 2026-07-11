import { join, relative, dirname } from 'path/posix'
import { logger, createError } from '../observability'
import { copyFileHelper } from '../file-system'
import { FileSystemService } from '../file-system'
import { SyncOptions } from './SyncOptions'
import { transformPath, detectCollisions } from './naming-transforms'
import { rewriteLinksAfterTransform, PathMappingEntry } from './link-rewriter'
import { syncFrontmatter } from './frontmatter-transform'
import {
  buildSkillNameMap,
  rewriteSkillReferencesInFiles,
  SkillNameMap,
} from './skill-reference-rewriter'
import type { CopyPathOpsResult, TransformOpts } from './copy-types'

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
  topLevelFiles: Set<string>
}): Promise<void> {
  const {
    fileService,
    filePath,
    srcPath,
    destPath,
    transformOpts,
    dirMappingFiles,
    topLevelFiles,
  } = ctx
  const dir = dirname(filePath)
  const fileName = filePath.slice(dir === '.' ? 0 : dir.length + 1)
  const transformedDir = dir === '.' ? null : transformPath(dir, transformOpts)
  const targetDir = transformedDir ? join(destPath, transformedDir) : destPath
  const targetFilePath = join(targetDir, fileName)

  await fileService.mkdir(targetDir, { recursive: true })
  await copyFileHelper(fileService, join(srcPath, filePath), targetFilePath, 'overwrite')

  await trackTransformedFile({
    fileService,
    dir,
    fileName,
    transformedDir,
    targetFilePath,
    dirMappingFiles,
    topLevelFiles,
  })
}

/**
 * Post-copy bookkeeping for a transformed file: syncs the frontmatter `name`
 * when a subdirectory was renamed, and records the file in either
 * `dirMappingFiles` (files under a subdirectory) or `topLevelFiles` (root-level
 * source files) so link rewriting and mirror cleanup can see it.
 */
async function trackTransformedFile(ctx: {
  fileService: FileSystemService
  dir: string
  fileName: string
  transformedDir: string | null
  targetFilePath: string
  dirMappingFiles: Map<string, string[]>
  topLevelFiles: Set<string>
}): Promise<void> {
  const {
    fileService,
    dir,
    fileName,
    transformedDir,
    targetFilePath,
    dirMappingFiles,
    topLevelFiles,
  } = ctx

  if (dir === '.') {
    // Root-level source file — has no transformed subdirectory of its own, so it's
    // never added to dirMappingFiles. Track it separately so cleanupStaleTransformedEntries
    // knows it's a legitimate copy, not a stale leftover (see that function's docstring).
    topLevelFiles.add(fileName)
    return
  }
  if (!transformedDir) return

  const leafName = dir.split('/').pop()!
  if (leafName !== transformedDir) {
    const content = await fileService.readFile(targetFilePath)
    const synced = syncFrontmatter(content, { from: leafName, to: transformedDir })
    if (synced !== content) {
      await fileService.writeFile(targetFilePath, synced)
    }
  }

  if (!dirMappingFiles.has(dir)) dirMappingFiles.set(dir, [])
  dirMappingFiles.get(dir)!.push(targetFilePath)
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
 * Copies every file with naming transforms applied, collecting both the
 * per-subdirectory mapping (for link rewriting, skill renames, and mirror
 * cleanup of transformed directories) and the set of root-level file names
 * (for mirror cleanup of files that have no subdirectory of their own).
 */
async function copyAllFilesWithTransform(params: {
  fileService: FileSystemService
  files: string[]
  srcPath: string
  destPath: string
  transformOpts: TransformOpts
}): Promise<{ dirMappingFiles: Map<string, string[]>; topLevelFiles: Set<string> }> {
  const { fileService, files, srcPath, destPath, transformOpts } = params
  const dirMappingFiles = new Map<string, string[]>()
  const topLevelFiles = new Set<string>()
  for (const filePath of files) {
    await copyFileWithTransform({
      fileService,
      filePath,
      srcPath,
      destPath,
      transformOpts,
      dirMappingFiles,
      topLevelFiles,
    })
  }
  return { dirMappingFiles, topLevelFiles }
}

/**
 * Copies a directory with flatten/prefix naming transforms applied.
 * Each file's directory path (relative to source) is transformed, then
 * the file is copied to the transformed location under the target.
 */
function buildTransformOpts(options?: SyncOptions): TransformOpts {
  const flatten = options?.flatten ?? false
  const prefix = options?.prefix
  return prefix ? { flatten, prefix } : { flatten }
}

export async function copyDirectoryWithTransforms(params: {
  fileService: FileSystemService
  srcPath: string
  destPath: string
  source: string
  target: string
  datasetRoot: string
  options?: SyncOptions
}): Promise<CopyPathOpsResult> {
  const { fileService, srcPath, destPath, options } = params
  const transformOpts = buildTransformOpts(options)

  const files = await collectFiles(fileService, srcPath, srcPath)
  validateNoCollisions(files, transformOpts, srcPath)

  await fileService.mkdir(destPath, { recursive: true })

  const { dirMappingFiles, topLevelFiles } = await copyAllFilesWithTransform({
    fileService,
    files,
    srcPath,
    destPath,
    transformOpts,
  })

  if (options?.defaultBehavior === 'mirror') {
    await cleanupStaleTransformedEntries({
      fileService,
      destPath,
      dirMappingFiles,
      topLevelFiles,
      transformOpts,
    })
  }

  await rewriteLinksForTransformedDirs(params, dirMappingFiles, transformOpts)
  const skillNameMap = await applySkillReferenceRewrites(
    fileService,
    dirMappingFiles,
    transformOpts,
  )

  logger.info(
    `Copied contents of ${srcPath} -> ${destPath} (flatten=${transformOpts.flatten}, prefix=${transformOpts.prefix ?? 'none'})`,
  )
  return skillNameMap.size > 0 ? { skillNameMap } : {}
}

/**
 * Removes stale top-level entries under a flatten/prefix target that no
 * longer correspond to a source directory or a root-level source file. This
 * is what makes `mirror` behavior idempotent across renames: a removed
 * skill's leftover flattened directory is cleaned up, and a prefix change no
 * longer leaves the old prefixed directory orphaned alongside the new one.
 *
 * Only top-level entries are considered — matches the granularity of the
 * non-transform `handleMirrorCleanup` and the flatten use case (one source
 * subdirectory maps to exactly one top-level target directory).
 *
 * `topLevelFiles` (file names copied directly from the source root, with no
 * subdirectory of their own) must be included in `expected` alongside the
 * transformed directory names — they're never in `dirMappingFiles` (which
 * only tracks files under a subdirectory), so without this they'd be
 * wrongly deleted as stale on the very next mirror run.
 */
async function cleanupStaleTransformedEntries(params: {
  fileService: FileSystemService
  destPath: string
  dirMappingFiles: Map<string, string[]>
  topLevelFiles: Set<string>
  transformOpts: TransformOpts
}): Promise<void> {
  const { fileService, destPath, dirMappingFiles, topLevelFiles, transformOpts } = params

  const expected = new Set<string>(topLevelFiles)
  for (const originalSubDir of dirMappingFiles.keys()) {
    const transformedDir = transformPath(originalSubDir, transformOpts)
    expected.add(transformedDir.split('/')[0]!)
  }

  const entries = await fileService.readdir(destPath).catch(() => [])
  for (const entry of entries) {
    if (expected.has(entry.name)) continue
    const toRemove = join(destPath, entry.name)
    await fileService.rm(toRemove, { recursive: true, force: true })
    logger.info(`Mirror: removed stale transformed entry ${toRemove}`)
  }
}

async function rewriteLinksForTransformedDirs(
  params: {
    fileService: FileSystemService
    datasetRoot: string
    srcPath: string
    destPath: string
    source: string
    target: string
  },
  dirMappingFiles: Map<string, string[]>,
  transformOpts: TransformOpts,
): Promise<void> {
  const sourceRelative = relative(params.datasetRoot, params.srcPath) || params.source
  const targetRelative = relative(params.datasetRoot, params.destPath) || params.target
  const pathMapping = buildPathMapping(
    dirMappingFiles,
    transformOpts,
    sourceRelative,
    targetRelative,
  )
  if (pathMapping.length > 0) {
    const sourceContentRoot = dirname(sourceRelative)
    await rewriteLinksAfterTransform({
      fileService: params.fileService,
      pathMapping,
      datasetRoot: params.datasetRoot,
      ...(sourceContentRoot !== '.' && { sourceContentRoot }),
    })
  }
}

/**
 * Collects .md files from dirMappingFiles and rewrites skill references if any renames occurred.
 */
async function applySkillReferenceRewrites(
  fileService: FileSystemService,
  dirMappingFiles: Map<string, string[]>,
  transformOpts: TransformOpts,
): Promise<SkillNameMap> {
  const skillNameMap = buildSkillNameMap(dirMappingFiles, transformOpts)
  if (skillNameMap.size === 0) return skillNameMap

  const allMdFiles: string[] = []
  for (const mappedFiles of dirMappingFiles.values()) {
    for (const f of mappedFiles) {
      if (f.endsWith('.md')) allMdFiles.push(f)
    }
  }
  await rewriteSkillReferencesInFiles({ fileService, files: allMdFiles, skillNameMap })
  return skillNameMap
}
