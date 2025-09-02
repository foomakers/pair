import { Behavior } from './behavior'

/**
 * Options for controlling file move/copy operations
 */

export type SyncOptions = {
  /** Default behavior for file operations */
  defaultBehavior?: Behavior
  /** Folder-specific behaviors */
  folderBehavior?: Record<string, Behavior>
  /** Maximum number of concurrent file operations */
  concurrencyLimit?: number
  /** Retry configuration for failed I/O operations */
  retryAttempts?: number
  /** Delay between retry attempts in milliseconds */
  retryDelay?: number
}
