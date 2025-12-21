import { detectSourceType, SourceType } from '@pair/content-ops'
import { validateCommandOptions } from '../helpers'

/**
 * Discriminated union for install command with default resolution
 */
export interface InstallCommandConfigDefault {
  command: 'install'
  resolution: 'default'
  offline: false
  kb: boolean
}

/**
 * Discriminated union for install command with remote source
 */
export interface InstallCommandConfigRemote {
  command: 'install'
  resolution: 'remote'
  url: string
  offline: false
  kb: boolean
}

/**
 * Discriminated union for install command with local source
 */
export interface InstallCommandConfigLocal {
  command: 'install'
  resolution: 'local'
  path: string
  offline: boolean
  kb: boolean
}

/**
 * Union type for all install command configurations
 */
export type InstallCommandConfig =
  | InstallCommandConfigDefault
  | InstallCommandConfigRemote
  | InstallCommandConfigLocal

interface ParseInstallOptions {
  source?: string
  offline?: boolean
  kb?: boolean
}

/**
 * Parse install command options into InstallCommandConfig.
 * 
 * Determines resolution strategy based on source parameter:
 * - No source: default resolution (uses monorepo dataset or release ZIP)
 * - Remote URL (http/https): remote resolution
 * - Local path (absolute/relative): local resolution
 * 
 * @param options - Raw CLI options from Commander.js
 * @returns Typed InstallCommandConfig with discriminated union for resolution
 * @throws Error if options validation fails
 */
export function parseInstallCommand(options: ParseInstallOptions): InstallCommandConfig {
  validateCommandOptions('install', options)

  const { source, offline = false, kb = true } = options

  // Default resolution (no source)
  if (!source) {
    return {
      command: 'install',
      resolution: 'default',
      offline: false,
      kb,
    }
  }

  // Remote source
  const sourceType = detectSourceType(source)
  if (sourceType === SourceType.REMOTE_URL) {
    return {
      command: 'install',
      resolution: 'remote',
      url: source,
      offline: false,
      kb,
    }
  }

  // Local source (ZIP or directory)
  return {
    command: 'install',
    resolution: 'local',
    path: source,
    offline,
    kb,
  }
}
