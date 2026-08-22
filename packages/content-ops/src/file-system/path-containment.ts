import { relative, isAbsolute } from 'path'
import type { FileSystemService } from './file-system-service'

/**
 * Whether `path` physically lives under `root` — every symlink component resolved on
 * BOTH sides.
 *
 * Lexical containment is not containment (US-396 review round 3). `fs.stat` follows
 * symlinks, so a KB shipping `leak -> ../../../.ssh` inside its own tree passes any
 * check made on the NAME — the name never leaves the root — and the copier then reports
 * `isDirectory: true` for someone else's directory and installs it into the repository
 * the user commits. Resolving both sides is the only check that sees it.
 *
 * Resolving the ROOT too is what keeps this from rejecting honest setups: `/tmp` is a
 * symlink to `/private/tmp` on macOS, and a KB cached under a symlinked home directory
 * is normal. Comparing a resolved path against an unresolved root would fail both.
 *
 * A path that DOES NOT EXIST is contained: there is no target to dereference, and the
 * caller's own existence check owns that case (a registry the source does not ship is
 * skipped, not refused). An unreadable root is treated the same way — this is a
 * containment check, not an existence check.
 */
export function resolvesWithinSync(
  fileService: FileSystemService,
  path: string,
  root: string,
): boolean {
  const physicalPath = physicalOrNull(p => fileService.realpathSync(p), path)
  if (physicalPath === null) return true
  const physicalRoot = physicalOrNull(p => fileService.realpathSync(p), root) ?? root
  return isWithin(physicalPath, physicalRoot)
}

/** Async twin of `resolvesWithinSync`, for the copy traversal. */
export async function resolvesWithin(
  fileService: FileSystemService,
  path: string,
  root: string,
): Promise<boolean> {
  const physicalPath = await physicalOrNullAsync(fileService, path)
  if (physicalPath === null) return true
  const physicalRoot = (await physicalOrNullAsync(fileService, root)) ?? root
  return isWithin(physicalPath, physicalRoot)
}

function physicalOrNull(realpath: (p: string) => string, path: string): string | null {
  try {
    return realpath(path)
  } catch {
    return null
  }
}

async function physicalOrNullAsync(
  fileService: FileSystemService,
  path: string,
): Promise<string | null> {
  try {
    return await fileService.realpath(path)
  } catch {
    return null
  }
}

function isWithin(path: string, root: string): boolean {
  if (path === root) return true
  const rel = relative(root, path)
  return rel !== '' && !rel.startsWith('..') && !isAbsolute(rel)
}
