/**
 * Source-layout invariants checked BEFORE a transformed copy writes anything.
 *
 * Separate from `copy-directory-transforms.ts` on purpose: these are pure shape
 * analysis over the flat file list (no file system, no state shared with the copy
 * path) and they change for a different reason — registry layout rules, not copy
 * mechanics (#411 review).
 *
 * All three throw the ops layer's typed `IO_ERROR` and are called before the
 * first file is copied, so a rejected layout leaves no half-install.
 */
import { join, dirname } from 'path/posix'
import { createError } from '../../observability'
import { transformPath, detectCollisions } from '../naming-transforms'
import type { TransformOpts } from './copy-types'

/**
 * Collects unique subdirectory names from a file list, validates no
 * flatten collisions exist, and throws if any are found.
 */
export function validateNoCollisions(
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
export function collectDirShapes(files: string[]): {
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
 * Rejects source shapes a bounded flatten cannot represent on the SHALLOW side:
 * a directory shallower than `flattenDepth` that holds files directly AND owns a
 * sub-directory (#407 review).
 *
 * `flattenDepth` is a positional statement about the source layout — "an entry is
 * N segments deep" (ADR-020). A directory holding files at a shallower depth
 * breaks it: in `.skills/` today `next/` is a ONE-segment entry while
 * `process/review/` is two, so `next/references` — content of `next` — has the
 * same shape as the entry `process/review`. It would install as the sibling
 * `pair-next-references/`, reintroducing for `next` all four defects this option
 * removes for a two-segment entry: misplacement outside the skill, a dead
 * `./references/…` forward link, a bogus `references` skill-name mapping that
 * leaks into unrelated files, and a path written as the sub-doc's `name:`.
 *
 * The rule is deliberately BROADER than the case that motivated it, and the
 * broader form is the documented one (ADR-020 Trade-offs,
 * `nested-sub-documents.md`): a CATEGORY directory with a file of its own (a
 * `process/README.md` beside `process/review/`) is rejected too. A category
 * directory (only sub-directories) and an entry (files of its own) are told apart
 * by whether the directory holds files DIRECTLY — no `SKILL.md` knowledge, per
 * ADR-020's coupling argument — so a category that holds a file is
 * indistinguishable from an entry with a sub-directory. The remediation names
 * both ways out. Files at the source ROOT are exempt: they are copied straight to
 * the destination root and are never entries.
 *
 * The shape is unrepresentable, not merely unhandled, so it fails loudly here —
 * before any file is copied — rather than being guessed at.
 */
export function validateNoShallowEntryWithSubdir(
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
    const childDepth = child.split('/').length
    throw createError({
      type: 'IO_ERROR',
      message:
        `Ambiguous layout for a bounded flatten (flattenDepth=${flattenDepth}): '${dir}' is ${depth} segment(s) deep, ` +
        `holds files directly AND owns the sub-directory '${child}'. '${child}' is ${childDepth} segment(s) deep, so it cannot be told apart ` +
        `from a real entry and would install as a sibling entry instead of inside '${dir}'. ` +
        `Move '${dir}' ${flattenDepth - depth} level(s) deeper (e.g. under a category directory), ` +
        `or move/remove the file(s) held directly by '${dir}' (a category directory must hold sub-directories only), ` +
        `or drop the sub-directory.`,
      operation: 'copyDir',
      path: join(srcPath, dir),
    })
  }
}

/**
 * The DEEPER half of the same layout mismatch, and the reason it needs its own
 * rule: `validateNoShallowEntryWithSubdir` above rejects an entry SHALLOWER than
 * `flattenDepth`. An entry DEEPER than it is equally unrepresentable and was
 * silently mis-installed — a regression introduced by the bounded flatten itself.
 *
 * `capability/sub/foo/SKILL.md` (three segments, `flattenDepth` 2) installed at
 * `pair-capability-sub/foo/SKILL.md`: a pseudo-entry directory with NO `SKILL.md`
 * at its root, so the skill loader never sees the skill. Two further defects
 * followed silently, because `isRegistryEntryPath` reports false for it: the
 * frontmatter `name:` was left unsynced, and no entry reached `skillNameMap`, so
 * a `/foo` reference in an unrelated skill stayed dangling. Before the bounded
 * flatten the same source produced a perfectly usable `pair-capability-sub-foo/`.
 *
 * Telling a too-deep ENTRY from legitimate CONTENT uses the shape data already
 * collected, with no `SKILL.md` knowledge (ADR-020's coupling argument): a
 * directory deeper than `flattenDepth` that holds files directly is content **iff**
 * its nearest ancestor at depth <= `flattenDepth` also holds files directly — that
 * ancestor is the entry the content belongs to. `process/review/references` passes
 * (its depth-2 ancestor `process/review` holds files); `capability/sub/foo` fails
 * (`capability/sub` holds none, so nothing owns it).
 *
 * What this CANNOT see: an entrypoint file placed inside legitimate content (a
 * `process/review/references/SKILL.md`) is correctly-shaped content here, and
 * recognising it would need the marker-file knowledge this layer refuses. That
 * one is caught statically over the dataset corpus by the skills conformance
 * gate instead (`skills:conformance`). A project whose own `config.json` declares a bounded
 * registry has no such gate — `skills:conformance` is corpus-specific to this
 * repository, not part of the published package — so the error message QUALIFIES
 * its second way out ("give the ancestor
 * files of its own"): that remedy silences this rule by turning the offender
 * into content, which is right for a marker-less registry and wrong for one
 * whose entries carry an entrypoint file — say so rather than advise it flatly
 * (round-5 review of PR #411).
 */
export function validateNoDeepEntry(
  files: string[],
  transformOpts: TransformOpts,
  srcPath: string,
): void {
  const { flattenDepth } = transformOpts
  if (!transformOpts.flatten || flattenDepth === undefined || flattenDepth < 1) return

  const { dirsWithOwnFiles } = collectDirShapes(files)

  for (const dir of dirsWithOwnFiles) {
    const segments = dir.split('/')
    if (segments.length <= flattenDepth) continue
    const ancestor = segments.slice(0, flattenDepth).join('/')
    if (dirsWithOwnFiles.has(ancestor)) continue // content of a real entry
    throw createError({
      type: 'IO_ERROR',
      message:
        `Ambiguous layout for a bounded flatten (flattenDepth=${flattenDepth}): '${dir}' is ` +
        `${segments.length} segment(s) deep and holds files directly, but its ancestor at depth ` +
        `${flattenDepth} ('${ancestor}') holds none — so nothing owns it as content and it is an ` +
        `entry too deep. It would install at a path with no entry root, invisible to the skill ` +
        `loader, with an unsynced frontmatter name and no skill-name mapping. ` +
        `Move it to depth ${flattenDepth}, or give '${ancestor}' files of its own IF '${dir}' is ` +
        `meant to be CONTENT of it — note that an entrypoint file inside content installs as ` +
        `content, not as an entry, i.e. with exactly the symptoms above.`,
      operation: 'copyDir',
      path: join(srcPath, dir),
    })
  }
}
