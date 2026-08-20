import { join, relative, dirname } from 'path/posix'
import { logger } from '../../observability'
import { copyFileHelper, isExcluded, resolvesWithin } from '../../file-system'
import { FileSystemService } from '../../file-system'
import { SyncOptions } from '../SyncOptions'
import { transformPath, isRegistryEntryPath } from '../naming-transforms'
import {
  validateNoCollisions,
  validateNoShallowEntryWithSubdir,
  validateNoDeepEntry,
} from './layout-validation'
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
 *
 * A symlink is followed only while its target stays physically under `rootPath`. A
 * Dirent for a symlink reports neither `isFile()` nor `isDirectory()`, so an escaping
 * link used to land in this list as an ordinary file and `copyFileHelper` then read the
 * TARGET's bytes — the transform path's half of the same hole `copyDirEntry` had
 * (US-396 review round 3).
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
    if (entry.isSymbolicLink?.() && !(await resolvesWithin(fileService, entryPath, rootPath))) {
      logger.warn(`Skipped ${entryPath}: a symlink resolving outside ${rootPath} is never copied`)
      continue
    }
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
 * The source files this copy will actually install: collected, then stripped of
 * every excluded entry.
 *
 * Filtered HERE, before validation and before any `mkdir`, so an excluded entry
 * cannot contribute a flatten collision, a directory mapping, or a link-rewrite
 * pass — it is as if it were never in the source. Extracted from
 * `copyDirectoryWithTransforms` only to keep it under the 50-line ceiling.
 */
async function collectInstallableFiles(
  fileService: FileSystemService,
  srcPath: string,
  exclude: string[] | undefined,
): Promise<string[]> {
  const collected = await collectFiles(fileService, srcPath, srcPath)
  return collected.filter(f => !isExcluded(f, exclude))
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
 * The naming-transform options for this copy, from the caller's `SyncOptions`.
 *
 * `flattenDepth` is DROPPED when `flatten` is false, deliberately: it is a bound
 * ON flattening, so with no flattening there is nothing to bound. Keeping it
 * would leave the pipeline internally inconsistent — `transformPath` ignores the
 * depth unless `flatten` is set, while `isRegistryEntryPath` consults it
 * unconditionally, so a `{ flatten: false, flattenDepth: 2 }` copy would apply an
 * UNBOUNDED path transform yet classify a third-level directory as content
 * (silently dropping it from the skill-name map and the frontmatter `name:` sync).
 * The CLI rejects that combination at config validation
 * (`validateFlattenDepthField`), but `copyDirectoryWithTransforms` is public API
 * of `@pair/content-ops`; normalising here keeps ONE source of truth for
 * "bounded?" instead of gating every consumer of the option (#411 review).
 */
function buildTransformOpts(options?: SyncOptions): TransformOpts {
  const flatten = options?.flatten ?? false
  const prefix = options?.prefix
  const flattenDepth = flatten ? options?.flattenDepth : undefined
  const base: TransformOpts = flattenDepth === undefined ? { flatten } : { flatten, flattenDepth }
  return prefix ? { ...base, prefix } : base
}

/**
 * Copies a directory with flatten/prefix naming transforms applied.
 * Each file's directory path (relative to source) is transformed, then the file
 * is copied to the transformed location under the target. Source-layout
 * invariants are checked FIRST (see `layout-validation.ts`), so an unrepresentable
 * layout aborts before anything is written.
 */
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

  const files = await collectInstallableFiles(fileService, srcPath, options?.exclude)
  validateNoCollisions(files, transformOpts, srcPath)
  validateNoShallowEntryWithSubdir(files, transformOpts, srcPath)
  validateNoDeepEntry(files, transformOpts, srcPath)

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
 * transformed entry as well: at that granularity a `references/` removed from the
 * source is what would otherwise stay installed forever, with its
 * progressive-disclosure docs still being loaded. Descent is gated on
 * `flattenDepth` being present, so the unbounded path stays byte-for-byte as before.
 *
 * NOT a live fix — FORWARD-COMPATIBILITY, and deliberately so: this whole
 * function runs only under `behavior: 'mirror'`, and the one registry declaring
 * `flattenDepth` today (`skills`) declares `behavior: 'overwrite'`, so on the real
 * `pair update` path a deleted `references/` still survives — exactly as a deleted
 * whole skill directory always has under `overwrite`. The descent keeps the
 * library's mirror contract correct at the granularity the bounded flatten
 * introduced, for a `skills` flip to `mirror` or any other registry adopting the
 * option; it is exercised by unit tests, not by production configuration.
 * Recorded as an ACCEPTED RESIDUAL in ADR-020's Trade-offs (#411 review).
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
