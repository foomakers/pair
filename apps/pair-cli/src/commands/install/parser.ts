import { validateCommandOptions } from '#config/cli'
import { isRemoteUrl, isUnsupportedProtocol } from '@pair/content-ops'

/**
 * Discriminated union for install command with default resolution
 */
export interface InstallCommandConfigDefault {
  command: 'install'
  resolution: 'default'
  offline: false
  kb: boolean
  target?: string
  skipVerify?: boolean
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
  target?: string
  skipVerify?: boolean
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
  target?: string
  skipVerify?: boolean
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
  skipVerify?: boolean
}

/* eslint-disable complexity */
/**
 * Parse install command options into InstallCommandConfig.
 *
 * Determines resolution strategy based on source parameter:
 * - No source: default resolution (uses monorepo dataset or release ZIP)
 * - Remote URL (http/https): remote resolution
 * - Local path (absolute/relative): local resolution
 *
 * @param options - Raw CLI options from Commander.js
 * @param args - Positional arguments from Commander.js
 * @returns Typed InstallCommandConfig with discriminated union for resolution
 * @throws Error if options validation fails
 */
export function parseInstallCommand(
  options: ParseInstallOptions,
  args: string[] = [],
): InstallCommandConfig {
  validateCommandOptions('install', options)

  const { source, offline = false, kb = true, skipVerify = false } = options
  const target = args[0]

  // Default resolution (no source)
  if (!source) {
    return {
      command: 'install',
      resolution: 'default',
      offline: false,
      kb,
      ...(target && { target }),
      ...(skipVerify && { skipVerify }),
    }
  }

  // Reject unsupported protocols early
  if (isUnsupportedProtocol(source)) {
    throw new Error(`Unsupported source protocol: ${source}`)
  }

  // Remote source
  if (isRemoteUrl(source)) {
    return {
      command: 'install',
      resolution: 'remote',
      url: source,
      offline: false,
      kb,
      ...(target && { target }),
      ...(skipVerify && { skipVerify }),
    }
  }

  // Local source (ZIP or directory)
  return {
    command: 'install',
    resolution: 'local',
    path: source,
    offline,
    kb,
    ...(target && { target }),
    ...(skipVerify && { skipVerify }),
  }
}
