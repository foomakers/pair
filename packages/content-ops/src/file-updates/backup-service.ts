import { FileSystemService } from '../file-system/file-system-service'
import { join, dirname } from 'path'

export interface BackupSession {
  id: string
  registries: string[]
  backupPaths: Map<string, string> // registryName -> backupPath
}

export interface RegistryConfig {
  [registryName: string]: string // e.g., { github: '.github', knowledge: '.pair/knowledge' }
}

export class BackupService {
  private session: BackupSession
  private fileService: FileSystemService

  constructor(fileService: FileSystemService) {
    this.fileService = fileService
    this.session = {
      id: this.generateSessionId(),
      registries: [],
      backupPaths: new Map(),
    }
  }

  /**
   * Creates backup for an entire asset registry
   * @param registryName - Name of the registry (e.g., 'github', 'knowledge')
   * @param registryPath - Path to registry (e.g., '.github', '.pair/knowledge', 'AGENTS.md')
   * @returns Path to the backup location
   */
  async createRegistryBackup(registryName: string, registryPath: string): Promise<string> {
    const backupPath = join('.pair/backups', this.session.id, registryPath)

    // Check if source is file or directory
    const isFile = await this.isFilePath(registryPath)

    if (isFile) {
      // Backup single file
      await this.backupFile(registryPath, backupPath)
    } else {
      // Backup entire directory
      await this.backupDirectory(registryPath, backupPath)
    }

    // Track this registry in session
    if (!this.session.registries.includes(registryName)) {
      this.session.registries.push(registryName)
    }
    this.session.backupPaths.set(registryName, backupPath)

    return backupPath
  }

  /**
   * Creates backups for all registries in config
   * @param config - Registry configuration mapping names to paths
   * @returns Map of registry names to their backup paths
   */
  async backupAllRegistries(config: RegistryConfig): Promise<Map<string, string>> {
    const backupPaths = new Map<string, string>()

    for (const [registryName, registryPath] of Object.entries(config)) {
      // Skip if path doesn't exist
      const exists = await this.fileService.exists(registryPath)
      if (!exists) continue

      const backupPath = await this.createRegistryBackup(registryName, registryPath)
      backupPaths.set(registryName, backupPath)
    }

    return backupPaths
  }

  /**
   * Restores a registry from its backup
   */
  async restoreRegistry(backupPath: string, originalPath: string): Promise<void> {
    const isFile = await this.isFilePath(backupPath)

    if (isFile) {
      await this.restoreFile(backupPath, originalPath)
    } else {
      await this.restoreDirectory(backupPath, originalPath)
    }
  }

  /**
   * Rolls back all registries in current session
   */
  /**
   * Restores all registries from backup and optionally re-throws original error
   * @param originalError - Optional error that triggered the rollback
   * @param keepBackup - If true, keeps backup files after restore (default: false)
   */
  async rollback(originalError?: Error, keepBackup = false): Promise<void> {
    for (const [, backupPath] of this.session.backupPaths.entries()) {
      // Find original path by removing backup prefix
      const originalPath = this.getOriginalPath(backupPath)
      await this.restoreRegistry(backupPath, originalPath)
    }

    // Optionally remove backups after successful restore
    if (!keepBackup) {
      await this.clearBackups(this.session.id)
    }

    // Re-throw original error after successful restore
    if (originalError) {
      throw originalError
    }
  }

  /**
   * Commits changes and removes backups
   */
  async commit(): Promise<void> {
    await this.clearBackups(this.session.id)
  }

  /**
   * Clears backups for a specific session
   */
  async clearBackups(sessionId: string): Promise<void> {
    const backupRoot = join('.pair/backups', sessionId)
    await this.fileService.rm(backupRoot, { recursive: true, force: true })
  }

  /**
   * Gets current session info
   */
  getCurrentSession(): BackupSession {
    return this.session
  }

  // Private helpers

  private generateSessionId(): string {
    const now = new Date()
    const date = now.toISOString().slice(0, 10).replace(/-/g, '')
    const time = now.toISOString().slice(11, 19).replace(/:/g, '')
    return `root-${date}-${time}`
  }

  private async isFilePath(path: string): Promise<boolean> {
    // Check for file extension, but exclude dotfiles/dotfolders (must have chars before the dot)
    // Matches: file.txt, test.md, but NOT .github, .pair
    if (/[^./]\.[a-z0-9]+$/i.test(path)) {
      return true
    }

    // Check if path exists as directory
    try {
      const exists = await this.fileService.exists(path)
      if (!exists) return true // Doesn't exist, treat as file

      const isFolder = await this.fileService.isFolder(path)
      return !isFolder
    } catch {
      return true // Error checking, default to file
    }
  }
  private async backupFile(sourcePath: string, backupPath: string): Promise<void> {
    const content = await this.fileService.readFile(sourcePath)
    await this.fileService.mkdir(dirname(backupPath), { recursive: true })
    await this.fileService.writeFile(backupPath, content)
  }

  private async backupDirectory(sourceDir: string, backupDir: string): Promise<void> {
    // Recursively copy all files
    await this.copyDirectoryRecursive(sourceDir, backupDir)
  }

  private async copyDirectoryRecursive(sourceDir: string, destDir: string): Promise<void> {
    await this.fileService.mkdir(destDir, { recursive: true })

    const entries = await this.fileService.readdir(sourceDir)

    for (const entry of entries) {
      const sourcePath = join(sourceDir, entry.name)
      const destPath = join(destDir, entry.name)

      if (entry.isDirectory()) {
        await this.copyDirectoryRecursive(sourcePath, destPath)
      } else {
        const content = await this.fileService.readFile(sourcePath)
        await this.fileService.writeFile(destPath, content)
      }
    }
  }

  private async restoreFile(backupPath: string, originalPath: string): Promise<void> {
    const content = await this.fileService.readFile(backupPath)
    await this.fileService.mkdir(dirname(originalPath), { recursive: true })
    await this.fileService.writeFile(originalPath, content)
  }

  private async restoreDirectory(backupDir: string, originalDir: string): Promise<void> {
    // Remove existing directory
    try {
      await this.fileService.rm(originalDir, { recursive: true, force: true })
    } catch {
      // Ignore if doesn't exist
    }

    // Copy backup to original location
    await this.copyDirectoryRecursive(backupDir, originalDir)
  }

  private getOriginalPath(backupPath: string): string {
    // Remove .pair/backups/root-{timestamp}/ prefix
    const prefix = join('.pair/backups', this.session.id)
    return backupPath.replace(prefix + '/', '')
  }
}
