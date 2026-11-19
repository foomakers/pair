import type { Dirent } from 'fs'
import { dirname, resolve, isAbsolute } from 'path'

export type DirentKind = 'file' | 'dir' | 'symlink'

/**
 * Mutable in-memory filesystem state shared by the read/write/seed operation
 * modules. Holds the file/dir/symlink maps plus the low-level path primitives
 * every operation needs. Extracted from InMemoryFileSystemService so the
 * behavior can be split across focused modules without duplicating state.
 */
export class InMemoryFsState {
  readonly files = new Map<string, string>()
  readonly dirs = new Set<string>()
  readonly symlinks = new Map<string, string>()
  /** Permission bits set through `chmod`; absent means "default mode" */
  readonly modes = new Map<string, number>()
  /** Paths whose content was written as binary (stored latin1); every other file is UTF-8 text */
  readonly binary = new Set<string>()
  moduleDirectory: string
  workingDirectory: string

  constructor(moduleDirectory: string, workingDirectory: string) {
    this.moduleDirectory = moduleDirectory
    this.workingDirectory = workingDirectory
  }

  /** Carry the binary flag from `from` (a file or a directory prefix) to `to`; `keep` leaves the source flagged */
  moveBinary(from: string, to: string, keep = false): void {
    const prefix = from.endsWith('/') ? from : `${from}/`
    for (const p of Array.from(this.binary)) {
      if (p !== from && !p.startsWith(prefix)) continue
      this.binary.add(to + p.slice(from.length))
      if (!keep) this.binary.delete(p)
    }
  }

  forgetBinary(path: string): void {
    const prefix = path.endsWith('/') ? path : `${path}/`
    for (const p of Array.from(this.binary)) {
      if (p === path || p.startsWith(prefix)) this.binary.delete(p)
    }
  }

  resolvePath(path: string): string {
    return isAbsolute(path) ? path : resolve(this.workingDirectory, path)
  }

  addParentDirectories(path: string): void {
    let p = dirname(path)
    while (p && p !== dirname(p)) {
      this.dirs.add(p)
      const next = dirname(p)
      if (next === p) break
      p = next
    }
  }

  // Resolve paths relative to the in-memory working directory. This mirrors
  // path.resolve semantics but anchored to the service's workingDirectory so
  // tests can control how relative paths are interpreted.
  resolve(...paths: string[]): string {
    const firstPath = paths[0]
    if (firstPath && isAbsolute(firstPath)) {
      return resolve(...paths)
    }
    return resolve(this.workingDirectory, ...paths)
  }

  /**
   * A Dirent as the real one reports itself. A symlink is `isSymbolicLink()` and
   * NEITHER `isFile()` nor `isDirectory()` — `fs.readdir` does not follow the link to
   * classify it, which is exactly why an unguarded escaping link falls through to a
   * caller's file branch (US-396).
   */
  makeDirent(name: string, kind: DirentKind): Dirent {
    return {
      name,
      isDirectory: () => kind === 'dir',
      isFile: () => kind === 'file',
      isBlockDevice: () => false,
      isCharacterDevice: () => false,
      isFIFO: () => false,
      isSocket: () => false,
      isSymbolicLink: () => kind === 'symlink',
    } as Dirent
  }
}
