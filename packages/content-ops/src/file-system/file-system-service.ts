import { constants, Dirent, promises as fs, Stats, copyFileSync, mkdirSync } from 'fs'
import { readFileSync, existsSync, accessSync } from 'fs'
import { dirname, resolve as pathResolve } from 'path'
import AdmZip from 'adm-zip'

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
  mkdirSync: (path: string, options?: { recursive?: boolean }) => void
  rename: (oldPath: string, newPath: string) => Promise<void>
  rm: (path: string, options?: { recursive?: boolean; force?: boolean }) => Promise<void>
  stat: (path: string) => Promise<Stats>
  copy: (oldPath: string, newPath: string) => Promise<void>
  copySync: (oldPath: string, newPath: string) => void
  rootModuleDirectory: () => string
  currentWorkingDirectory: () => string
  chdir: (path: string) => void
  resolve: (...paths: string[]) => string
  isFile: (path: string) => Promise<boolean>
  isFolder: (path: string) => Promise<boolean>
  createZip: (sourcePaths: string[], outputPath: string) => Promise<void>
  extractZip: (zipPath: string, outputDir: string) => Promise<void>
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
  mkdirSync: (path, options) => mkdirSync(path, options),
  rename: (oldPath, newPath) => fs.rename(oldPath, newPath),
  copy: (oldPath, newPath) => fs.copyFile(oldPath, newPath),
  copySync: (oldPath, newPath) => copyFileSync(oldPath, newPath),
  rm: async (path, options) => {
    await fs.rm(path, options)
  },
  stat: path => fs.stat(path),
  rootModuleDirectory: () => {
    // Return the directory of the main module, or fallback to cwd
    return typeof require !== 'undefined' && require.main?.path
      ? dirname(require.main.path)
      : process.cwd()
  },
  currentWorkingDirectory: () => process.cwd(),
  chdir: path => process.chdir(path),
  resolve: (...paths: string[]) => pathResolve(...paths),
  isFile: (path: string) => fs.stat(path).then(stats => stats.isFile()),
  isFolder: (path: string) => fs.stat(path).then(stats => stats.isDirectory()),
  createZip: async (sourcePaths: string[], outputPath: string) => {
    const zip = new AdmZip()
    for (const sourcePath of sourcePaths) {
      const stats = await fs.stat(sourcePath)
      if (stats.isDirectory()) {
        zip.addLocalFolder(sourcePath)
      } else {
        zip.addLocalFile(sourcePath)
      }
    }
    await new Promise<void>((resolve, reject) => {
      try {
        zip.writeZip(outputPath)
        resolve()
      } catch (error) {
        reject(error)
      }
    })
  },
  extractZip: async (zipPath: string, outputDir: string) => {
    const zip = new AdmZip(zipPath)
    await new Promise<void>((resolve, reject) => {
      try {
        zip.extractAllTo(outputDir, true)
        resolve()
      } catch (error) {
        reject(error)
      }
    })
  },
}
