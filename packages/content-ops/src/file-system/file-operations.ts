import { join, relative, dirname } from 'path'
import { FileSystemService } from './file-system-service'
import { Behavior, normalizeKey, resolveBehavior } from '../ops/behavior'
import { logger } from '../observability'

export async function copyFileHelper(
  fileService: FileSystemService,
  oldPath: string,
  newPath: string,
  behavior: Behavior = 'overwrite',
): Promise<void> {
  return logger.time(async () => {
    // For 'add' behavior, check if destination already exists
    if (behavior === 'add') {
      try {
        await fileService.stat(newPath)
        // File already exists, skip
        return
      } catch {
        // File doesn't exist, proceed with copy
      }
    }

    const content = await fileService.readFile(oldPath)
    await fileService.mkdir(dirname(newPath), { recursive: true })
    await fileService.writeFile(newPath, content)
  }, 'copyFileHelper')
}

export type CopyDirContext = {
  fileService: FileSystemService
  oldDir: string
  newDir: string
  folderBehavior?: Record<string, Behavior>
  defaultBehavior: Behavior
  datasetRoot: string
}

export async function copyDirHelper(context: CopyDirContext): Promise<void> {
  const { fileService, oldDir, newDir, folderBehavior, defaultBehavior, datasetRoot } = context

  return logger.time(async () => {
    await fileService.mkdir(newDir, { recursive: true })
    const entries = await fileService.readdir(oldDir)
    for (const entry of entries) {
      const oldEntry = join(oldDir, entry.name)
      const newEntry = join(newDir, entry.name)

      // Determine behavior for this entry
      const relPath = datasetRoot ? normalizeKey(relative(datasetRoot, oldEntry)) : entry.name
      const entryBehavior = resolveBehavior(relPath, folderBehavior, defaultBehavior)

      // Skip if behavior is 'skip'
      if (entryBehavior === 'skip') {
        continue
      }

      // For 'add' behavior, check if destination already exists
      if (entryBehavior === 'add') {
        try {
          await fileService.stat(newEntry)
          // File/directory already exists, skip
          continue
        } catch {
          // File/directory doesn't exist, proceed with copy
        }
      }

      if (entry.isDirectory()) {
        const recursiveContext: CopyDirContext = {
          fileService,
          oldDir: oldEntry,
          newDir: newEntry,
          defaultBehavior,
          datasetRoot,
        }
        if (folderBehavior) {
          recursiveContext.folderBehavior = folderBehavior
        }
        await copyDirHelper(recursiveContext)
      } else {
        await copyFileHelper(fileService, oldEntry, newEntry, entryBehavior)
      }
    }
  }, 'copyDirHelper')
}
