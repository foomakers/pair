import { isRemoteUrl, isUnsupportedProtocol } from '@pair/content-ops'
import { validateCommandOptions } from '#config/cli'

/**
 * Discriminated union for update command with default resolution
 */
export interface UpdateCommandConfigDefault {
  command: 'update'
  resolution: 'default'
  offline: false
  kb: boolean
  target?: string
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
  target?: string
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
  target?: string
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
 * @param args - Positional arguments from Commander.js
 * @returns Typed UpdateCommandConfig with discriminated union for resolution
 * @throws Error if options validation fails
 */
export function parseUpdateCommand(
  options: ParseUpdateOptions,
  args: string[] = [],
): UpdateCommandConfig {
  validateCommandOptions('update', options)

  const { source, offline = false, kb = true } = options
  const target = args[0]

  // Default resolution (no source)
  if (!source) {
    return {
      command: 'update',
      resolution: 'default',
      offline: false,
      kb,
      ...(target && { target }),
    }
  }

  // Reject unsupported protocols early
  if (isUnsupportedProtocol(source)) {
    throw new Error(`Unsupported source protocol: ${source}`)
  }

  // Remote source
  if (isRemoteUrl(source)) {
    return {
      command: 'update',
      resolution: 'remote',
      url: source,
      offline: false,
      kb,
      ...(target && { target }),
    }
  }

  // Local source (ZIP or directory)
  return {
    command: 'update',
    resolution: 'local',
    path: source,
    offline,
    kb,
    ...(target && { target }),
  }
}
