import { detectSourceType, SourceType } from '@pair/content-ops'
import { validateCommandOptions } from '../command-utils'

/**
 * Discriminated union for update command with default resolution
 */
export interface UpdateCommandConfigDefault {
  command: 'update'
  resolution: 'default'
  offline: false
  kb: boolean
}

/**
 * Discriminated union for update command with remote source
 */
export interface UpdateCommandConfigRemote {
  command: 'update'
  resolution: 'remote'
  url: string
  offline: false
  kb: boolean
}

/**
 * Discriminated union for update command with local source
 */
export interface UpdateCommandConfigLocal {
  command: 'update'
  resolution: 'local'
  path: string
  offline: boolean
  kb: boolean
}

/**
 * Union type for all update command configurations
 */
export type UpdateCommandConfig =
  | UpdateCommandConfigDefault
  | UpdateCommandConfigRemote
  | UpdateCommandConfigLocal

interface ParseUpdateOptions {
  source?: string
  offline?: boolean
  kb?: boolean
}

/**
 * Parse update command options into UpdateCommandConfig.
 *
 * Determines resolution strategy based on source parameter:
 * - No source: default resolution (uses configured defaults)
 * - Remote URL (http/https): remote resolution
 * - Local path (absolute/relative): local resolution
 *
 * @param options - Raw CLI options from Commander.js
 * @returns Typed UpdateCommandConfig with discriminated union for resolution
 * @throws Error if options validation fails
 */
export function parseUpdateCommand(options: ParseUpdateOptions): UpdateCommandConfig {
  validateCommandOptions('update', options)

  const { source, offline = false, kb = true } = options

  // Default resolution (no source)
  if (!source) {
    return {
      command: 'update',
      resolution: 'default',
      offline: false,
      kb,
    }
  }

  // Remote source
  const sourceType = detectSourceType(source)
  if (sourceType === SourceType.REMOTE_URL) {
    return {
      command: 'update',
      resolution: 'remote',
      url: source,
      offline: false,
      kb,
    }
  }

  // Local source (ZIP or directory)
  return {
    command: 'update',
    resolution: 'local',
    path: source,
    offline,
    kb,
  }
}
