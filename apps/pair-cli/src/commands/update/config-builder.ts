import type { FileSystemService } from '@pair/content-ops'
import type { UpdateCommandConfig } from './parser'
import { isInPairMonorepo, getKnowledgeHubDatasetPath } from '../helpers'

/**
 * Build update options from UpdateCommandConfig
 */
export function buildUpdateOptions(
  config: UpdateCommandConfig,
  fsService: FileSystemService,
): { source: string; offlineMode: boolean } {
  // Handle based on resolution strategy
  switch (config.resolution) {
    case 'remote':
      return {
        source: config.url,
        offlineMode: false,
      }

    case 'local':
      return {
        source: config.path,
        offlineMode: config.offline,
      }

    case 'default':
      // Default: use monorepo dataset if in pair monorepo, otherwise use release
      if (isInPairMonorepo(fsService)) {
        return {
          source: getKnowledgeHubDatasetPath(fsService),
          offlineMode: false,
        }
      }
      // Release mode - use embedded dataset or error
      return {
        source: '', // Will trigger error in updater if no default
        offlineMode: false,
      }
  }
}
