import { isGitUrl, isRemoteUrl, isUnsupportedProtocol } from '@pair/content-ops'
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
 * Discriminated union for update command with git source
 */
export interface UpdateCommandConfigGit {
  command: 'update'
  resolution: 'git'
  url: string
  offline: false
  kb: boolean
  target?: string
}

/**
 * Union type for all update command configurations
 */
export type UpdateCommandConfig =
  | UpdateCommandConfigDefault
  | UpdateCommandConfigRemote
  | UpdateCommandConfigGit
  | UpdateCommandConfigLocal

interface ParseUpdateOptions {
  source?: string
  offline?: boolean
  kb?: boolean
}

function resolveSourceConfig(
  source: string,
  kb: boolean,
  offline: boolean,
  target?: string,
): UpdateCommandConfig {
  if (isUnsupportedProtocol(source)) {
    throw new Error(`Unsupported source protocol: ${source}`)
  }
  const optional = target ? { target } : {}
  if (isGitUrl(source)) {
    return { command: 'update', resolution: 'git', url: source, offline: false, kb, ...optional }
  }
  if (isRemoteUrl(source)) {
    return { command: 'update', resolution: 'remote', url: source, offline: false, kb, ...optional }
  }
  return { command: 'update', resolution: 'local', path: source, offline, kb, ...optional }
}

/**
 * Parse update command options into UpdateCommandConfig.
 *
 * Determines resolution strategy based on source parameter:
 * - No source: default resolution (uses configured defaults)
 * - Git URL (git@, *.git, ssh://git@): git clone resolution
 * - Remote URL (http/https): remote resolution
 * - Local path (absolute/relative): local resolution
 */
export function parseUpdateCommand(
  options: ParseUpdateOptions,
  args: string[] = [],
): UpdateCommandConfig {
  validateCommandOptions('update', options)
  const { source, offline = false, kb = true } = options
  const target = args[0]
  if (!source) {
    return {
      command: 'update',
      resolution: 'default',
      offline: false,
      kb,
      ...(target && { target }),
    }
  }
  return resolveSourceConfig(source, kb, offline, target)
}
