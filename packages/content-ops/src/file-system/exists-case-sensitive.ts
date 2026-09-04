import { existsSync, readdirSync } from 'fs'
import { isAbsolute, join, normalize, parse, sep } from 'path'
import type { FileSystemService } from './file-system-service'

/**
 * Where a case-sensitive walk stopped.
 *
 * `missing` carries WHICH segment its parent does not list and WHAT that parent does
 * list, because the caller that has to explain the failure (the docs-site citation
 * gate) otherwise reports a whole 6-segment path as wrong when one segment is.
 */
export type CaseSensitiveWalk =
  | { readonly kind: 'resolved'; readonly path: string }
  | {
      readonly kind: 'missing'
      /** The first segment its parent directory does not list byte-for-byte. */
      readonly segment: string
      /** The directory that was listed, as an absolute path. */
      readonly parent: string
      /** That directory's entry names — EMPTY when it could not be listed at all. */
      readonly siblings: readonly string[]
      /**
       * The segments the walk actually traversed, after dot-segment removal — the
       * spelling a repaired path has to be rebuilt from.
       */
      readonly segments: readonly string[]
      /**
       * `segment`'s INDEX in `segments`, not its name. A path may repeat a segment
       * name (`apps/website/apps/x.md`), and a caller that re-finds the failure by
       * `indexOf` rewrites the FIRST occurrence — offering `app/website/apps/x.md`
       * for a walk that stopped on the THIRD segment, a path that resolves no better
       * than the one cited. The caller splices at this index instead.
       */
      readonly depth: number
    }

/**
 * The case-sensitive walk itself, as a coroutine: it yields each parent directory to
 * list and is resumed with that directory's entry names (or `undefined` when listing
 * threw). ONE rule, driven synchronously over `fs` by the docs-site gate and
 * asynchronously over a `FileSystemService` by the KB link gate — the two used to be
 * two copies of this loop in two packages, whose tests cannot see each other's
 * regressions.
 */
export function* caseSensitiveWalk(
  root: string,
  segments: readonly string[],
): Generator<string, CaseSensitiveWalk, readonly string[] | undefined> {
  let dir = root
  for (const [depth, segment] of segments.entries()) {
    const names = yield dir
    if (names === undefined || !names.includes(segment)) {
      return { kind: 'missing', segment, parent: dir, siblings: names ?? [], segments, depth }
    }
    dir = join(dir, segment)
  }
  return { kind: 'resolved', path: dir }
}

/**
 * The segments a path contributes to the walk, after RFC 3986 dot-segment removal —
 * which is what `normalize` does and what the reader's own client does before the
 * request is ever sent: `curl -v .../blob/main/.pair/knowledge/../knowledge/x.md`
 * puts `GET /foomakers/pair/blob/main/.pair/knowledge/x.md` on the wire (HTTP 200),
 * so collapsing is the faithful reading, not a convenience.
 *
 * A `..` that survives the collapse escapes the root, and stays a segment on purpose:
 * `readdir` never lists it, so the walk reports it missing. `blob/main/../../etc/passwd`
 * is `GET /foomakers/pair/etc/passwd` on the wire — HTTP 404, a dead citation, not a
 * file this repo serves.
 */
function walkSegments(path: string): string[] {
  return normalize(path)
    .split(sep === '/' ? '/' : /[/\\]/)
    .filter(s => s !== '' && s !== '.')
}

/**
 * Case-SENSITIVE existence check over `fs`, resolving `relPath` under `root`.
 *
 * `existsSync` inherits the filesystem's case rule: APFS (macOS default) finds
 * `docs/guide.md` when only `Docs/Guide.md` is on disk; ext4 on Linux CI and
 * github.com both say ENOENT / 404 for the same path. A citation spelled
 * `.pair/adoption/tech/ADR/adr-018-….md` therefore resolved on a developer's Mac
 * (local `docs:staleness` printed PASS) and 404'd for every reader.
 */
export function existsCaseSensitiveSync(root: string, relPath: string): boolean {
  return resolveCaseSensitiveSync(root, relPath).kind === 'resolved'
}

/** The same walk, keeping WHERE it stopped — the input to a "did you mean" diagnostic. */
export function resolveCaseSensitiveSync(root: string, relPath: string): CaseSensitiveWalk {
  const walk = caseSensitiveWalk(root, walkSegments(relPath))
  let step = walk.next()
  while (step.done !== true) {
    let names: string[] | undefined
    try {
      names = readdirSync(step.value)
    } catch {
      names = undefined // parent is missing or not a directory
    }
    step = walk.next(names)
  }
  if (step.value.kind === 'resolved' && !existsSync(step.value.path)) {
    // A dangling symlink: `readdir` listed every segment, `stat` refuses the end of the
    // walk. There is no ONE segment to blame and nothing to suggest, so the whole path
    // is the segment and the listing is empty.
    return {
      kind: 'missing',
      segment: relPath,
      parent: root,
      siblings: [],
      segments: [relPath],
      depth: 0,
    }
  }
  return step.value
}

/**
 * Case-SENSITIVE existence check over a `FileSystemService`, for an absolute path
 * (a relative one is anchored to the service's cwd). Same rule, same walk — see
 * `caseSensitiveWalk`.
 *
 * Symlinks: `readdir` lists a link by its own name, so an exact spelling through a
 * symlinked directory resolves; a dangling link is listed but fails the final
 * `exists`, matching `stat`'s ENOENT on it.
 */
export async function existsCaseSensitive(
  fileService: FileSystemService,
  path: string,
): Promise<boolean> {
  const resolved = isAbsolute(path) ? normalize(path) : fileService.resolve(path)
  const { root } = parse(resolved)
  const walk = caseSensitiveWalk(root, walkSegments(resolved.slice(root.length)))
  let step = walk.next()
  while (step.done !== true) {
    let names: string[] | undefined
    try {
      names = (await fileService.readdir(step.value)).map(entry => entry.name)
    } catch {
      names = undefined // parent is missing or not a directory
    }
    step = walk.next(names)
  }
  return step.value.kind === 'resolved' && (await fileService.exists(step.value.path))
}
