import type { Dirent, Stats } from 'fs'
import { dirname } from 'path'
import type { FileSystemService } from '../file-system'

export class InMemoryFileSystemService implements FileSystemService {
  private files = new Map<string, string>()
  private dirs = new Set<string>()

  constructor(initial: Record<string, string> = {}) {
    this.dirs.add('/')
    for (const [path, content] of Object.entries(initial)) {
      this.files.set(path, content)
      // Add all parent directories recursively
      let p = dirname(path)
      while (p && p !== dirname(p)) {
        this.dirs.add(p)
        const next = dirname(p)
        if (next === p) break
        p = next
      }
    }
  }

  accessSync() {}

  async readFile(path: string): Promise<string> {
    return this.readFileSync(path)
  }

  readFileSync(path: string): string {
    const file = this.files.get(path)
    if (!file) throw new Error(`File not found: ${path}`)
    return file
  }

  existsSync(path: string): boolean {
    return this.files.has(path) || this.dirs.has(path)
  }

  async writeFile(path: string, content: string): Promise<void> {
    this.files.set(path, content)
    this.dirs.add(dirname(path))
  }

  async unlink(path: string): Promise<void> {
    this.files.delete(path)
  }

  async exists(path: string): Promise<boolean> {
    return this.existsSync(path)
  }

  async mkdir(path: string, options?: { recursive?: boolean }): Promise<void> {
    this.dirs.add(path)
    if (options?.recursive) {
      let p = path
      while (p && p !== dirname(p)) {
        this.dirs.add(p)
        const next = dirname(p)
        if (next === p) break
        p = next
      }
    }
  }

  async rename(oldPath: string, newPath: string): Promise<void> {
    if (this.files.has(oldPath)) {
      const content = this.files.get(oldPath)!
      this.files.set(newPath, content)
      this.files.delete(oldPath)
      this.dirs.add(dirname(newPath))
      return
    }

    const oldPrefix = oldPath.endsWith('/') ? oldPath : oldPath + '/'
    const newPrefix = newPath.endsWith('/') ? newPath : newPath + '/'

    const toMove: Array<[string, string]> = []
    for (const key of Array.from(this.files.keys())) {
      if (key === oldPath || key.startsWith(oldPrefix)) {
        const rel = key === oldPath ? '' : key.slice(oldPrefix.length)
        toMove.push([key, newPrefix + rel])
      }
    }
    toMove.forEach(([k, v]) => {
      const val = this.files.get(k)!
      this.files.set(v, val)
      this.files.delete(k)
      this.dirs.add(dirname(v))
    })

    const dirToMove = Array.from(this.dirs).filter(d => d === oldPath || d.startsWith(oldPrefix))
    dirToMove.forEach(d => {
      const rel = d === oldPath ? '' : d.slice(oldPrefix.length)
      this.dirs.add(newPrefix + rel)
      this.dirs.delete(d)
    })
  }

  async copy(oldPath: string, newPath: string): Promise<void> {
    if (!this.files.has(oldPath)) throw new Error(`File not found: ${oldPath}`)
    const content = this.files.get(oldPath)!
    this.files.set(newPath, content)
    this.dirs.add(dirname(newPath))
  }

  async rm(path: string, options?: { recursive?: boolean; force?: boolean }): Promise<void> {
    const prefix = path.endsWith('/') ? path : path + '/'

    const deleteRecursive = () => {
      for (const key of Array.from(this.files.keys())) {
        if (key === path || key.startsWith(prefix)) this.files.delete(key)
      }
      for (const d of Array.from(this.dirs)) {
        if (d === path || d.startsWith(prefix)) this.dirs.delete(d)
      }
      this.dirs.delete(path)
      this.files.delete(path)
    }

    const deleteNonRecursive = () => {
      if (this.files.has(path)) {
        this.files.delete(path)
        return
      }
      if (this.dirs.has(path)) {
        const hasChildren =
          Array.from(this.files.keys()).some(k => dirname(k) === path) ||
          Array.from(this.dirs).some(d => dirname(d) === path)
        if (!hasChildren) this.dirs.delete(path)
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
    if (this.dirs.has(path)) {
      return { isDirectory: () => true, isFile: () => false } as unknown as Stats
    }
    if (this.files.has(path)) {
      return { isDirectory: () => false, isFile: () => true } as unknown as Stats
    }
    throw new Error(`no such file or directory '${path}'`)
  }

  async readdir(path: string): Promise<Dirent[]> {
    // Check if directory exists
    if (!this.dirs.has(path)) {
      throw new Error(`no such file or directory '${path}'`)
    }

    const entries: Dirent[] = []
    for (const d of this.dirs) {
      if (d === path) continue
      if (dirname(d) === path) {
        const name = d.replace(`${path}/`, '')
        entries.push(this.makeDirent(name, true))
      }
    }

    for (const filePath of this.files.keys()) {
      if (dirname(filePath) === path) {
        const name = filePath.replace(`${path}/`, '')
        entries.push(this.makeDirent(name, false))
      }
    }

    return entries
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
    return this.files.get(path)
  }
}

export default InMemoryFileSystemService
