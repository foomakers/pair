/**
 * Backup and rollback utilities for registry operations.
 * Orchestrates BackupService for safe registry modifications.
 */

import type { BackupService } from '@pair/content-ops'
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
