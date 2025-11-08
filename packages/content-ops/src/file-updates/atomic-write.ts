import { FileSystemService } from '../file-system/file-system-service'
import { dirname } from 'path'

export interface AtomicWriterOptions {
  dryRun?: boolean
}

export class AtomicWriter {
  private fileService: FileSystemService
  private options: AtomicWriterOptions

  constructor(fileService: FileSystemService, options: AtomicWriterOptions = {}) {
    this.fileService = fileService
    this.options = options
  }

  /**
   * Writes file atomically using temp-file-then-rename pattern
   * @param filePath - Target file path
   * @param content - File content to write
   */
  async writeFileAtomic(filePath: string, content: string): Promise<void> {
    // Skip in dry-run mode
    if (this.options.dryRun) {
      return
    }

    const tempPath = `${filePath}.tmp-${Date.now()}`

    try {
      // Create parent directories
      await this.fileService.mkdir(dirname(filePath), { recursive: true })

      // Write to temp file
      await this.fileService.writeFile(tempPath, content)

      // Atomic rename
      await this.fileService.rename(tempPath, filePath)
    } catch (error) {
      // Clean up temp file on error
      try {
        await this.fileService.unlink(tempPath)
      } catch {
        // Ignore cleanup errors
      }
      throw error
    }
  }
}
