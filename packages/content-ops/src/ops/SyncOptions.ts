import { Behavior, TargetConfig } from './behavior'

/**
 * Options for controlling file move/copy operations
 */

export type SyncOptions = {
  /** Default behavior for file operations */
  defaultBehavior: Behavior
  /** Folder-specific behaviors (derived from include + behavior) */
  folderBehavior?: Record<string, Behavior>
  /** Maximum number of concurrent file operations */
  concurrencyLimit: number
  /** Retry configuration for failed I/O operations */
  retryAttempts: number
  /** Delay between retry attempts in milliseconds */
  retryDelay: number
  /** Folders to include when behavior is mirror (empty = include all) */
  include: string[]
  /** Flatten directory hierarchy into hyphen-separated names */
  flatten: boolean
  /** Prefix to prepend to top-level directory names */
  prefix?: string
  /** Target configurations for multi-target distribution (empty array = no targets) */
  targets: TargetConfig[]
}

export function defaultSyncOptions(): SyncOptions {
  return {
    defaultBehavior: 'overwrite',
    concurrencyLimit: 10,
    retryAttempts: 3,
    retryDelay: 100,
    include: [],
    flatten: false,
    targets: [],
  }
}
