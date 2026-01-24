/**
 * Backup and rollback utilities for update command
 * Orchestrates BackupService for safe registry updates
 */

import type { BackupService, FileSystemService } from '@pair/content-ops'
import type { LogEntry } from '../diagnostics'

/**
 * Handle backup rollback on error
 * Attempts to restore from backup if auto-rollback is enabled
 * @param backupService BackupService instance
 * @param error Error that triggered rollback
 * @param options Rollback options
 * @param pushLog Logger function
 */
export async function handleBackupRollback(
  backupService: BackupService,
  error: unknown,
  options: { autoRollback: boolean; keepBackup: boolean },
  pushLog: (level: LogEntry['level'], message: string) => void,
): Promise<void> {
  if (!options.autoRollback) {
    return
  }

  try {
    await backupService.rollback(error as Error, options.keepBackup)
  } catch (rollbackErr) {
    pushLog('error', `Rollback failed: ${String(rollbackErr)}`)
  }
}

/**
 * Build registry backup configuration map
 * Creates mapping of registry names to their absolute target paths for backup
 * @param assetRegistries Registry configurations
 * @param fsService FileSystemService for path resolution
 * @returns Map of registry name to backup target path
 */
export function buildRegistryBackupConfig(
  assetRegistries: Record<string, unknown>,
  fsService: FileSystemService,
): Record<string, string> {
  const registryConfig: Record<string, string> = {}

  for (const [registryName, config] of Object.entries(assetRegistries)) {
    const regConfig = config as { target_path?: string }
    const targetPath = regConfig.target_path || registryName
    registryConfig[registryName] = fsService.resolve(targetPath)
  }

  return registryConfig
}

/**
 * Create backup configuration for a single registry
 * @param registryName Name of the registry
 * @param targetPath Target path where registry is installed
 * @returns Backup configuration object
 */
export function createRegistryBackupConfig(
  registryName: string,
  targetPath: string,
): Record<string, string> {
  return {
    [registryName]: targetPath,
  }
}
