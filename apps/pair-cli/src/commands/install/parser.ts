import { detectSourceType, validateCommandOptions } from '../helpers'

/**
 * Discriminated union for install command with default resolution
 */
export interface InstallCommandConfigDefault {
  command: 'install'
  resolution: 'default'
  offline: false
}

/**
 * Discriminated union for install command with remote source
 */
export interface InstallCommandConfigRemote {
  command: 'install'
  resolution: 'remote'
  url: string
  offline: false
}

/**
 * Discriminated union for install command with local source
 */
export interface InstallCommandConfigLocal {
  command: 'install'
  resolution: 'local'
  path: string
  offline: boolean
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
}

/**
 * Parse install command options into InstallCommandConfig
 */
export function parseInstallCommand(options: ParseInstallOptions): InstallCommandConfig {
  validateCommandOptions('install', options)

  const { source, offline = false } = options

  // Default resolution (no source)
  if (!source) {
    return {
      command: 'install',
      resolution: 'default',
      offline: false,
    }
  }

  // Remote source
  if (detectSourceType(source) === 'remote') {
    return {
      command: 'install',
      resolution: 'remote',
      url: source,
      offline: false,
    }
  }

  // Local source
  return {
    command: 'install',
    resolution: 'local',
    path: source,
    offline,
  }
}
