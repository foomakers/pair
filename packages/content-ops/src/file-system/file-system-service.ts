import { constants, Dirent, promises as fs, Stats } from 'fs'
import { readFileSync, existsSync, accessSync } from 'fs'

// File system service interface
export interface FileSystemService {
  accessSync: (path: string) => void
  readdir: (path: string) => Promise<Dirent[]>
  readFile: (file: string) => Promise<string>
  readFileSync: (file: string) => string
  existsSync: (file: string) => boolean
  writeFile: (file: string, content: string) => Promise<void>
  exists: (path: string) => Promise<boolean>
  unlink: (path: string) => Promise<void>
  mkdir: (path: string, options?: { recursive?: boolean }) => Promise<void>
  rename: (oldPath: string, newPath: string) => Promise<void>
  rm: (path: string, options?: { recursive?: boolean; force?: boolean }) => Promise<void>
  stat: (path: string) => Promise<Stats>
  copy: (oldPath: string, newPath: string) => Promise<void>
  currentModuleDirectory: () => string
  currentWorkingDirectory: () => string
  chdir: (path: string) => void
}

/**
 * Default file system service implementation using Node.js fs
 */
export const fileSystemService: FileSystemService = {
  accessSync: path => accessSync(path, constants.R_OK),
  readdir: path => fs.readdir(path, { withFileTypes: true }),
  readFile: file => fs.readFile(file, 'utf-8'),
  existsSync: file => existsSync(file),
  readFileSync: file => readFileSync(file, 'utf-8'),
  writeFile: (file, content) => fs.writeFile(file, content, 'utf-8'),
  exists: async path => {
    try {
      await fs.stat(path)
      return true
    } catch {
      return false
    }
  },
  unlink: path => fs.unlink(path),
  mkdir: async (path, options) => {
    await fs.mkdir(path, options)
  },
  rename: (oldPath, newPath) => fs.rename(oldPath, newPath),
  copy: (oldPath, newPath) => fs.copyFile(oldPath, newPath),
  rm: async (path, options) => {
    await fs.rm(path, options)
  },
  stat: path => fs.stat(path),
  currentModuleDirectory: () => __dirname,
  currentWorkingDirectory: () => process.cwd(),
  chdir: path => process.chdir(path),
}
