import type { Dirent } from 'fs'
import { dirname, resolve, isAbsolute } from 'path'

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
  moduleDirectory: string
  workingDirectory: string

  constructor(moduleDirectory: string, workingDirectory: string) {
    this.moduleDirectory = moduleDirectory
    this.workingDirectory = workingDirectory
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

  makeDirent(name: string, isDir: boolean): Dirent {
    return {
      name,
      isDirectory: () => isDir,
      isFile: () => !isDir,
      isBlockDevice: () => false,
      isCharacterDevice: () => false,
      isFIFO: () => false,
      isSocket: () => false,
      isSymbolicLink: () => false,
    } as Dirent
  }
}
