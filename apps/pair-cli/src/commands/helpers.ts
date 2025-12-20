import { detectSourceType, SourceType, type FileSystemService } from '@pair/content-ops'

interface CommandOptions {
  source?: string
  offline?: boolean
}

/**
 * Validate command options for consistency
 */
export function validateCommandOptions(_command: string, options: CommandOptions): void {
  const { source, offline } = options

  // Validate source not empty
  if (source !== undefined && source === '') {
    throw new Error('Source path/URL cannot be empty')
  }

  // Validate offline mode requirements
  if (offline) {
    if (!source) {
      throw new Error('Offline mode requires explicit --source with local path')
    }
    const sourceType = detectSourceType(source)
    if (sourceType === SourceType.REMOTE_URL) {
      throw new Error('Cannot use --offline with remote URL source')
    }
  }
}

/**
 * Check if current execution is within the pair monorepo
 */
export function isInPairMonorepo(fsService: FileSystemService): boolean {
  const cwd = fsService.currentWorkingDirectory()
  const knowledgeHubPackageJson = fsService.resolve(cwd, 'packages/knowledge-hub/package.json')
  return fsService.existsSync(knowledgeHubPackageJson)
}

/**
 * Get knowledge hub dataset path (only valid in monorepo context)
 */
export function getKnowledgeHubDatasetPath(fsService: FileSystemService): string {
  const moduleDir = fsService.rootModuleDirectory()
  return fsService.resolve(moduleDir, '../knowledge-hub/dataset')
}
