/**
 * Backup and rollback utilities for registry operations.
 * Orchestrates BackupService for safe registry modifications.
 */

import type { BackupService, FileSystemService } from '@pair/content-ops'
import { LogEntry } from '../diagnostics'

/**
 * Handle backup rollback on error
 * Attempts to restore from backup if auto-rollback is enabled
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
 */
export function createRegistryBackupConfig(
  registryName: string,
  targetPath: string,
): Record<string, string> {
  return {
    [registryName]: targetPath,
  }
}
