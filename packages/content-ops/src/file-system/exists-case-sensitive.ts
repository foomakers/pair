import { isAbsolute, join, normalize, parse, sep } from 'path'
import { FileSystemService } from './file-system-service'

/**
 * Case-SENSITIVE existence check, whatever the volume's own rule.
 *
 * `exists` is `fs.stat`, and `fs.stat` inherits the filesystem's case rule: APFS
 * (macOS default) finds `docs/guide.md` when only `Docs/Guide.md` is on disk; ext4
 * on Linux CI and github.com both say ENOENT / 404 for the same path. A link gate
 * built on `exists` therefore printed PASS on a developer's Mac and 404'd for every
 * reader — the same local-PASS / CI-FAIL asymmetry `apps/website`'s Check 5b closes
 * for docs-site citations. Each segment is compared byte-for-byte against its
 * parent directory's listing, so the answer is the one GitHub gives on every OS.
 *
 * Symlinks: `readdir` lists a link by its own name, so an exact spelling through a
 * symlinked directory resolves; a dangling link is listed but fails the final
 * `exists`, matching `stat`'s ENOENT on it.
 */
export async function existsCaseSensitive(
  fileService: FileSystemService,
  path: string,
): Promise<boolean> {
  // Callers pass absolute paths; a relative one is anchored to the service's cwd.
  const resolved = isAbsolute(path) ? normalize(path) : fileService.resolve(path)
  const { root } = parse(resolved)
  const segments = resolved.slice(root.length).split(sep).filter(Boolean)

  let dir = root
  for (const segment of segments) {
    let names: string[]
    try {
      names = (await fileService.readdir(dir)).map(entry => entry.name)
    } catch {
      return false // parent is missing or not a directory
    }
    if (!names.includes(segment)) return false
    dir = join(dir, segment)
  }
  return fileService.exists(dir)
}
