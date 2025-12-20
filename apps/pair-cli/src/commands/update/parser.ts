import { detectSourceType, SourceType } from '@pair/content-ops'
import { validateCommandOptions } from '../helpers'

/**
 * Discriminated union for update command with default resolution
 */
export interface UpdateCommandConfigDefault {
  command: 'update'
  resolution: 'default'
  offline: false
}

/**
 * Discriminated union for update command with remote source
 */
export interface UpdateCommandConfigRemote {
  command: 'update'
  resolution: 'remote'
  url: string
  offline: false
}

/**
 * Discriminated union for update command with local source
 */
export interface UpdateCommandConfigLocal {
  command: 'update'
  resolution: 'local'
  path: string
  offline: boolean
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
}

/**
 * Parse update command options into UpdateCommandConfig
 */
export function parseUpdateCommand(options: ParseUpdateOptions): UpdateCommandConfig {
  validateCommandOptions('update', options)

  const { source, offline = false } = options

  // Default resolution (no source)
  if (!source) {
    return {
      command: 'update',
      resolution: 'default',
      offline: false,
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
    }
  }

  // Local source (ZIP or directory)
  return {
    command: 'update',
    resolution: 'local',
    path: source,
    offline,
  }
}
