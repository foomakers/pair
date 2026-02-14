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
    // Set directories first so resolvePath works
    this.moduleDirectory = moduleDirectory
    this.workingDirectory = workingDirectory

    this.dirs.add('/')
    this.addParentDirectories(moduleDirectory)
    this.addParentDirectories(workingDirectory)
    this.addInitialFiles(initial)

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
      const resolvedPath = this.resolvePath(path)
      this.files.set(resolvedPath, content)
      this.addParentDirectories(resolvedPath)
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

  mkdirSync(path: string, options?: { recursive?: boolean }): void {
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
    if (this.dirs.has(resolvedOldPath)) {
      // copy directory recursively
      this.dirs.add(resolvedNewPath)
      const prefix = resolvedOldPath.endsWith('/') ? resolvedOldPath : resolvedOldPath + '/'
      for (const key of this.files.keys()) {
        if (key.startsWith(prefix)) {
          const relative = key.slice(prefix.length)
          const newKey = this.resolve(resolvedNewPath, relative)
          this.files.set(newKey, this.files.get(key)!)
          this.addParentDirectories(newKey)
        }
      }
    } else if (this.files.has(resolvedOldPath)) {
      const content = this.files.get(resolvedOldPath)!
      this.files.set(resolvedNewPath, content)
      this.addParentDirectories(resolvedNewPath)
    } else {
      throw new Error(`Path not found: ${oldPath}`)
    }
  }

  copySync(oldPath: string, newPath: string): void {
    // For simplicity, make it sync by not awaiting
    const resolvedOldPath = this.resolvePath(oldPath)
    const resolvedNewPath = this.resolvePath(newPath)
    if (this.dirs.has(resolvedOldPath)) {
      // copy directory recursively
      this.dirs.add(resolvedNewPath)
      const prefix = resolvedOldPath.endsWith('/') ? resolvedOldPath : resolvedOldPath + '/'
      for (const key of this.files.keys()) {
        if (key.startsWith(prefix)) {
          const relative = key.slice(prefix.length)
          const newKey = this.resolve(resolvedNewPath, relative)
          this.files.set(newKey, this.files.get(key)!)
          this.addParentDirectories(newKey)
        }
      }
    } else if (this.files.has(resolvedOldPath)) {
      const content = this.files.get(resolvedOldPath)!
      this.files.set(resolvedNewPath, content)
      this.addParentDirectories(resolvedNewPath)
    } else {
      throw new Error(`Path not found: ${oldPath}`)
    }
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
      return { isDirectory: () => true, isFile: () => false } as Stats
    }
    if (this.files.has(resolvedPath)) {
      return { isDirectory: () => false, isFile: () => true } as Stats
    }
    throw new Error(`no such file or directory '${path}'`)
  }

  async readdir(path: string): Promise<Dirent[]> {
    const resolvedPath = this.resolvePath(path)
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

  private symlinks = new Map<string, string>()

  async symlink(target: string, path: string): Promise<void> {
    const resolvedPath = this.resolvePath(path)
    // Resolve relative targets from the symlink's parent directory (matching OS behavior)
    const resolvedTarget = isAbsolute(target)
      ? this.resolvePath(target)
      : resolve(dirname(resolvedPath), target)
    if (this.symlinks.has(resolvedPath) || this.files.has(resolvedPath)) {
      throw new Error(`Path already exists: ${path}`)
    }
    this.symlinks.set(resolvedPath, resolvedTarget)
    this.addParentDirectories(resolvedPath)
  }

  getSymlinks(): Map<string, string> {
    return new Map(this.symlinks)
  }

  getContent(path: string) {
    const resolvedPath = this.resolvePath(path)
    return this.files.get(resolvedPath)
  }
  async isFile(path: string) {
    return this.stat(path).then(stats => stats.isFile())
  }
  async isFolder(path: string) {
    try {
      const isFileResult = await this.isFile(path)
      return !isFileResult
    } catch {
      return false
    }
  }

  async createZip(sourcePaths: string[], outputPath: string): Promise<void> {
    const resolvedOutputPath = this.resolvePath(outputPath)
    const zipContent: Record<string, string> = {}

    for (const sourcePath of sourcePaths) {
      const resolvedSourcePath = this.resolvePath(sourcePath)

      // Check if source is file or directory
      if (this.files.has(resolvedSourcePath)) {
        // Single file - add to zip root
        const fileName = resolvedSourcePath.split('/').pop() || 'file'
        zipContent[fileName] = this.files.get(resolvedSourcePath)!
      } else if (this.dirs.has(resolvedSourcePath)) {
        // Directory - add all files recursively
        for (const [filePath, content] of this.files.entries()) {
          if (filePath.startsWith(resolvedSourcePath + '/')) {
            // Relative path within zip
            const relativePath = filePath.substring(resolvedSourcePath.length + 1)
            zipContent[relativePath] = content
          }
        }
      }
    }

    // Serialize zip content as JSON (simple in-memory representation)
    const zipData = JSON.stringify(zipContent)
    this.files.set(resolvedOutputPath, zipData)
    this.addParentDirectories(resolvedOutputPath)
  }

  async extractZip(zipPath: string, outputDir: string): Promise<void> {
    const resolvedZipPath = this.resolvePath(zipPath)
    const resolvedOutputDir = this.resolvePath(outputDir)

    const zipData = this.files.get(resolvedZipPath)
    if (!zipData) {
      throw new Error(`ZIP file not found: ${zipPath}`)
    }

    // Deserialize zip content
    const zipContent = JSON.parse(zipData) as Record<string, string>

    // Extract all files
    for (const [relativePath, content] of Object.entries(zipContent)) {
      const outputPath = resolve(resolvedOutputDir, relativePath)
      this.files.set(outputPath, content)
      this.addParentDirectories(outputPath)
    }

    // Ensure output directory exists
    this.dirs.add(resolvedOutputDir)
  }
}

export default InMemoryFileSystemService
