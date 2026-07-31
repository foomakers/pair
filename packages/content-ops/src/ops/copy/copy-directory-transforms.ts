import { join, relative, dirname } from 'path/posix'
import { logger, createError } from '../../observability'
import { copyFileHelper } from '../../file-system'
import { FileSystemService } from '../../file-system'
import { SyncOptions } from '../SyncOptions'
import { transformPath, detectCollisions, isRegistryEntryPath } from '../naming-transforms'
import { rewriteLinksAfterTransform, PathMappingEntry } from '../link-rewriter'
import { syncFrontmatter } from '../frontmatter-transform'
import {
  buildSkillNameMap,
  buildSkillLinkPathMap,
  rewriteSkillReferencesInFiles,
  SkillNameMap,
  SkillLinkPathMap,
} from '../skill-reference-rewriter'
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
 * Two facts about the source tree's shape, from the flat file list: which
 * directories hold files DIRECTLY, and for each directory one example
 * sub-directory (ancestors included, since a file list only names leaf dirs).
 * Consumed by `validateNoShallowEntryWithSubdir`.
 */
function collectDirShapes(files: string[]): {
  dirsWithOwnFiles: Set<string>
  firstChildDirOf: Map<string, string>
} {
  const dirsWithOwnFiles = new Set<string>()
  const firstChildDirOf = new Map<string, string>()
  for (const filePath of files) {
    const dir = dirname(filePath)
    // The source ROOT is never an entry: its files are copied straight to the
    // destination root, untransformed.
    if (dir === '.') continue
    dirsWithOwnFiles.add(dir)
    const segments = dir.split('/')
    for (let i = 1; i < segments.length; i++) {
      const parent = segments.slice(0, i).join('/')
      if (!firstChildDirOf.has(parent)) {
        firstChildDirOf.set(parent, segments.slice(0, i + 1).join('/'))
      }
    }
  }
  return { dirsWithOwnFiles, firstChildDirOf }
}

/**
 * Rejects the one source shape a bounded flatten cannot represent: an entry that
 * sits SHALLOWER than `flattenDepth` and owns a sub-directory (#407 review).
 *
 * `flattenDepth` is a positional statement about the source layout — "an entry is
 * N segments deep" (ADR-020). A registry whose entries are not all at that depth
 * breaks it: in `.skills/` today `next/` is a ONE-segment entry while
 * `process/review/` is two, so `next/references` — content of `next` — has the
 * same shape as the entry `process/review`. It would install as the sibling
 * `pair-next-references/`, reintroducing for `next` all four defects this option
 * removes for a two-segment entry: misplacement outside the skill, a dead
 * `./references/…` forward link, a bogus `references` skill-name mapping that
 * leaks into unrelated files, and a path written as the sub-doc's `name:`.
 *
 * That shape is unrepresentable, not merely unhandled, so it fails loudly here —
 * before any file is copied — rather than being guessed at. A category directory
 * (only sub-directories) and an entry (files of its own) are told apart by
 * whether the directory holds files DIRECTLY: no `SKILL.md` knowledge, per
 * ADR-020's coupling argument. Files at the source ROOT are exempt: they are
 * copied straight to the destination root and are never entries.
 */
function validateNoShallowEntryWithSubdir(
  files: string[],
  transformOpts: TransformOpts,
  srcPath: string,
): void {
  const { flattenDepth } = transformOpts
  if (!transformOpts.flatten || flattenDepth === undefined || flattenDepth < 2) return

  const { dirsWithOwnFiles, firstChildDirOf } = collectDirShapes(files)

  for (const dir of dirsWithOwnFiles) {
    const depth = dir.split('/').length
    if (depth >= flattenDepth) continue
    const child = firstChildDirOf.get(dir)
    if (child === undefined) continue
    throw createError({
      type: 'IO_ERROR',
      message:
        `Ambiguous layout for a bounded flatten (flattenDepth=${flattenDepth}): '${dir}' is ${depth} segment(s) deep, ` +
        `holds files directly AND owns the sub-directory '${child}'. '${child}' is ${flattenDepth} segment(s) deep, so it cannot be told apart ` +
        `from a real entry and would install as a sibling entry instead of inside '${dir}'. ` +
        `Move '${dir}' ${flattenDepth - depth} level(s) deeper (e.g. under a category directory), or drop the sub-directory.`,
      operation: 'copyDir',
      path: join(srcPath, dir),
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
    isEntryDir: isRegistryEntryPath(dir, transformOpts.flattenDepth),
  })
}

/**
 * Post-copy bookkeeping for a transformed file: syncs the frontmatter `name`
 * when a subdirectory was renamed, and records the file in either
 * `dirMappingFiles` (files under a subdirectory) or `topLevelFiles` (root-level
 * source files) so link rewriting and mirror cleanup can see it.
 *
 * `isEntryDir` is false for a directory BELOW the registry's entry granularity
 * (a skill's `references/` sub-dir under a bounded flatten, #407). Such a file is
 * still tracked for link rewriting, but its frontmatter `name` is left alone:
 * the dir it lives in was not renamed into a new entry, so syncing would write a
 * PATH (`pair-process-review/references`) as the doc's name.
 */
async function trackTransformedFile(ctx: {
  fileService: FileSystemService
  dir: string
  fileName: string
  transformedDir: string | null
  targetFilePath: string
  dirMappingFiles: Map<string, string[]>
  topLevelFiles: Set<string>
  isEntryDir: boolean
}): Promise<void> {
  const {
    fileService,
    dir,
    fileName,
    transformedDir,
    targetFilePath,
    dirMappingFiles,
    topLevelFiles,
    isEntryDir,
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
  if (isEntryDir && leafName !== transformedDir) {
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
  const flattenDepth = options?.flattenDepth
  const base: TransformOpts = flattenDepth === undefined ? { flatten } : { flatten, flattenDepth }
  return prefix ? { ...base, prefix } : base
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
  validateNoShallowEntryWithSubdir(files, transformOpts, srcPath)

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
  const { skillNameMap, skillLinkPathMap } = await applySkillReferenceRewrites(
    fileService,
    dirMappingFiles,
    transformOpts,
  )

  logger.info(
    `Copied contents of ${srcPath} -> ${destPath} (flatten=${transformOpts.flatten}, prefix=${transformOpts.prefix ?? 'none'})`,
  )
  return skillNameMap.size > 0 ? { skillNameMap, skillLinkPathMap } : {}
}

/**
 * Removes stale top-level entries under a flatten/prefix target that no
 * longer correspond to a source directory or a root-level source file. This
 * is what makes `mirror` behavior idempotent across renames: a removed
 * skill's leftover flattened directory is cleaned up, and a prefix change no
 * longer leaves the old prefixed directory orphaned alongside the new one.
 *
 * Under an UNBOUNDED flatten only top-level entries are considered — matching
 * the granularity of the non-transform `handleMirrorCleanup`, and sufficient
 * because one source subdirectory then maps to exactly one top-level target
 * directory. Under a BOUNDED flatten (`flattenDepth`, #407) a source
 * subdirectory maps to a target SUB-PATH instead, so cleanup descends into a
 * transformed entry as well: without that, a `references/` removed from the
 * source would stay installed forever and its progressive-disclosure docs would
 * keep being loaded. Descent is gated on `flattenDepth` being present, so the
 * unbounded path stays byte-for-byte as before.
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
  // Every transformed sub-path a bounded flatten produces, plus each of its
  // ancestors: a directory holding only deeper directories has no file of its
  // own in the mapping, and must not read as stale.
  const expectedNested = new Set<string>()
  for (const originalSubDir of dirMappingFiles.keys()) {
    const transformedDir = transformPath(originalSubDir, transformOpts)
    const segments = transformedDir.split('/')
    expected.add(segments[0]!)
    for (let i = 2; i <= segments.length; i++) {
      expectedNested.add(segments.slice(0, i).join('/'))
    }
  }

  const entries = await fileService.readdir(destPath).catch(() => [])
  for (const entry of entries) {
    if (!expected.has(entry.name)) {
      const toRemove = join(destPath, entry.name)
      await fileService.rm(toRemove, { recursive: true, force: true })
      logger.info(`Mirror: removed stale transformed entry ${toRemove}`)
      continue
    }
    if (transformOpts.flattenDepth !== undefined && entry.isDirectory()) {
      await cleanupStaleNestedDirs(
        fileService,
        join(destPath, entry.name),
        entry.name,
        expectedNested,
      )
    }
  }
}

/**
 * Removes sub-directories of a transformed entry that no longer correspond to a
 * preserved source sub-path. Only directories are considered: a file inside an
 * entry belongs to that entry and is handled by the entry's own copy/overwrite.
 */
async function cleanupStaleNestedDirs(
  fileService: FileSystemService,
  dirPath: string,
  relativeDir: string,
  expectedNested: Set<string>,
): Promise<void> {
  const entries = await fileService.readdir(dirPath).catch(() => [])
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const relPath = `${relativeDir}/${entry.name}`
    const childPath = join(dirPath, entry.name)
    if (!expectedNested.has(relPath)) {
      await fileService.rm(childPath, { recursive: true, force: true })
      logger.info(`Mirror: removed stale nested entry ${childPath}`)
      continue
    }
    await cleanupStaleNestedDirs(fileService, childPath, relPath, expectedNested)
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
 * Collects .md files from dirMappingFiles and rewrites skill references if any
 * renames occurred, returning both the skill name map (for `/command` token
 * rewrites) and the skill link-path map (for SKILL.md cross-reference PATH
 * rewrites) so the caller can chain them onto other registries' files.
 *
 * The link-path map is only built and returned here — it is NOT applied to the
 * copied `.skills` files themselves: their cross-references are already
 * rewritten by `rewriteLinksAfterTransform` (via `rewriteLinksForTransformedDirs`).
 */
async function applySkillReferenceRewrites(
  fileService: FileSystemService,
  dirMappingFiles: Map<string, string[]>,
  transformOpts: TransformOpts,
): Promise<{ skillNameMap: SkillNameMap; skillLinkPathMap: SkillLinkPathMap }> {
  const skillNameMap = buildSkillNameMap(dirMappingFiles, transformOpts)
  const skillLinkPathMap = buildSkillLinkPathMap(dirMappingFiles, transformOpts)
  if (skillNameMap.size === 0) return { skillNameMap, skillLinkPathMap }

  const allMdFiles: string[] = []
  for (const mappedFiles of dirMappingFiles.values()) {
    for (const f of mappedFiles) {
      if (f.endsWith('.md')) allMdFiles.push(f)
    }
  }
  await rewriteSkillReferencesInFiles({ fileService, files: allMdFiles, skillNameMap })
  return { skillNameMap, skillLinkPathMap }
}
