import type { Dirent, Stats } from 'fs'
import { dirname, resolve, isAbsolute } from 'path'
import type { FileSystemService } from '../file-system'

export class InMemoryFileSystemService implements FileSystemService {
  private files = new Map<string, string>()
  private dirs = new Set<string>()
  private moduleDirectory: string
  private workingDirectory: string

  constructor(
    initial: Record<string, string> = {},
    moduleDirectory: string,
    workingDirectory: string,
  ) {
    this.dirs.add('/')
    this.addParentDirectories(moduleDirectory)
    this.addParentDirectories(workingDirectory)
    this.addInitialFiles(initial)
    this.moduleDirectory = moduleDirectory
    this.workingDirectory = workingDirectory

    // Ensure moduleDirectory and workingDirectory exist
    this.dirs.add(moduleDirectory)
    this.dirs.add(workingDirectory)
  }

  private addParentDirectories(path: string): void {
    let p = dirname(path)
    while (p && p !== dirname(p)) {
      this.dirs.add(p)
      const next = dirname(p)
      if (next === p) break
      p = next
    }
  }

  private addInitialFiles(initial: Record<string, string>): void {
    for (const [path, content] of Object.entries(initial)) {
      this.files.set(path, content)
      this.addParentDirectories(path)
    }
  }

  private resolvePath(path: string): string {
    return isAbsolute(path) ? path : resolve(this.workingDirectory, path)
  }

  accessSync() {}

  async readFile(path: string): Promise<string> {
    return this.readFileSync(path)
  }

  readFileSync(path: string): string {
    const resolvedPath = this.resolvePath(path)
    const file = this.files.get(resolvedPath)
    if (!file) throw new Error(`File not found: ${path}`)
    return file
  }

  existsSync(path: string): boolean {
    const resolvedPath = this.resolvePath(path)
    return this.files.has(resolvedPath) || this.dirs.has(resolvedPath)
  }

  async writeFile(path: string, content: string): Promise<void> {
    const resolvedPath = this.resolvePath(path)
    this.files.set(resolvedPath, content)
    // Create all parent directories recursively
    let p = dirname(resolvedPath)
    while (p && p !== dirname(p)) {
      this.dirs.add(p)
      const next = dirname(p)
      if (next === p) break
      p = next
    }
  }

  async unlink(path: string): Promise<void> {
    const resolvedPath = this.resolvePath(path)
    if (!this.files.has(resolvedPath)) {
      throw new Error(`File not found: ${path}`)
    }
    this.files.delete(resolvedPath)
  }

  async exists(path: string): Promise<boolean> {
    return this.existsSync(path)
  }

  async mkdir(path: string, options?: { recursive?: boolean }): Promise<void> {
    const resolvedPath = this.resolvePath(path)
    this.dirs.add(resolvedPath)
    if (options?.recursive) {
      let p = resolvedPath
      while (p && p !== dirname(p)) {
        this.dirs.add(p)
        const next = dirname(p)
        if (next === p) break
        p = next
      }
    }
  }

  async rename(oldPath: string, newPath: string): Promise<void> {
    const resolvedOldPath = this.resolvePath(oldPath)
    const resolvedNewPath = this.resolvePath(newPath)

    // Check if source exists (either as file or directory)
    const sourceExists = this.files.has(resolvedOldPath) || this.dirs.has(resolvedOldPath)
    if (!sourceExists) {
      throw new Error(`Path not found: ${oldPath}`)
    }

    if (this.files.has(resolvedOldPath)) {
      const content = this.files.get(resolvedOldPath)!
      this.files.set(resolvedNewPath, content)
      this.files.delete(resolvedOldPath)
      this.dirs.add(dirname(resolvedNewPath))
      return
    }

    const oldPrefix = resolvedOldPath.endsWith('/') ? resolvedOldPath : resolvedOldPath + '/'
    const newPrefix = resolvedNewPath.endsWith('/') ? resolvedNewPath : resolvedNewPath + '/'

    const toMove: Array<[string, string]> = []
    for (const key of Array.from(this.files.keys())) {
      if (key === resolvedOldPath || key.startsWith(oldPrefix)) {
        const rel = key === resolvedOldPath ? '' : key.slice(oldPrefix.length)
        toMove.push([key, newPrefix + rel])
      }
    }
    toMove.forEach(([k, v]) => {
      const val = this.files.get(k)!
      this.files.set(v, val)
      this.files.delete(k)
      this.dirs.add(dirname(v))
    })

    const dirToMove = Array.from(this.dirs).filter(
      d => d === resolvedOldPath || d.startsWith(oldPrefix),
    )
    dirToMove.forEach(d => {
      const rel = d === resolvedOldPath ? '' : d.slice(oldPrefix.length)
      this.dirs.add(newPrefix + rel)
      this.dirs.delete(d)
    })
  }

  async copy(oldPath: string, newPath: string): Promise<void> {
    const resolvedOldPath = this.resolvePath(oldPath)
    const resolvedNewPath = this.resolvePath(newPath)
    if (!this.files.has(resolvedOldPath)) throw new Error(`File not found: ${oldPath}`)
    const content = this.files.get(resolvedOldPath)!
    this.files.set(resolvedNewPath, content)
    this.dirs.add(dirname(resolvedNewPath))
  }

  async rm(path: string, options?: { recursive?: boolean; force?: boolean }): Promise<void> {
    const resolvedPath = this.resolvePath(path)
    const prefix = resolvedPath.endsWith('/') ? resolvedPath : resolvedPath + '/'

    const deleteRecursive = () => {
      for (const key of Array.from(this.files.keys())) {
        if (key === resolvedPath || key.startsWith(prefix)) this.files.delete(key)
      }
      for (const d of Array.from(this.dirs)) {
        if (d === resolvedPath || d.startsWith(prefix)) this.dirs.delete(d)
      }
      this.dirs.delete(resolvedPath)
      this.files.delete(resolvedPath)
    }

    const deleteNonRecursive = () => {
      if (this.files.has(resolvedPath)) {
        this.files.delete(resolvedPath)
        return
      }
      if (this.dirs.has(resolvedPath)) {
        const hasChildren =
          Array.from(this.files.keys()).some(k => dirname(k) === resolvedPath) ||
          Array.from(this.dirs).some(d => dirname(d) === resolvedPath && d !== resolvedPath)
        if (hasChildren) {
          throw new Error(`Directory not empty: ${path}`)
        }
        this.dirs.delete(resolvedPath)
        return
      }
      if (!options?.force) throw new Error(`Path not found: ${path}`)
    }

    if (options?.recursive) {
      deleteRecursive()
      return
    }

    deleteNonRecursive()
  }

  async stat(path: string): Promise<Stats> {
    const resolvedPath = this.resolvePath(path)
    if (this.dirs.has(resolvedPath)) {
      return { isDirectory: () => true, isFile: () => false } as unknown as Stats
    }
    if (this.files.has(resolvedPath)) {
      return { isDirectory: () => false, isFile: () => true } as unknown as Stats
    }
    throw new Error(`no such file or directory '${path}'`)
  }

  async readdir(path: string): Promise<Dirent[]> {
    const resolvedPath = this.resolvePath(path)
    // Check if directory exists
    if (!this.dirs.has(resolvedPath)) {
      throw new Error(`no such file or directory '${path}'`)
    }

    const entries: Dirent[] = []
    for (const d of this.dirs) {
      if (d === resolvedPath) continue
      if (dirname(d) === resolvedPath) {
        const name = d.replace(`${resolvedPath}/`, '')
        entries.push(this.makeDirent(name, true))
      }
    }

    for (const filePath of this.files.keys()) {
      if (dirname(filePath) === resolvedPath) {
        const name = filePath.replace(`${resolvedPath}/`, '')
        entries.push(this.makeDirent(name, false))
      }
    }

    return entries
  }

  rootModuleDirectory() {
    return this.moduleDirectory
  }
  currentWorkingDirectory() {
    return this.workingDirectory
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

  // Change the working directory used by the in-memory service. Tests can
  // call this instead of using process.chdir so filesystem-relative
  // operations remain scoped to the service.
  chdir(path: string) {
    this.workingDirectory = path
    // Ensure parent directories exist in the in-memory view
    this.addParentDirectories(path)
    this.dirs.add(path)
  }

  private makeDirent(name: string, isDir: boolean): Dirent {
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

  getContent(path: string) {
    const resolvedPath = this.resolvePath(path)
    return this.files.get(resolvedPath)
  }
}

export default InMemoryFileSystemService
