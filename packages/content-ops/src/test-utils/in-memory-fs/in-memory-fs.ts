import type { Dirent, Stats } from 'fs'
import type { FileSystemService } from '../../file-system'
import { InMemoryFsState } from './in-memory-fs-state'
import { seedState } from './in-memory-fs-seed'
import * as read from './in-memory-fs-read'
import * as write from './in-memory-fs-write'

/**
 * In-memory FileSystemService test double. State lives in InMemoryFsState; the
 * behavior is implemented in the focused in-memory-fs-{read,write,seed} modules
 * and delegated to here so this class stays a thin, stable public surface.
 */
export class InMemoryFileSystemService implements FileSystemService {
  private readonly state: InMemoryFsState

  constructor(
    initial: Record<string, string> = {},
    moduleDirectory: string,
    workingDirectory: string,
  ) {
    this.state = new InMemoryFsState(moduleDirectory, workingDirectory)
    seedState(this.state, initial, moduleDirectory, workingDirectory)
  }

  accessSync() {}

  async readFile(path: string): Promise<string> {
    return read.readFileSync(this.state, path)
  }

  readFileSync(path: string): string {
    return read.readFileSync(this.state, path)
  }

  existsSync(path: string): boolean {
    return read.existsSync(this.state, path)
  }

  async exists(path: string): Promise<boolean> {
    return read.existsSync(this.state, path)
  }

  async stat(path: string): Promise<Stats> {
    return read.stat(this.state, path)
  }

  async readdir(path: string): Promise<Dirent[]> {
    return read.readdir(this.state, path)
  }

  getContent(path: string): string | undefined {
    return read.getContent(this.state, path)
  }

  async isFile(path: string): Promise<boolean> {
    return read.isFile(this.state, path)
  }

  async isFolder(path: string): Promise<boolean> {
    return read.isFolder(this.state, path)
  }

  async writeFile(path: string, content: string): Promise<void> {
    return write.writeFile(this.state, path, content)
  }

  async writeFileBinary(path: string, content: Buffer): Promise<void> {
    return write.writeFileBinary(this.state, path, content)
  }

  async chmod(path: string, mode: number): Promise<void> {
    return write.chmod(this.state, path, mode)
  }

  /** Permission bits recorded by `chmod`, so tests can assert an executable file */
  getMode(path: string): number | undefined {
    return read.getMode(this.state, path)
  }

  async unlink(path: string): Promise<void> {
    return write.unlink(this.state, path)
  }

  async mkdir(path: string, options?: { recursive?: boolean }): Promise<void> {
    write.mkdirImpl(this.state, path, options)
  }

  mkdirSync(path: string, options?: { recursive?: boolean }): void {
    write.mkdirImpl(this.state, path, options)
  }

  async rename(oldPath: string, newPath: string): Promise<void> {
    return write.rename(this.state, oldPath, newPath)
  }

  async copy(oldPath: string, newPath: string): Promise<void> {
    write.copyImpl(this.state, oldPath, newPath)
  }

  copySync(oldPath: string, newPath: string): void {
    write.copyImpl(this.state, oldPath, newPath)
  }

  async rm(path: string, options?: { recursive?: boolean; force?: boolean }): Promise<void> {
    return write.rm(this.state, path, options)
  }

  async symlink(target: string, path: string): Promise<void> {
    return write.symlink(this.state, target, path)
  }

  getSymlinks(): Map<string, string> {
    return new Map(this.state.symlinks)
  }

  rootModuleDirectory(): string {
    return this.state.moduleDirectory
  }

  currentWorkingDirectory(): string {
    return this.state.workingDirectory
  }

  resolve(...paths: string[]): string {
    return this.state.resolve(...paths)
  }

  chdir(path: string): void {
    write.chdir(this.state, path)
  }

  async createZip(sourcePaths: string[], outputPath: string): Promise<void> {
    return write.createZip(this.state, sourcePaths, outputPath)
  }

  async extractZip(zipPath: string, outputDir: string): Promise<void> {
    return write.extractZip(this.state, zipPath, outputDir)
  }
}

export default InMemoryFileSystemService
