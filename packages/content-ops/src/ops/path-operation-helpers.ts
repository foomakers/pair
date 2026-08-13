import { join, relative, basename, dirname } from 'path/posix'
import { logger, createMirrorConstraintError, createError } from '../observability'
import { validatePaths } from '../file-system/file-validations'
import { SyncOptions } from './SyncOptions'
import { FileSystemService } from '../file-system'
import { Behavior, normalizeKey, resolveBehavior, validateMirrorConstraints } from './behavior'
import { isExcluded } from '../file-system/file-operations'
import { processPathSubstitution } from './link-batch-processor'

/**
 * Common setup and validation for path operations
 */
export function setupPathOperation(
  source: string,
  target: string,
  datasetRoot: string,
  options?: SyncOptions,
) {
  const defaultBehavior: Behavior = options?.defaultBehavior || 'overwrite'
  const folderBehavior = options?.folderBehavior
  validateMirrorConstraints(folderBehavior, createMirrorConstraintError)

  const normSource = source.replace(/\\/g, '/')
  const normTarget = target.replace(/\\/g, '/')

  // If source and target are the same, no operation needed
  if (normSource === normTarget) {
    logger.info(`Source and target are the same: ${normSource}. Nothing to do.`)
    return { shouldSkip: true, normSource, normTarget, options, defaultBehavior, folderBehavior }
  }

  const srcPath = join(datasetRoot, normSource)
  const destPath = join(datasetRoot, normTarget)

  validatePaths({
    source: normSource,
    target: normTarget,
    srcPath,
    destPath,
    datasetRoot,
  })

  return {
    shouldSkip: false,
    normSource,
    normTarget,
    srcPath,
    destPath,
    options,
    defaultBehavior,
    folderBehavior,
  }
}

/**
 * Determines the final destination path for file operations
 */
export async function determineFinalDestination(
  fileService: FileSystemService,
  destPath: string,
  source: string,
  normTarget: string,
): Promise<string> {
  try {
    const destStat = await fileService.stat(destPath)
    if (destStat.isDirectory()) {
      return join(destPath, basename(source))
    } else {
      return destPath
    }
  } catch {
    if (normTarget.endsWith('.md')) {
      await fileService.mkdir(dirname(destPath), { recursive: true })
      return destPath
    } else {
      await fileService.mkdir(destPath, { recursive: true })
      return join(destPath, basename(source))
    }
  }
}

/**
 * Updates markdown links after path operation
 */
export type UpdateMarkdownLinksParams = {
  fileService: FileSystemService
  source: string
  target: string
  datasetRoot: string
  finalDest: string
  isDirectory: boolean
  options: SyncOptions | undefined
}

export async function updateMarkdownLinks(params: UpdateMarkdownLinksParams) {
  const { fileService, source, target, datasetRoot, finalDest, isDirectory, options } = params

  const oldBase = isDirectory ? source.replace(/\\/g, '/') + '/' : source.replace(/\\/g, '/')

  const newBase = isDirectory
    ? target.replace(/\\/g, '/') + '/'
    : relative(datasetRoot, finalDest).replace(/\\/g, '/')

  const concurrencyLimit = options?.concurrencyLimit || DEFAULT_CONCURRENCY_LIMIT
  await bulkUpdateMarkdownLinks({ fileService, oldBase, newBase, datasetRoot, concurrencyLimit })
}

/**
 * Handles mirror behavior cleanup for directories.
 *
 * RECURSIVE by necessity (#426, absorbed into #393). The comparison used to stop at the
 * top level: an entry present on BOTH sides was kept and never looked inside, so a file
 * removed from the source survived every mirror run forever. A directory present on both
 * sides is therefore DESCENDED INTO rather than kept wholesale; only an entry absent from
 * the source is removed, exactly as before. That asymmetry is the whole point: `rm -r` on
 * a shared directory would delete content the source still has.
 *
 * SCOPE — read before citing this as a `pair update` fix. This function runs on the
 * content-ops library path only (`copyPathOps` / `movePathOps` → `performDirectoryCopy`,
 * gated on `behavior: 'mirror'`). The CLI's registry install does NOT reach it: for a
 * registry without flatten/prefix — which is every `behavior: "mirror"` registry shipped —
 * `doCopyAndUpdateLinks` goes to the CLI-local `copyDirectory`
 * (`apps/pair-cli/src/registry/operations.ts`) → `copyDirHelper`, a pure source→target
 * copy that deletes nothing. Measured on this branch: a top-level AND a nested orphan
 * planted under `.pair/knowledge/**` both survive `pair update`. So the two how-to guides
 * deleted from the dataset in #246 and still installed ~5 months later were removed BY
 * HAND in #393; wiring cleanup onto the install path is an open product decision (it makes
 * `pair update` delete an adopter's own files under a mirror target, with no dry-run) and
 * is recorded as such in `.pair/adoption/decision-log/2026-08-11-a-mirror-guard-compares-the-transform.md`.
 *
 * OWNERSHIP — required now that the walk is recursive. The copy step decides, at EVERY
 * depth, what it installs: an `exclude`d entry is dropped as if it were never in the
 * source, and an entry resolving to `add` or `skip` is left alone (for `add`, target-only
 * files are the entire point of the semantics). A delete pass that descends the shared
 * tree without the same knowledge deletes MORE than the copy would install — adopter
 * content, under a subtree the registry does not own. `ownership` carries that context;
 * omitting it keeps the pre-#393 semantics (everything under the mirror root is owned),
 * which is what the plain `mirror` registries shipped today mean.
 *
 * Reachability, so the next reader does not over-trust either half: `exclude` under a
 * mirror root is fully reachable from config and is pinned end-to-end in
 * `copy-directory.test.ts`. `add`/`skip` under a mirror root is NOT reachable through a
 * validated registry today — `validateMirrorConstraints` rejects a non-mirror descendant
 * of a `mirror` key — so that half is defense-in-depth for direct callers of this
 * exported function and for any future relaxation of that constraint. It is pinned at the
 * unit level rather than through the copy path for exactly that reason.
 */
export type MirrorCleanupOwnership = {
  /** Source-relative entries the registry never installs. Needs `excludeRoot`. */
  exclude?: string[]
  /** The registry source root `exclude` entries resolve against. */
  excludeRoot?: string
  /** Per-path behavior overrides, same map the copy step resolves against. */
  folderBehavior?: Record<string, Behavior>
  /** Behavior when no override matches. Defaults to `overwrite` (owned). */
  defaultBehavior?: Behavior
  /** Root the `folderBehavior` keys are relative to. Without it, behavior is not resolved. */
  datasetRoot?: string
}

/**
 * Whether the registry owns this source path — i.e. whether the copy step would install
 * it. Mirrors `copyDirEntry`'s two short-circuits (exclusion first, then behavior), so
 * cleanup can never delete what the copy would have left in place. `add` counts as
 * not-owned unconditionally here: the caller only ever asks about a path that EXISTS in
 * the target, which is exactly the case where the copy returns early.
 */
function registryOwns(srcEntryPath: string, ownership: MirrorCleanupOwnership): boolean {
  const { exclude, excludeRoot, folderBehavior, defaultBehavior, datasetRoot } = ownership

  if (excludeRoot && isExcluded(relative(excludeRoot, srcEntryPath), exclude)) return false
  if (!datasetRoot) return true

  const rel = normalizeKey(relative(datasetRoot, srcEntryPath))
  const behavior = resolveBehavior(rel, folderBehavior, defaultBehavior ?? 'overwrite')
  return behavior !== 'add' && behavior !== 'skip'
}

export async function handleMirrorCleanup(
  fileService: FileSystemService,
  srcPath: string,
  destPath: string,
  ownership: MirrorCleanupOwnership = {},
) {
  const destEntries = await fileService.readdir(destPath).catch(() => [])
  const srcEntries = await fileService.readdir(srcPath).catch(() => [])
  const srcByName = new Map(srcEntries.map(e => [e.name, e]))

  for (const de of destEntries) {
    // Not ours: neither removed nor descended into. The target side is the adopter's here.
    if (!registryOwns(join(srcPath, de.name), ownership)) {
      logger.info(`Mirror: left ${join(destPath, de.name)} untouched (not owned by the registry)`)
      continue
    }

    const src = srcByName.get(de.name)

    if (!src) {
      // Absent from the source: remove it, whatever it is.
      const toRemove = join(destPath, de.name)
      if (fileService.rm) {
        await fileService.rm(toRemove, { recursive: true, force: true })
        // WARN, not info: this is the one place `pair update` DELETES from the target tree.
        // `.pair/knowledge/` is a mirror — `customization/templates.mdx` states that edits
        // there are lost on the next update and that customization belongs in
        // `.pair/adoption/` — but a deletion the operator cannot see in the output is
        // indistinguishable from data loss, whatever the docs say.
        logger.warn(
          `Mirror: removed ${toRemove} (not in the source; customize via .pair/adoption/)`,
        )
      }
      continue
    }

    // Present on both sides. If both are directories, the stale entries may be INSIDE —
    // recurse. Anything else (a file the source also has, or a type mismatch we do not
    // adjudicate here) is left to the copy step that follows.
    if (de.isDirectory?.() && src.isDirectory?.()) {
      await handleMirrorCleanup(
        fileService,
        join(srcPath, de.name),
        join(destPath, de.name),
        ownership,
      )
    }
  }
}

/**
 * Validates that directory operation doesn't create invalid subfolder relationships
 */
export function validateSubfolderOperation(params: {
  srcPath: string
  destPath: string
  normSource: string
  normTarget: string
  operation: 'copy' | 'move'
}) {
  const { srcPath, destPath, normSource, normTarget, operation } = params
  const subTest = relative(srcPath, destPath)
  if (subTest && !subTest.startsWith('..')) {
    const errorType = operation === 'copy' ? 'INVALID_SUBFOLDER_COPY' : 'INVALID_SUBFOLDER_MOVE'
    const message = `Cannot ${operation} a folder into one of its own subfolders. Aborting.`
    throw createError({
      type: errorType,
      message,
      source: normSource,
      target: normTarget,
    })
  }
} // Constants

export const DEFAULT_CONCURRENCY_LIMIT = 10

export async function bulkUpdateMarkdownLinks(params: {
  fileService: FileSystemService
  oldBase: string
  newBase: string
  datasetRoot: string
  concurrencyLimit?: number
}) {
  const {
    fileService,
    oldBase,
    newBase,
    datasetRoot,
    concurrencyLimit = DEFAULT_CONCURRENCY_LIMIT,
  } = params
  return logger.time(async () => {
    const result = await processPathSubstitution({
      datasetRoot,
      oldBase,
      newBase,
      config: { concurrencyLimit },
      fileService,
    })

    // Log results
    if (result.processedFiles > 0) {
      logger.info(
        `✅ Links updated: ${result.totalLinksUpdated} (in ${result.processedFiles} files)`,
      )
    }

    // Log errors if any
    if (result.errors.length > 0) {
      logger.warn(`⚠️  ${result.errors.length} errors occurred during processing:`)
      for (const error of result.errors) {
        logger.warn(`  - ${error.file}: ${error.error}`)
      }
    }

    return result
  }, 'bulkUpdateMarkdownLinks')
}
